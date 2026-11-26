import { mkdtemp, readdir, rm, utimes } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  assembleUpload,
  CHUNKED_UPLOAD_TTL_MS,
  expectedChunkCount,
  expectedChunkSize,
  receiveChunk
} from '../src/lib/server/chunkedUpload.js';
import {
  BOARD_UPLOAD_CHUNK_BYTES,
  BOARD_UPLOAD_SOURCE_MAX_BYTES
} from '../src/lib/util/uploadLimits.js';

const UPLOAD_ID = '0f8fad5b-d9cb-469f-a165-70867728950e';
const EMAIL = 'uploader@example.com';

/** @param {number} size @param {number} seed */
function bytes(size, seed) {
  const out = new Uint8Array(size);
  for (let i = 0; i < size; i++) out[i] = (i + seed) % 251;
  return out;
}

/** @param {unknown} promise @param {number} status */
async function expectStatus(promise, status) {
  await expect(promise).rejects.toMatchObject({ status });
}

describe('chunked board upload', () => {
  /** @type {string} */
  let root;
  const totalSize = BOARD_UPLOAD_CHUNK_BYTES * 2 + 1234;
  const totalChunks = 3;

  beforeEach(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'chunked-upload-test-'));
  });
  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  /** @param {number} index @param {Partial<Parameters<typeof receiveChunk>[0]>} [overrides] */
  function chunk(index, overrides = {}) {
    return receiveChunk({
      uploadId: UPLOAD_ID,
      index,
      totalChunks,
      totalSize,
      name: 'clip.mp4',
      type: 'video/mp4',
      email: EMAIL,
      body: bytes(expectedChunkSize(index, totalSize), index),
      root,
      ...overrides
    });
  }

  it('computes chunk counts and the short last chunk', () => {
    expect(expectedChunkCount(totalSize)).toBe(3);
    expect(expectedChunkSize(0, totalSize)).toBe(BOARD_UPLOAD_CHUNK_BYTES);
    expect(expectedChunkSize(2, totalSize)).toBe(1234);
    expect(expectedChunkCount(BOARD_UPLOAD_CHUNK_BYTES)).toBe(1);
  });

  it('joins chunks in order into a File and cleans up afterwards', async () => {
    await chunk(0);
    await chunk(2);
    await chunk(1);
    const { file, cleanup } = await assembleUpload({ uploadId: UPLOAD_ID, email: EMAIL, root });
    expect(file.name).toBe('clip.mp4');
    expect(file.type).toBe('video/mp4');
    expect(file.size).toBe(totalSize);
    const data = new Uint8Array(await file.arrayBuffer());
    expect(data.subarray(0, 4)).toEqual(bytes(4, 0));
    expect(data.subarray(BOARD_UPLOAD_CHUNK_BYTES, BOARD_UPLOAD_CHUNK_BYTES + 4)).toEqual(
      bytes(4, 1)
    );
    expect(data.subarray(BOARD_UPLOAD_CHUNK_BYTES * 2, BOARD_UPLOAD_CHUNK_BYTES * 2 + 4)).toEqual(
      bytes(4, 2)
    );
    await cleanup();
    expect(await readdir(root)).toEqual([]);
  });

  it('accepts a retried chunk', async () => {
    await chunk(0);
    await chunk(0);
    await chunk(1);
    await chunk(1);
    await chunk(2);
    const { file, cleanup } = await assembleUpload({ uploadId: UPLOAD_ID, email: EMAIL, root });
    expect(file.size).toBe(totalSize);
    await cleanup();
  });

  it('refuses to assemble before every chunk has arrived', async () => {
    await chunk(0);
    await chunk(2);
    await expectStatus(assembleUpload({ uploadId: UPLOAD_ID, email: EMAIL, root }), 400);
  });

  it('keeps other users out of an upload', async () => {
    await chunk(0);
    await expectStatus(chunk(1, { email: 'other@example.com' }), 403);
    await expectStatus(
      assembleUpload({ uploadId: UPLOAD_ID, email: 'other@example.com', root }),
      403
    );
  });

  it('rejects a later chunk whose file description changed', async () => {
    await chunk(0);
    await expectStatus(chunk(1, { name: 'other.mp4' }), 409);
  });

  it('requires chunk 0 to start the upload', async () => {
    await expectStatus(chunk(1), 404);
  });

  it('validates ids, sizes and counts', async () => {
    await expectStatus(chunk(0, { uploadId: '../../etc' }), 400);
    await expectStatus(chunk(0, { body: bytes(10, 0) }), 400);
    await expectStatus(chunk(0, { totalChunks: 4 }), 400);
    await expectStatus(chunk(3), 400);
    await expectStatus(
      chunk(0, {
        totalSize: BOARD_UPLOAD_SOURCE_MAX_BYTES + 1,
        totalChunks: expectedChunkCount(BOARD_UPLOAD_SOURCE_MAX_BYTES + 1)
      }),
      413
    );
  });

  it('removes stale unfinished uploads when a new one starts', async () => {
    await chunk(0);
    const old = new Date(Date.now() - CHUNKED_UPLOAD_TTL_MS - 60_000);
    await utimes(path.join(root, UPLOAD_ID), old, old);
    await receiveChunk({
      uploadId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      index: 0,
      totalChunks: 1,
      totalSize: 10,
      name: 'a.mp4',
      type: 'video/mp4',
      email: EMAIL,
      body: bytes(10, 0),
      root
    });
    expect(await readdir(root)).toEqual(['aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee']);
  });
});
