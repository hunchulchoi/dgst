import { error, json } from '@sveltejs/kit';

import { requireBoardUploadUser } from '#lib/server/boardUploadAuth.js';
import { writeBoardUpload } from '#lib/server/boardUploadWrite.js';
import { assembleUpload } from '#lib/server/chunkedUpload.js';
import logger from '#lib/util/logger.js';

// Joins the chunks sent to /board/upload/chunk and stores the result like a
// normal upload. `fields` carries the same string fields as the multipart form.
export async function POST({ request, locals }) {
  const email = await requireBoardUploadUser({ request, locals });

  /** @type {{ uploadId?: unknown, fields?: unknown }} */
  let payload;
  try {
    payload = await request.json();
  } catch {
    throw error(400, '잘못된 업로드 요청입니다.');
  }
  const uploadId = typeof payload?.uploadId === 'string' ? payload.uploadId : '';
  const fields =
    payload?.fields && typeof payload.fields === 'object'
      ? /** @type {Record<string, unknown>} */ (payload.fields)
      : {};

  const { file, cleanup } = await assembleUpload({ uploadId, email });
  try {
    const responseBody = await writeBoardUpload({
      file,
      email,
      getField: (name) => (typeof fields[name] === 'string' ? fields[name] : null),
      request,
      chunked: true
    });
    return json(responseBody);
  } catch (err) {
    logger.error({
      message: 'Image upload failed',
      error: err,
      user: email,
      fileName: file.name,
      chunked: true,
      errorMessage: err instanceof Error ? err.message : String(err)
    });
    throw err;
  } finally {
    await cleanup();
  }
}
