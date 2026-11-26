import { json } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';

import { requireBoardUploadUser } from '#lib/server/boardUploadAuth.js';
import { writeBoardUpload } from '#lib/server/boardUploadWrite.js';
import logger from '#lib/util/logger.js';
import { BOARD_UPLOAD_MAX_MB } from '#lib/util/uploadLimits.js';

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
  const email = await requireBoardUploadUser({ request, locals });

  /** @type {File | null} */
  let uploadFile = null;
  try {
    const data = await request.formData();
    const upload = data.get('upload');
    if (!(upload instanceof File)) {
      throw error(400, '업로드할 파일이 없습니다.');
    }
    uploadFile = upload;
    const responseBody = await writeBoardUpload({
      file: uploadFile,
      email,
      getField: (name) => data.get(name),
      request
    });
    return json(responseBody);
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
      throw error(
        413,
        `파일이 너무 큽니다. ${BOARD_UPLOAD_MAX_MB}MB 이하 파일만 업로드할 수 있어요.`
      );
    }

    throw err;
  }
}
