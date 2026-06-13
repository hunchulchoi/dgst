import { loadBoardList } from '$lib/server/boardListLoad.js';

/** 루트(/)에서 리다이렉트 없이 자유게시판 SSR (초기 로딩 RTT 1회 절약) */
export const load = async (event) => {
  const result = await loadBoardList(
    { ...event, params: { ...event.params, pageNo: undefined } },
    'free'
  );
  return result;
};
