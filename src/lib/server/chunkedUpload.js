import { createHash } from 'node:crypto';
import { createReadStream, createWriteStream, openAsBlob } from 'node:fs';
import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';

import { error } from '@sveltejs/kit';

import { BOARD_UPLOAD_CHUNK_BYTES, BOARD_UPLOAD_SOURCE_MAX_BYTES } from '#lib/util/uploadLimits.js';

// Unfinished uploads older than this are removed on the next upload start.
export const CHUNKED_UPLOAD_TTL_MS = 60 * 60 * 1000;

const UPLOAD_ID_PATTERN = /^[A-Za-z0-9-]{16,64}$/;
const MAX_NAME_LENGTH = 255;

/** @param {string} [root] */
function resolveRoot(root) {
  return root ?? path.join(tmpdir(), 'dgst-chunked-uploads');
}

/** @param {string} email */
function ownerHash(email) {
  return createHash('sha256').update(email).digest('hex');
}

/** @param {unknown} value */
function toInteger(value) {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(n) ? n : NaN;
}

/** @param {string} uploadId @param {string} root */
function uploadDir(uploadId, root) {
  if (typeof uploadId !== 'string' || !UPLOAD_ID_PATTERN.test(uploadId)) {
    throw error(400, '잘못된 업로드 요청입니다.');
  }
  return path.join(root, uploadId);
}

/** @param {number} totalSize */
export function expectedChunkCount(totalSize) {
  return Math.ceil(totalSize / BOARD_UPLOAD_CHUNK_BYTES);
}

/** @param {number} index @param {number} totalSize */
export function expectedChunkSize(index, totalSize) {
  const count = expectedChunkCount(totalSize);
  return index < count - 1
    ? BOARD_UPLOAD_CHUNK_BYTES
    : totalSize - BOARD_UPLOAD_CHUNK_BYTES * (count - 1);
}

/** @param {string} root @param {number} now */
async function purgeStaleUploads(root, now) {
  let entries;
  try {
    entries = await readdir(root);
  } catch {
    return;
  }
  await Promise.all(
    entries.map(async (entry) => {
      const dir = path.join(root, entry);
      try {
        const info = await stat(dir);
        if (now - info.mtimeMs > CHUNKED_UPLOAD_TTL_MS)
          await rm(dir, { recursive: true, force: true });
      } catch {
        // Another request may have removed it already.
      }
    })
  );
}

/**
 * @typedef {{ owner: string, name: string, type: string, totalSize: number, totalChunks: number }} ChunkedUploadMeta
 */

/** @param {string} dir @returns {Promise<ChunkedUploadMeta | null>} */
async function readMeta(dir) {
  try {
    return JSON.parse(await readFile(path.join(dir, 'meta.json'), 'utf8'));
  } catch {
    return null;
  }
}

/**
 * Store one chunk of a large upload. Chunk 0 starts the upload; later chunks must
 * come from the same user with the same file description.
 *
 * @param {{ uploadId: string, index: unknown, totalChunks: unknown, totalSize: unknown, name: unknown, type: unknown, email: string, body: Uint8Array, root?: string, now?: number }} input
 */
export async function receiveChunk(input) {
  const root = resolveRoot(input.root);
  const dir = uploadDir(input.uploadId, root);
  const index = toInteger(input.index);
  const totalChunks = toInteger(input.totalChunks);
  const totalSize = toInteger(input.totalSize);
  const name = typeof input.name === 'string' ? input.name : '';
  const type = typeof input.type === 'string' ? input.type.slice(0, 100) : '';

  if (!name || name.length > MAX_NAME_LENGTH) throw error(400, '잘못된 파일 이름입니다.');
  if (!(totalSize > 0)) throw error(400, '잘못된 업로드 요청입니다.');
  if (totalSize > BOARD_UPLOAD_SOURCE_MAX_BYTES) {
    throw error(
      413,
      `압축 전 원본은 ${BOARD_UPLOAD_SOURCE_MAX_BYTES / 1024 / 1024}MB 이하만 처리할 수 있어요.`
    );
  }
  if (totalChunks !== expectedChunkCount(totalSize) || !(index >= 0 && index < totalChunks)) {
    throw error(400, '잘못된 업로드 요청입니다.');
  }
  if (input.body.byteLength !== expectedChunkSize(index, totalSize)) {
    throw error(400, '업로드 조각 크기가 맞지 않습니다.');
  }

  const owner = ownerHash(input.email);
  /** @type {ChunkedUploadMeta} */
  const meta = { owner, name, type, totalSize, totalChunks };
  let existing = await readMeta(dir);

  if (!existing) {
    if (index !== 0) throw error(404, '업로드를 찾을 수 없습니다. 처음부터 다시 시도해 주세요.');
    await purgeStaleUploads(root, input.now ?? Date.now());
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta), { flag: 'wx' }).catch(
      async (err) => {
        if (err?.code !== 'EEXIST') throw err;
      }
    );
    existing = await readMeta(dir);
  }

  if (!existing || existing.owner !== owner) throw error(403, '업로드 권한이 없습니다.');
  if (
    existing.name !== name ||
    existing.type !== type ||
    existing.totalSize !== totalSize ||
    existing.totalChunks !== totalChunks
  ) {
    throw error(409, '업로드 정보가 맞지 않습니다. 처음부터 다시 시도해 주세요.');
  }

  const partPath = path.join(dir, `${index}.part`);
  const tempPath = `${partPath}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tempPath, input.body);
  await rename(tempPath, partPath);

  return { received: index + 1, totalChunks };
}

/**
 * Join all chunks into one file. The returned File reads from disk, so call
 * `cleanup()` only after the file has been consumed.
 *
 * @param {{ uploadId: string, email: string, root?: string }} input
 */
export async function assembleUpload(input) {
  const root = resolveRoot(input.root);
  const dir = uploadDir(input.uploadId, root);
  const meta = await readMeta(dir);
  if (!meta) throw error(404, '업로드를 찾을 수 없습니다. 처음부터 다시 시도해 주세요.');
  if (meta.owner !== ownerHash(input.email)) throw error(403, '업로드 권한이 없습니다.');

  const cleanup = () => rm(dir, { recursive: true, force: true });

  for (let index = 0; index < meta.totalChunks; index++) {
    const size = await stat(path.join(dir, `${index}.part`)).then(
      (info) => info.size,
      () => -1
    );
    if (size !== expectedChunkSize(index, meta.totalSize)) {
      throw error(400, '업로드가 끝나지 않았습니다. 다시 시도해 주세요.');
    }
  }

  const assembledPath = path.join(dir, 'assembled');
  const out = createWriteStream(assembledPath);
  try {
    for (let index = 0; index < meta.totalChunks; index++) {
      await pipeline(createReadStream(path.join(dir, `${index}.part`)), out, { end: false });
    }
  } finally {
    await new Promise((resolve, reject) =>
      out.end((/** @type {unknown} */ err) => (err ? reject(err) : resolve(undefined)))
    );
  }
  await Promise.all(
    Array.from({ length: meta.totalChunks }, (_, index) =>
      rm(path.join(dir, `${index}.part`), { force: true })
    )
  );

  const blob = await openAsBlob(assembledPath, { type: meta.type });
  const file = new File([blob], meta.name, { type: meta.type });
  return { file, cleanup };
}
