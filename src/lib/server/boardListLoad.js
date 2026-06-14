import crypto from 'crypto';
import { countArticles } from '$lib/server/board/articleRepo.js';
import { fetchBoardArticleList } from '$lib/server/boardArticleList.js';
import * as pgCache from '$lib/server/cache/pgCache.js';

const BOARDLIST_NS = 'boardlist';
import logger from '$lib/util/logger.js';
import { traceFromUnknown } from '$lib/util/formatErrorTrace.js';

const PAGE_UNIT = 30;
const THREE_DAYS_MS = 1000 * 60 * 60 * 24 * 3;
const TOTAL_CACHE_TTL_SECONDS = 60;
/** 성공 응답 pgCache 캐시 — DB 일시 장애 시 stale fallback */
const LIST_PAYLOAD_TTL_SECONDS = 5;

/**
 * @param {string} boardId
 * @param {number} pageNo
 */
function listPayloadCacheKey(boardId, pageNo) {
  return `boardlist:payload:${boardId}:${pageNo}`;
}

/**
 * 글 작성·수정·삭제 후 목록 pgCache 캐시 무효화
 *
 * @param {string} boardId
 */
export async function bustBoardListCache(boardId) {
  try {
    await pgCache.del(`boardlist:total:${boardId}`, BOARDLIST_NS);
    await pgCache.delByPrefix(`boardlist:payload:${boardId}:`, BOARDLIST_NS);
  } catch {
    // 캐시 bust 실패는 본 요청을 막지 않음
  }
}

/**
 * @param {string} boardId
 * @param {number} pageNo
 * @param {Record<string, unknown>} payload
 */
async function cacheListPayload(boardId, pageNo, payload) {
  try {
    await pgCache.setJson(
      listPayloadCacheKey(boardId, pageNo),
      payload,
      LIST_PAYLOAD_TTL_SECONDS,
      BOARDLIST_NS
    );
  } catch {
    // 캐시 실패는 목록 응답을 막지 않음
  }
}

/**
 * @param {string} boardId
 * @param {number} pageNo
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function getStaleListPayload(boardId, pageNo) {
  try {
    const cached = /** @type {Record<string, unknown> | null} */ (
      await pgCache.getJson(listPayloadCacheKey(boardId, pageNo), BOARDLIST_NS)
    );
    if (!cached || typeof cached !== 'object' || !Array.isArray(cached.articles)) {
      return null;
    }
    return /** @type {Record<string, unknown>} */ (cached);
  } catch {
    return null;
  }
}

/**
 * DB 장애 시 500 대신 빈 목록 또는 stale 캐시 반환
 *
 * @param {import('@sveltejs/kit').ServerLoadEvent} event
 * @param {string} boardId
 * @param {number} pageNo
 * @param {unknown} err
 * @param {string} errorId
 */
async function buildDegradedListResponse(event, boardId, pageNo, err, errorId) {
  const trace = traceFromUnknown(err);
  const errMessage = err instanceof Error ? err.message : String(err);
  const pathname = event.url?.pathname ?? `/board/${boardId}`;

  const stale = await getStaleListPayload(boardId, pageNo);

  if (stale) {
    logger.warn({
      errorId,
      message: `[board-list-load] stale fallback ${boardId} page=${pageNo} | msg=${errMessage}`,
      pathname,
      boardId,
      pageNo,
      degraded: 'stale',
      trace: trace || undefined
    });

    return {
      ...stale,
      boardId,
      pageNo: typeof stale.pageNo === 'number' ? stale.pageNo : pageNo,
      listLoadDegraded: 'stale'
    };
  }

  logger.error({
    errorId,
    message: `[board-list-load] unavailable ${boardId} page=${pageNo} | msg=${errMessage}`,
    pathname,
    boardId,
    pageNo,
    degraded: 'unavailable',
    trace: trace || undefined
  });

  return {
    articles: [],
    boardId,
    pageNo,
    maxPage: 0,
    startNo: 1,
    endNo: 1,
    listLoadDegraded: 'unavailable'
  };
}

