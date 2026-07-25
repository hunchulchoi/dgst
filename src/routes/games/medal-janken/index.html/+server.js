import { redirect } from '@sveltejs/kit';

export function GET() {
  // 구버전 iframe 주소도 래퍼 페이지가 아닌 실제 오락기로 보낸다.
  // 영구 캐시를 남기지 않도록 307을 사용한다.
  throw redirect(307, '/game-assets/medal-janken/index.html');
}
