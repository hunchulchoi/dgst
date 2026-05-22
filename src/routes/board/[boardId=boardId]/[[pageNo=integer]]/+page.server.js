import { error } from '@sveltejs/kit';
import crypto from 'crypto';
import connectDB from '$lib/database/mongoosePriomise.js';
import { Article } from '$lib/models/article.js';
import { fetchBoardArticleList } from '$lib/server/boardArticleList.js';
import logger from '$lib/util/logger.js';
import { traceFromUnknown } from '$lib/util/formatErrorTrace.js';

connectDB();

export const load = async ({ params, depends }) => {
  depends('board-list');

  const pageUnit = 30;
  let pageNo = parseInt(params.pageNo || 1);

  try {
    await connectDB();

    const filter = {
      boardId: params.boardId,
      state: 'write',
      createdAt: { $gt: new Date(new Date() - 1000 * 60 * 60 * 24 * 3) }
    };

    const total = await Article.countDocuments(filter);

    if (!total) {
      return { articles: [] };
    }

    const maxPage = parseInt(total / pageUnit + (total % pageUnit ? 1 : 0));

    if (maxPage < pageNo) {
      pageNo = maxPage;
    }

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

    const articles = await fetchBoardArticleList({ filter, pageNo, pageUnit });

    return {
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
      message: `[board-list-load] ${params.boardId} page=${pageNo} | msg=${errMessage}`,
      pathname: `/board/${params.boardId}${pageNo > 1 ? `/${pageNo}` : ''}`,
      boardId: params.boardId,
      pageNo,
      trace: trace || undefined
    });

    throw error(500, {
      message: '목록을 가져오는 중에 오류가 발생하였습니다.',
      errorId
    });
  }
};
