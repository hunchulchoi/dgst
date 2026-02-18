import { error, json } from '@sveltejs/kit';
import connectDB from '$lib/database/mongoosePriomise.js';
import { write } from '$lib/util/fileUpload.js';
import { User } from '$lib/models/user.js';
import { isNicknameAllowed } from '$lib/util/nickname.js';

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

  if (formData.get('photo')?.size) {
    storeFileName = await write(formData.get('photo'), session.user.email, 'profiles');

    if (!storeFileName) return new Response('파일 저장에 실패 하였습니다.', { status: 500 });
  }

  const nicknameRaw = String(formData.get('nickname') ?? '');
  if (!isNicknameAllowed(nicknameRaw)) {
    throw error(400, { message: '닉네임에 사용할 수 없는 문자가 포함되어 있습니다.' });
  }

  const filter = {
    email: session.user.email,
    state: 'signup'
  };

  const update = {
    nickname: nicknameRaw,
    introduction: formData.get('introduction'),
    photo: storeFileName,
    state: 'registered',
    last_modified: new Date()
  };

  if (storeFileName) update.photo = storeFileName;

  console.debug('filter', filter, 'update', update);

  try {
    const registeredUser = await User.findOneAndUpdate(filter, update, { new: true });

    console.debug('registeredUser', registeredUser);

    session.user.email = registeredUser.email;
    session.user.nickname = registeredUser.nickname;
    session.user.introduction = registeredUser.introduction;
    session.user.photo = registeredUser.photo;

    console.debug('session', session);

    return json({ nickname: registeredUser.nickname, photo: registeredUser.photo });
  } catch (error) {
    console.error(error);

    return new Response('저장에 실패 하였다.', { status: 500 });
  }
}
