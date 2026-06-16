import { json } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';

import { write } from '$lib/util/fileUpload.js';
import logger from '$lib/util/logger.js';
import { BOARD_UPLOAD_MAX_MB } from '$lib/util/uploadLimits.js';

/** @param {unknown} err */
function getErrorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

/** @param {unknown} err */
function isBodySizeLimitError(err) {
  const message = getErrorMessage(err);
  return (
    /Content-length of \d+ exceeds limit of \d+ bytes/i.test(message) ||
    /request body size exceeded/i.test(message)
  );
}

/** @param {FormDataEntryValue | null} value */
function parseOptionalJsonField(value) {
  if (typeof value !== 'string' || !value) return undefined;
  try {
    return JSON.parse(value);
  } catch {
    return { parseError: true, raw: value.slice(0, 500) };
  }
}

export async function POST({ request, locals }) {
  const session = await locals.auth();
  const email = typeof session?.user?.email === 'string' ? session.user.email : '';

  if (!session?.user?.nickname || !email) {
    logger.warn({
      message: 'Image upload failed - unauthorized',
      pathname: request.url,
      user: email || 'anonymous'
    });
    throw error(401, { message: '로그인 해 주세요' });
  }

  /** @type {File | null} */
  let uploadFile = null;
  try {
    const data = await request.formData();
    const upload = data.get('upload');
    if (!(upload instanceof File)) {
      throw error(400, { message: '업로드할 파일이 없습니다.' });
    }
    uploadFile = upload;
    const serverCompressVideo = data.get('serverCompressVideo') === 'true';
    const removeVideoAudio = data.get('removeVideoAudio') === 'true';
    const serverCompressVideoReason = String(data.get('serverCompressVideoReason') || '');
    const serverCompressVideoClient = parseOptionalJsonField(data.get('serverCompressVideoClient'));
    const serverCompressVideoWebCodecs = parseOptionalJsonField(
      data.get('serverCompressVideoWebCodecs')
    );
    const serverCompressVideoContext = serverCompressVideo
      ? {
          reason: serverCompressVideoReason || 'unknown',
          removeVideoAudio,
          client: serverCompressVideoClient,
          webCodecs: serverCompressVideoWebCodecs,
          requestUserAgent: request.headers.get('user-agent'),
          requestReferer: request.headers.get('referer'),
          requestUrl: request.url
        }
      : undefined;

    logger.info({
      message: 'Image upload request',
      fileName: uploadFile?.name,
      fileSize: uploadFile?.size,
      fileType: uploadFile?.type,
      serverCompressVideo,
      removeVideoAudio,
      serverCompressVideoContext,
      user: email
    });

    if (serverCompressVideo) {
      logger.warn({
        message: 'Server video compression upload requested',
        fileName: uploadFile?.name,
        fileSize: uploadFile?.size,
        fileType: uploadFile?.type,
        removeVideoAudio,
        serverCompressVideoContext,
        user: email
      });
    }

    const res = await write(uploadFile, email, 'jjal', {
      compressVideo: serverCompressVideo,
      removeVideoAudio,
      serverCompressVideoContext
    });

    logger.info({
      message: 'Image upload success',
      fileName: uploadFile?.name,
      url: res,
      user: email
    });

    return json({ url: res });
  } catch (err) {
    const errorMessage = getErrorMessage(err);
    logger.error({
      message: 'Image upload failed',
      error: err,
      user: email,
      fileName: uploadFile?.name,
      errorMessage
    });

    if (isBodySizeLimitError(err)) {
      throw error(413, {
        message: `파일이 너무 큽니다. ${BOARD_UPLOAD_MAX_MB}MB 이하 파일만 업로드할 수 있어요.`
      });
    }

    throw err;
  }
}
