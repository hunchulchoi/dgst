import { isFreeBoardLegacyPath } from '$lib/util/boardPaths.js';

/**
 * `/board/free` → `/` 내부 라우팅 (301 리다이렉트 없이 RTT 추가 없음)
 *
 * @type {import('@sveltejs/kit').Reroute}
 */
export function reroute({ url }) {
  if (isFreeBoardLegacyPath(url.pathname)) {
    return '/';
  }
}
