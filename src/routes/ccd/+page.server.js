import { redirect } from '@sveltejs/kit';

export const load = async (event) => {
  const session = await event.locals.auth();

  // 이미 로그인되어 있으면 자유게시판으로 이동
  if (session?.user) {
    throw redirect(302, '/');
  }

  // 로그인되지 않았으면 로그인 페이지로 이동
  throw redirect(302, '/login');
};