/**
 * @param {number} pageNo
 * @param {number} maxPage
 */
export function computePaginationWindow(pageNo, maxPage) {
  let startNo = 1;
  let endNo = maxPage > 7 ? 7 : maxPage;

  if (maxPage > 7) {
    if (pageNo - 3 > 0) {
      startNo = pageNo - 3;
      endNo = startNo + 6;
    }

    if (pageNo + 3 > maxPage) {
      endNo = maxPage;
      startNo = endNo - 6;
    }
  }

  return { startNo, endNo };
}

/**
 * boardId별 최근 3일 게시글 수 — pgCache 60초 캐시 (목록 페이지마다 count 회피)
 *
 * @param {string} boardId
 * @param {import('@prisma/client').Prisma.ArticleWhereInput} filter
 */
async function getCachedTotal(boardId, filter) {
  const cacheKey = `boardlist:total:${boardId}`;
  const cached = await pgCache.get(cacheKey, BOARDLIST_NS);
  if (cached !== null) {
    const n = parseInt(cached, 10);
    if (Number.isFinite(n) && n >= 0) return n;
  }

  const total = await countArticles(filter);
  await pgCache.set(cacheKey, String(total), TOTAL_CACHE_TTL_SECONDS, BOARDLIST_NS);
  return total;
}

/**
 * @param {string} boardId
 * @param {number} inputPageNo
 */
export async function getBoardListPayload(boardId, inputPageNo) {
  let pageNo = Number.isFinite(inputPageNo) && inputPageNo > 0 ? inputPageNo : 1;
  const t0 = performance.now();
  const tConnected = performance.now();
  const createdAfter = new Date(Date.now() - THREE_DAYS_MS);

  const filter = {
    boardId,
    state: 'write',
    createdAt: { gt: createdAfter }
  };

  const total = await getCachedTotal(boardId, filter);
  const tCounted = performance.now();

  if (!total) {
    return { articles: [], boardId, pageNo: 1, maxPage: 0, startNo: 1, endNo: 1 };
  }

  const maxPage = Math.ceil(total / PAGE_UNIT);

  if (maxPage < pageNo) {
    pageNo = maxPage;
  }

  const articles = await fetchBoardArticleList({
    boardId,
    pageNo,
    pageUnit: PAGE_UNIT,
    createdAfter
  });
  const tFetched = performance.now();
  const { startNo, endNo } = computePaginationWindow(pageNo, maxPage);

  const totalMs = Math.round(tFetched - t0);
  if (totalMs > 500) {
    logger.warn({
      message: `[board-list-timing] ${boardId} total=${totalMs}ms connect=${Math.round(tConnected - t0)}ms count=${Math.round(tCounted - tConnected)}ms list=${Math.round(tFetched - tCounted)}ms`,
      boardId,
      pageNo,
      timings: {
        connect: Math.round(tConnected - t0),
        count: Math.round(tCounted - tConnected),
        list: Math.round(tFetched - tCounted),
        total: totalMs
      }
    });
  }

  const payload = {
    boardId,
    pageNo,
    maxPage,
    startNo,
    endNo,
    articles
  };

  await cacheListPayload(boardId, pageNo, payload);

  return payload;
}

/**
 * @param {import('@sveltejs/kit').ServerLoadEvent} event
 * @param {string} boardId
 */
export async function loadBoardList(event, boardId) {
  event.depends('board-list');

  let pageNo = parseInt(event.params.pageNo || '1', 10);
  if (!Number.isFinite(pageNo) || pageNo < 1) pageNo = 1;

  try {
    return await getBoardListPayload(boardId, pageNo);
  } catch (err) {
    const errorId = crypto.randomUUID();
    return buildDegradedListResponse(event, boardId, pageNo, err, errorId);
  }
}
