import { error, json } from '@sveltejs/kit';
import { getPrisma } from '$lib/database/prisma.js';
import { verifyRecaptchaToken } from '$lib/server/recaptcha.js';
import { write } from '$lib/util/fileUpload.js';
import { isNicknameAllowed } from '$lib/util/nickname.js';

export async function PATCH({ request, locals }) {
  const session = await locals.auth();

  if (!session || !session.user?.email) {
    throw error(401, { message: '로그인 해 주세요' });
  }

  const formData = await request.formData();

  const captcha = await verifyRecaptchaToken(
    formData.get('recaptchaToken')?.toString(),
    'register'
  );
  if (!captcha.ok) {
    throw error(400, { message: captcha.message });
  }

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

  /** @type {import('@prisma/client').Prisma.UserUpdateInput} */
  const updateData = {
    nickname: nicknameRaw,
    introduction: String(formData.get('introduction') ?? ''),
    state: 'registered',
    lastModified: new Date()
  };

  if (storeFileName) updateData.photo = storeFileName;

  console.debug('update', updateData);

  try {
    const existing = await getPrisma().user.findFirst({
      where: { email: session.user.email, state: 'signup' }
    });

    if (!existing) {
      return new Response('저장에 실패 하였다.', { status: 404 });
    }

    const registeredUser = await getPrisma().user.update({
      where: { id: existing.id },
      data: updateData
    });

    console.debug('registeredUser', registeredUser);

    session.user.email = registeredUser.email;
    session.user.nickname = registeredUser.nickname;
    session.user.introduction = registeredUser.introduction;
    session.user.photo = registeredUser.photo;

    console.debug('session', session);

    return json({ nickname: registeredUser.nickname, photo: registeredUser.photo });
  } catch (err) {
    console.error(err);

    return new Response('저장에 실패 하였다.', { status: 500 });
  }
}
