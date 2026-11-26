import { error, json } from '@sveltejs/kit';

import { requireBoardUploadUser } from '#lib/server/boardUploadAuth.js';
import { receiveChunk } from '#lib/server/chunkedUpload.js';
import logger from '#lib/util/logger.js';
import { BOARD_UPLOAD_CHUNK_BYTES } from '#lib/util/uploadLimits.js';

// One piece of a large upload. The body is the raw chunk; the file description
// is in the query string so no multipart parsing is needed.
export async function POST({ request, locals, url }) {
  const email = await requireBoardUploadUser({ request, locals });

  const declaredLength = Number(request.headers.get('content-length'));
  if (Number.isFinite(declaredLength) && declaredLength > BOARD_UPLOAD_CHUNK_BYTES) {
    throw error(413, '업로드 조각이 너무 큽니다.');
  }

  const params = url.searchParams;
  const uploadId = params.get('uploadId') ?? '';
  try {
    const body = new Uint8Array(await request.arrayBuffer());
    const result = await receiveChunk({
      uploadId,
      index: params.get('index'),
      totalChunks: params.get('totalChunks'),
      totalSize: params.get('totalSize'),
      name: params.get('name'),
      type: params.get('type'),
      email,
      body
    });
    return json(result);
  } catch (err) {
    logger.warn({
      message: 'Chunked upload chunk failed',
      uploadId,
      index: params.get('index'),
      user: email,
      error: err
    });
    throw err;
  }
}
