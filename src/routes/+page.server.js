import { redirect } from '@sveltejs/kit';

/** 루트는 서버에서 바로 자유게시판으로 이동 (클라이언트 이중 로딩 방지) */
export function load() {
  throw redirect(302, '/board/free');
}
