import { json } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';

import { write } from '$lib/util/fileUpload.js';
import logger from '$lib/util/logger.js';

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

    logger.info({
      message: 'Image upload request',
      fileName: uploadFile?.name,
      fileSize: uploadFile?.size,
      fileType: uploadFile?.type,
      user: email
    });

    const res = await write(uploadFile, email, 'jjal');

    logger.info({
      message: 'Image upload success',
      fileName: uploadFile?.name,
      url: res,
      user: email
    });

    return json({ url: res });
  } catch (err) {
    logger.error({
      message: 'Image upload failed',
      error: err,
      user: email,
      fileName: uploadFile?.name
    });
    throw err;
  }
}
