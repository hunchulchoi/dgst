import { json } from '@sveltejs/kit';
import { error } from '@sveltejs/kit';

import { write } from '$lib/util/fileUpload.js';

export async function POST({ request, locals }) {
  console.log('upload.server POST', request);

  const session = await locals.getSession();

  if(!session || !session.user?.nickname){
    throw error(401, { message: '로그인 해 주세요' });
  }

  const data = await request.formData();

  console.log('body', data.get('upload').name);

  const res = await write(data.get('upload'), session.user.email, 'jjal');

  return json({ url: res });
}
