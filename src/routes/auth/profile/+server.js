import { error, json } from '@sveltejs/kit';
import connectDB from '$lib/database/mongoosePriomise.js';
import { write } from '$lib/util/fileUpload.js';

import { User } from '$lib/models/user.js';

connectDB();

export async function PATCH({ request, locals }) {
  const session = await locals.auth();

  if (!session || !session.user?.email) {
    throw error(401, { message: '로그인 해 주세요' });
  }

  const formData = await request.formData();

  console.debug('formData', formData, 'session', session);

  console.debug(
    'photo222',
    formData.get('photo'),
    formData.get('photo') === 'undefined',
    formData.get('photo') === undefined
  );

  //파일 저장
  let storeFileName;

  const photoFile = formData.get('photo');
  if (photoFile && photoFile instanceof File && photoFile.size > 0) {
    storeFileName = await write(photoFile, session.user.email, 'profiles');

    if (!storeFileName) {
      throw error(500, { message: '파일 저장에 실패 하였습니다.' });
    }
  }

  const filter = {
    email: session.user.email,
    state: { $ne: 'banned' }
  };

  /**
   * @type {{ nickname: string; introduction: string; state: string; last_modified: Date; photo?: string }}
   */
  const update = {
    nickname: String(formData.get('nickname') || ''),
    introduction: String(formData.get('introduction') || ''),
    state: 'registered',
    last_modified: new Date()
  };

  if (storeFileName) {
    update.photo = storeFileName;
  }

  console.debug('filter', filter, 'update', update);

  try {
    const registeredUser = await User.findOneAndUpdate(filter, update, { new: true });

    console.debug('registeredUser', registeredUser);

    if (!registeredUser) {
      throw error(404, { message: '사용자를 찾을 수 없습니다.' });
    }

    // session은 직접 수정하지 않고 응답만 반환
    // 클라이언트에서 다시 로그인하도록 안내
    return json({
      success: true,
      nickname: registeredUser.nickname,
      photo: registeredUser.photo,
      message: '프로필이 업데이트되었습니다.'
    });
  } catch (err) {
    console.error('프로필 업데이트 실패:', err);

    // SvelteKit error는 그대로 throw
    if (err && typeof err === 'object' && 'status' in err) {
      throw err;
    }

    throw error(500, { message: '저장에 실패했습니다.' });
  }
}
