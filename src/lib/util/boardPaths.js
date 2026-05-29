/** @param {string} pathname */
export function isFreeBoardLegacyPath(pathname) {
  return pathname === '/board/free' || pathname === '/board/free/' || pathname === '/board/free/1';
}

/** 자유게시판 1페이지(홈) — `/board/free/N`(N>1) 제외 */
/** @param {string} pathname */
export function isFreeBoardHomePath(pathname) {
  const path = pathname.split('?')[0];
  return path === '/' || isFreeBoardLegacyPath(path);
}

/**
 * 레거시 `/board/free` URL을 canonical `/` 로 정규화 (쿼리 유지)
 *
 * @param {string} pathname
 * @param {string} [search='']
 */
export function normalizeFreeBoardPath(pathname, search = '') {
  if (isFreeBoardLegacyPath(pathname)) {
    return `/${search}`;
  }
  return `${pathname}${search}`;
}

/**
 * 게시판 목록 URL — 자유게시판 1페이지는 `/` 로 통일
 *
 * @param {string} boardId
 * @param {number} [pageNo=1]
 */
export function boardListPath(boardId, pageNo = 1) {
  const page = Number(pageNo) || 1;

  if (boardId === 'free' && page === 1) {
    return '/';
  }

  if (page === 1) {
    return `/board/${boardId}`;
  }

  return `/board/${boardId}/${page}`;
}

/**
 * CDN·브라우저 HTML 캐시 방지 대상 경로
 *
 * @param {string} pathname
 */
export function isBoardHtmlPath(pathname) {
  return pathname === '/' || pathname.startsWith('/board/');
}
