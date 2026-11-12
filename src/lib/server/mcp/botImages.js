import sharp from 'sharp';
import { getUploadObject, statUploadObject } from '$lib/server/minioStorage.js';
import logger from '$lib/util/logger.js';

/** 봇에게 보여줄 이미지: 사이트에 올라간 이미지(/images/...)만, 긴 변 1024px JPEG로 줄여서. */

const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

/**
 * 본문 HTML의 <img src>에서 사이트 이미지 경로만 뽑는다. 외부 이미지는 받지 않는다.
 * @param {string} html
 * @returns {string[]}
 */
export function siteImagePaths(html) {
  /** @type {string[]} */
  const out = [];
  for (const m of String(html ?? '').matchAll(/<img\b[^>]*\bsrc="([^"]+)"/gi)) {
    const src = toSiteImagePath(m[1]);
    if (src && !out.includes(src)) out.push(src);
  }
  return out;
}

/**
 * @param {string | null | undefined} src
 * @returns {string | null}
 */
export function toSiteImagePath(src) {
  const p = String(src ?? '').replace(/^https:\/\/(www\.)?dgst\.me/, '');
  return /^\/images\/[\w\-./%]+$/.test(p) && !p.includes('..') ? p : null;
}

/**
 * @param {import('node:stream').Readable} stream
 * @param {number} limit
 */
async function readAll(stream, limit) {
  /** @type {Buffer[]} */
  const chunks = [];
  let total = 0;
  for await (const chunk of stream) {
    total += chunk.length;
    if (total > limit) {
      stream.destroy();
      throw new Error('image too large');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * @param {string} imagePath /images/... 경로
 * @returns {Promise<string | null>} base64 JPEG
 */
export async function loadImageForModel(imagePath) {
  const key = imagePath.replace(/^\/images\//, '');
  try {
    const stat = await statUploadObject(key);
    if (!stat.contentType.startsWith('image/') || stat.size > MAX_IMAGE_BYTES) return null;
    const { stream } = await getUploadObject(key, undefined, stat);
    const buf = await readAll(stream, MAX_IMAGE_BYTES);
    const jpeg = await sharp(buf, { animated: false })
      .rotate()
      .resize({ width: 1024, height: 1024, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 80 })
      .toBuffer();
    return jpeg.toString('base64');
  } catch (err) {
    logger.warn({
      message: '[mcp] image load failed',
      imagePath,
      errorMessage: err instanceof Error ? err.message : String(err)
    });
    return null;
  }
}
