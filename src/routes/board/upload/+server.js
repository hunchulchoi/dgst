import { json } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';

import { write } from '$lib/util/fileUpload.js';
import logger from '$lib/util/logger.js';

export async function POST({ request, locals }) {
  const session = await locals.auth();

  if (!session || !session.user?.nickname) {
    logger.warn({
      message: 'Image upload failed - unauthorized',
      pathname: request.url,
      user: session?.user?.email || 'anonymous'
    });
    throw error(401, { message: '로그인 해 주세요' });
  }

  let uploadFile = null;
  try {
    const data = await request.formData();
    uploadFile = data.get('upload');

    logger.info({
      message: 'Image upload request',
      fileName: uploadFile?.name,
      fileSize: uploadFile?.size,
      fileType: uploadFile?.type,
      user: session.user.email
    });

    const res = await write(uploadFile, session.user.email, 'jjal');

    logger.info({
      message: 'Image upload success',
      fileName: uploadFile?.name,
      url: res,
      user: session.user.email
    });

    return json({ url: res });
  } catch (err) {
    logger.error({
      message: 'Image upload failed',
      error: err,
      user: session.user.email,
      fileName: uploadFile?.name
    });
    throw err;
  }
}
