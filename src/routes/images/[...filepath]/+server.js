import { error } from '@sveltejs/kit';
import { Readable } from 'node:stream';
import path from 'node:path';
import mime from 'mime';
import {
  getUploadObject,
  putUploadObject,
  statUploadObject
} from '$lib/server/minioStorage.js';

const THUMBNAIL_SIZES = new Set([40, 64, 80, 96, 128, 160, 200, 256]);

/** @param {string} filepath */
function safeObjectKey(filepath) {
  if (!filepath || filepath.includes('\0') || filepath.startsWith('/')) return null;
  const normalized = path.posix.normalize(filepath);
  if (
    normalized === '.' ||
    normalized === '..' ||
    normalized.startsWith('../') ||
    normalized !== filepath
  ) {
    return null;
  }
  return normalized;
}

/**
 * @param {string | null} header
 * @param {number} size
 */
function parseRange(header, size) {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match || (!match[1] && !match[2])) throw error(416, '잘못된 범위 요청입니다.');

  let start;
  let end;
  if (!match[1]) {
    const suffixLength = Number(match[2]);
    if (!Number.isSafeInteger(suffixLength) || suffixLength <= 0) {
      throw error(416, '잘못된 범위 요청입니다.');
    }
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Number(match[2]) : size - 1;
  }

  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    start >= size ||
    end < start
  ) {
    throw error(416, '요청 범위를 만족할 수 없습니다.');
  }
  end = Math.min(end, size - 1);
  return { start, end, length: end - start + 1 };
}

