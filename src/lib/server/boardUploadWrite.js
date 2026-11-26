import { write } from '#lib/util/fileUpload.js';
import logger from '#lib/util/logger.js';

/** @param {unknown} value */
function parseOptionalJsonField(value) {
  if (typeof value !== 'string' || !value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return { parseError: true, raw: value.slice(0, 500) };
  }
}

/**
 * Store one board upload. Used by the single-request and the chunked upload routes.
 *
 * @param {{ file: File, email: string, getField: (name: string) => unknown, request: Request, chunked?: boolean }} input
 */
export async function writeBoardUpload({ file, email, getField, request, chunked = false }) {
  const serverCompressVideo = getField('serverCompressVideo') === 'true';
  const removeVideoAudio = getField('removeVideoAudio') === 'true';
  const extractVideoAudio = getField('extractVideoAudio') === 'true';
  const serverCompressVideoReason = String(getField('serverCompressVideoReason') || '');
  const serverCompressVideoClient = parseOptionalJsonField(getField('serverCompressVideoClient'));
  const serverCompressVideoWebCodecs = parseOptionalJsonField(
    getField('serverCompressVideoWebCodecs')
  );
  const serverCompressVideoContext = serverCompressVideo
    ? {
        reason: serverCompressVideoReason || 'unknown',
        removeVideoAudio,
        extractVideoAudio,
        client: serverCompressVideoClient,
        webCodecs: serverCompressVideoWebCodecs,
        requestUserAgent: request.headers.get('user-agent'),
        requestReferer: request.headers.get('referer'),
        requestUrl: request.url
      }
    : undefined;

  logger.info({
    message: 'Image upload request',
    fileName: file.name,
    fileSize: file.size,
    fileType: file.type,
    chunked,
    serverCompressVideo,
    removeVideoAudio,
    extractVideoAudio,
    serverCompressVideoContext,
    user: email
  });

  if (serverCompressVideo) {
    logger.warn({
      message: 'Server video compression upload requested',
      fileName: file.name,
      fileSize: file.size,
      fileType: file.type,
      removeVideoAudio,
      extractVideoAudio,
      serverCompressVideoContext,
      user: email
    });
  }

  const res = await write(file, email, 'jjal', {
    compressVideo: serverCompressVideo,
    removeVideoAudio,
    extractVideoAudio,
    serverCompressVideoContext,
    returnMetadata: true
  });
  const responseBody =
    typeof res === 'string'
      ? { url: res }
      : {
          url: res.url,
          previewUrl: res.previewUrl,
          pageCount: res.pageCount
        };

  logger.info({
    message: 'Image upload success',
    fileName: file.name,
    url: responseBody.url,
    chunked,
    user: email
  });

  return responseBody;
}
