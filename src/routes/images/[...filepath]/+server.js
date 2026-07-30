import { error } from '@sveltejs/kit';
import { Readable } from 'node:stream';
import path from 'node:path';
import mime from 'mime';
import { getUploadObject, statUploadObject } from '$lib/server/minioStorage.js';

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
      'Cache-Control': 'public, max-age=31536000',
      'Content-Length': String(responseLength),
      'Content-Disposition': contentDisposition(originalFileName),
      'Accept-Ranges': 'bytes',
      'X-Content-Type-Options': 'nosniff'
    };
    if (object.etag) headers.ETag = `"${String(object.etag).replace(/^"|"$/g, '')}"`;
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
    if (
      err &&
      typeof err === 'object' &&
      'code' in err &&
      ['NoSuchKey', 'NotFound', 'NoSuchObject'].includes(String(err.code))
    ) {
      throw error(404, '파일을 찾을 수 없습니다.');
    }
    throw err;
  }
}
