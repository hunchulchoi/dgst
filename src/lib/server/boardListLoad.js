import { error } from '@sveltejs/kit';
import crypto from 'crypto';
import connectDB from '$lib/database/mongoosePriomise.js';
import { Article } from '$lib/models/article.js';
import { fetchBoardArticleList } from '$lib/server/boardArticleList.js';
import logger from '$lib/util/logger.js';
import { traceFromUnknown } from '$lib/util/formatErrorTrace.js';

const PAGE_UNIT = 30;
const THREE_DAYS_MS = 1000 * 60 * 60 * 24 * 3;

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
 * @param {import('@sveltejs/kit').ServerLoadEvent} event
 * @param {string} boardId
 */
export async function loadBoardList(event, boardId) {
  event.depends('board-list');

  let pageNo = parseInt(event.params.pageNo || '1', 10);
  if (!Number.isFinite(pageNo) || pageNo < 1) pageNo = 1;

  try {
    await connectDB();

    const filter = {
      boardId,
      state: 'write',
      createdAt: { $gt: new Date(Date.now() - THREE_DAYS_MS) }
    };

    const total = await Article.countDocuments(filter);

    if (!total) {
      return { articles: [], boardId, pageNo: 1, maxPage: 0, startNo: 1, endNo: 1 };
    }

    const maxPage = Math.ceil(total / PAGE_UNIT);

    if (maxPage < pageNo) {
      pageNo = maxPage;
    }

    const articles = await fetchBoardArticleList({ filter, pageNo, pageUnit: PAGE_UNIT });
    const { startNo, endNo } = computePaginationWindow(pageNo, maxPage);

    return {
      boardId,
      pageNo,
      maxPage,
      startNo,
      endNo,
      articles
    };
  } catch (err) {
    const errorId = crypto.randomUUID();
    const trace = traceFromUnknown(err);
    const errMessage = err instanceof Error ? err.message : String(err);

    logger.error({
      errorId,
      message: `[board-list-load] ${boardId} page=${pageNo} | msg=${errMessage}`,
      pathname: `/board/${boardId}${pageNo > 1 ? `/${pageNo}` : ''}`,
      boardId,
      pageNo,
      trace: trace || undefined
    });

    throw error(500, {
      message: '목록을 가져오는 중에 오류가 발생하였습니다.',
      errorId
    });
  }
}