/** @param {string} fileName */
function contentDisposition(fileName) {
  const asciiFileName = fileName.replace(/[^A-Za-z0-9_.-]/g, '_');
  return `inline; filename="${asciiFileName}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

/** @param {string} requestUrl */
function thumbnailSize(requestUrl) {
  const value = new URL(requestUrl).searchParams.get('thumbnail');
  if (value === null) return null;
  const size = Number(value);
  if (!Number.isInteger(size) || !THUMBNAIL_SIZES.has(size)) {
    throw error(400, '지원하지 않는 썸네일 크기입니다.');
  }
  return size;
}

/** @param {string | null | undefined} etag */
function normalizeEtag(etag) {
  if (!etag) return '';
  return String(etag).replace(/^"|"$/g, '');
}

/**
 * @param {string} objectKey
 * @param {number} size
 */
function thumbnailObjectKey(objectKey, size) {
  return `${objectKey}.thumb${size}.webp`;
}

/** @param {unknown} err */
function isMissingObject(err) {
  return (
    !!err &&
    typeof err === 'object' &&
    'code' in err &&
    ['NoSuchKey', 'NotFound', 'NoSuchObject'].includes(String(err.code))
  );
}

/**
 * @param {string} objectKey
 * @param {number} size
 * @param {number} length
 * @param {string} sourceEtag
 */
function thumbnailHeaders(objectKey, size, length, sourceEtag) {
  /** @type {Record<string, string>} */
  const headers = {
    'Content-Type': 'image/webp',
    'Content-Length': String(length),
    'Cache-Control': 'public, max-age=31536000, immutable',
    'Content-Disposition': contentDisposition(`${path.posix.parse(objectKey).name}.webp`),
    'X-Content-Type-Options': 'nosniff'
  };
  if (sourceEtag) {
    headers.ETag = `"${sourceEtag}-thumb-${size}"`;
  }
  return headers;
}

/** @param {import('node:stream').Readable} stream */
async function streamBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/** @param {{ params: { filepath: string } }} event */
export async function HEAD({ params }) {
  const objectKey = safeObjectKey(params.filepath);
  if (!objectKey) throw error(403, '접근이 거부되었습니다.');

  try {
    const metadata = await statUploadObject(objectKey);
    const originalFileName = metadata.originalFileName || path.posix.basename(objectKey);
    const contentType =
      metadata.contentType || mime.getType(originalFileName) || 'application/octet-stream';

    return new Response(null, {
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(metadata.size),
        'Content-Disposition': contentDisposition(originalFileName),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  } catch (err) {
    if (isMissingObject(err)) {
      throw error(404, '파일을 찾을 수 없습니다.');
    }
    throw err;
  }
}

/**
 * 정적 이미지/비디오 파일 서빙
 * @param {{ params: { filepath: string }, request: Request }} event - 요청 파라미터
 * @returns {Promise<Response>} 파일 응답
 */
export async function GET({ params, request }) {
  try {
    const { filepath } = params;
    const objectKey = safeObjectKey(filepath);
    if (!objectKey) {
      console.error('Path traversal attempt:', filepath);
      throw error(403, '접근이 거부되었습니다.');
    }

    const requestedRange = request.headers.get('range');
    const metadata = await statUploadObject(objectKey);
    const requestedThumbnailSize = thumbnailSize(request.url);
    const sourceEtag = normalizeEtag(metadata.etag);

    if (requestedThumbnailSize) {
      const contentType =
        metadata.contentType ||
        mime.getType(metadata.originalFileName || objectKey) ||
        'application/octet-stream';
      if (!contentType.startsWith('image/')) {
        throw error(415, '이미지 파일만 썸네일로 변환할 수 있습니다.');
      }

      const thumbKey = thumbnailObjectKey(objectKey, requestedThumbnailSize);
      try {
        const cachedMeta = await statUploadObject(thumbKey);
        if (normalizeEtag(cachedMeta.sourceEtag) === sourceEtag && sourceEtag) {
          const cached = await getUploadObject(thumbKey, undefined, cachedMeta);
          const cachedBody = await streamBuffer(cached.stream);
          return new Response(cachedBody, {
            headers: thumbnailHeaders(
              objectKey,
              requestedThumbnailSize,
              cachedBody.length,
              sourceEtag
            )
          });
        }
      } catch (err) {
        if (!isMissingObject(err)) throw err;
      }

      const object = await getUploadObject(objectKey, undefined, metadata);
      const sharp = (await import('sharp')).default;
      const thumbnail = await sharp(await streamBuffer(object.stream), { animated: true })
        .rotate()
        .resize(requestedThumbnailSize, requestedThumbnailSize, { fit: 'cover' })
        .webp({ quality: 80, effort: 3 })
        .toBuffer();

      try {
        await putUploadObject({
          key: thumbKey,
          body: thumbnail,
          contentType: 'image/webp',
          originalFileName: `${path.posix.parse(objectKey).name}.webp`,
          uploader: 'system:thumbnail',
          uploadedAt: new Date(),
          sourceEtag
        });
      } catch (err) {
        console.error('Failed to persist thumbnail cache:', err);
      }

      return new Response(thumbnail, {
        headers: thumbnailHeaders(
          objectKey,
          requestedThumbnailSize,
          thumbnail.length,
          sourceEtag
        )
      });
    }

    const range = parseRange(requestedRange, metadata.size);
    const object = await getUploadObject(
      objectKey,
      range ? { offset: range.start, length: range.length } : undefined,
      metadata
    );

    const contentType =
      object.contentType ||
      mime.getType(object.originalFileName || objectKey) ||
      'application/octet-stream';
    const responseLength = range?.length ?? object.size;
    const originalFileName = object.originalFileName || path.posix.basename(objectKey);
    /** @type {Record<string, string>} */
    const headers = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Content-Length': String(responseLength),
      'Content-Disposition': contentDisposition(originalFileName),
      'Accept-Ranges': 'bytes',
      'X-Content-Type-Options': 'nosniff'
    };
    if (object.etag) headers.ETag = `"${normalizeEtag(object.etag)}"`;
    if (object.lastModified) headers['Last-Modified'] = new Date(object.lastModified).toUTCString();
    if (range) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${object.size}`;

    if (contentType === 'application/pdf') {
      headers['Content-Security-Policy'] =
        "sandbox; default-src 'none'; style-src 'unsafe-inline'; img-src data: blob:";
    }

    return new Response(Readable.toWeb(object.stream), {
      status: range ? 206 : 200,
      headers
    });
  } catch (err) {
    console.error('Error serving file:', err);
    if (isMissingObject(err)) {
      throw error(404, '파일을 찾을 수 없습니다.');
    }
    throw err;
  }
}
