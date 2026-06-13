import { error } from '@sveltejs/kit';
import { getPrisma } from '$lib/database/prisma.js';

export const load = async ({ locals }) => {
  const session = await locals.auth();

  if (!session?.user?.nickname) {
    throw error(401, { message: '로그인 해 주세요' });
  }

  try {
    const profile = await getPrisma().user.findFirst({
      where: { email: session.user.email, state: { not: 'banned' } },
      select: { id: true, nickname: true, introduction: true, photo: true }
    });

    console.log('profile', profile);

    if (!profile) {
      throw error(410, { message: `회원 정보를 찾을 수 없습니다.` });
    }

    return {
      profile: {
        _id: profile.id,
        nickname: profile.nickname,
        introduction: profile.introduction,
        photo: profile.photo
      }
    };
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err) throw err;
    throw error(500, { message: '프로필 조회 중 오류가 발생했습니다.' });
  }
};
