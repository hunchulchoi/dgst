import { error } from '@sveltejs/kit';
import { getPrisma } from '$lib/database/prisma.js';
import {
  addRead,
  countArticles,
  findArticleById,
  toArticleJson
} from '$lib/server/board/articleRepo.js';
import { findCommentsByArticle } from '$lib/server/board/commentRepo.js';
import { fetchBoardArticleList } from '$lib/server/boardArticleList.js';
import { computePaginationWindow } from '$lib/server/boardListLoad.js';
import convertToTree from '$lib/util/tree.js';

const PAGE_UNIT = 30;
const THREE_DAYS_MS = 1000 * 60 * 60 * 24 * 3;

/** @param {import('@sveltejs/kit').ServerLoadEvent} event */
export const load = async ({ params, locals, cookies }) => {
  if (!params.articleId) {
    throw error(400, { message: '잘못된 접근입니다.' });
  }

  try {
    const session = await locals.auth();

    const viewerId = session?.user?.email || cookies.get('dgst_device') || `guest-${Date.now()}`;

    let article = await findArticleById(params.articleId, params.boardId, 'write');
    if (!article) {
      throw error(404, { message: '삭제되었거나 존재하지 않는 게시물입니다.' });
    }

    article = (await addRead(params.articleId, viewerId)) ?? article;

    const comments = await findCommentsByArticle(params.articleId);
    const commentTree = convertToTree(
      comments.map((c) => ({
        ...c,
        id: c.id
      }))
    );

    const author = await getPrisma().user.findFirst({
      where: { email: article.email },
      select: { photo: true, introduction: true }
    });

    const articleJson = toArticleJson(article, commentTree.length);
    articleJson.comments = JSON.parse(JSON.stringify(commentTree));

    const insta =
      articleJson.content.includes('<div data-oembed-url=') &&
      article.content.includes('instagram.com');

    if (session?.user?.email) {
      articleJson.liked = article.likes.includes(session.user.email);

      articleJson.comments.forEach(
        /** @param {{ likes?: string[], liked?: boolean }} comment */ (comment) => {
          comment.liked = comment.likes?.includes(session.user.email) ?? false;
          delete comment.likes;
        }
      );
    }

    let pageNo = parseInt(params.pageNo || '1', 10);
    if (!Number.isFinite(pageNo) || pageNo < 1) pageNo = 1;

    const createdAfter = new Date(Date.now() - THREE_DAYS_MS);
    const total = await countArticles({
      boardId: params.boardId,
      state: 'write',
      createdAt: { gt: createdAfter }
    });

    if (!total) {
      return { articles: [] };
    }

    const maxPage = Math.ceil(total / PAGE_UNIT);
    if (maxPage < pageNo) pageNo = maxPage;

    const { startNo, endNo } = computePaginationWindow(pageNo, maxPage);

    const articles = await fetchBoardArticleList({
      boardId: params.boardId,
      pageNo,
      pageUnit: PAGE_UNIT,
      createdAfter
    });

    /** @param {string | null | undefined} str @param {number} [maxLen=200] */
    const safeText = (str, maxLen = 200) => {
      if (str == null) return '';
      const s = String(str)
        .replace(/<[^>]*>/g, '')
        .replace(/&nbsp;/g, ' ')
        .trim();
      return s.length > maxLen ? s.slice(0, maxLen) : s;
    };
    const ogTitle = `${safeText(articleJson.title, 60)} - ${safeText(articleJson.nickname, 30)}`;
    const ogDescription = safeText(articleJson.content, 200) || `${articleJson.nickname}의 글`;
    const ogUrl = `https://www.dgst.me/board/${params.boardId}/${params.articleId}`;

    const imgMatch = articleJson.content?.match(/<img[^>]+src=["']([^"']+)["']/i);
    let firstImage = imgMatch ? imgMatch[1] : null;
    if (firstImage && firstImage.startsWith('/')) {
      firstImage = `https://www.dgst.me${firstImage}`;
    }
    const ogImage = firstImage || 'https://www.dgst.me/logo/twitter_header_photo_2.png';

    return {
      article: articleJson,
      photo: author?.photo || '/icons/unknown-person-icon-4.jpg',
      introduction: author?.introduction,
      insta,
      pageNo,
      maxPage,
      startNo,
      endNo,
      articles,
      ogTitle,
      ogDescription,
      ogUrl,
      ogImage
    };
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err) throw err;
    throw error(500, { message: '게시물을 불러오지 못했습니다.' });
  }
};
