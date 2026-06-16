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

    logger.info({
      message: 'Image upload request',
      fileName: uploadFile?.name,
      fileSize: uploadFile?.size,
      fileType: uploadFile?.type,
      serverCompressVideo,
      user: email
    });

    const res = await write(uploadFile, email, 'jjal', { compressVideo: serverCompressVideo });

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
