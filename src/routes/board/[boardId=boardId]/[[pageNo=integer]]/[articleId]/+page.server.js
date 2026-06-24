import { error } from '@sveltejs/kit';
import {
  findArticleAuthorProfile,
  findArticleById,
  recordArticleRead,
  toArticleJson
} from '$lib/server/board/articleRepo.js';
import { findCommentsByArticle, toCommentJson } from '$lib/server/board/commentRepo.js';
import { getBoardListPayload } from '$lib/server/boardListLoad.js';
import convertToTree from '$lib/util/tree.js';

const BOARD_COMMENT_SELECT = {
  id: true,
  email: true,
  nickname: true,
  photo: true,
  boardId: true,
  articleId: true,
  parentCommentId: true,
  parentCommentNickname: true,
  depth: true,
  content: true,
  image: true,
  state: true,
  modifiedEmail: true,
  createdAt: true,
  updatedAt: true,
  likes: true
};

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

/** @param {import('@sveltejs/kit').ServerLoadEvent} event */
export const load = async ({ params, locals, cookies }) => {
  const { articleId, boardId } = params;
  if (!articleId || !boardId) {
    throw error(400, { message: '잘못된 접근입니다.' });
  }

  try {
    const session = await locals.auth();

    const viewerId = session?.user?.email || cookies.get('dgst_device') || locals.deviceId;

    let article = await findArticleById(articleId, boardId, 'write');
    if (!article) {
      throw error(404, { message: '삭제되었거나 존재하지 않는 게시물입니다.' });
    }

    const createdAtMs = new Date(article.createdAt).getTime();
    const createdAfterMs = Date.now() - THREE_DAYS_MS;
    if (Number.isFinite(createdAtMs) && createdAtMs <= createdAfterMs) {
      throw error(404, { message: '삭제되었거나 존재하지 않는 게시물입니다.' });
    }

    const readReceipt = viewerId ? await recordArticleRead(articleId, viewerId) : null;
    article = readReceipt?.article ?? article;
    const previousReadAt = readReceipt?.previousReadAt ?? null;
    const currentReadAt = readReceipt?.readAt ?? null;
    const previousReadAtMs = previousReadAt ? previousReadAt.getTime() : null;
    const requestedPageNo = parseInt(params.pageNo || '1', 10);
    const [comments, author, boardListPayload] = await Promise.all([
      findCommentsByArticle(articleId, boardId, BOARD_COMMENT_SELECT),
      findArticleAuthorProfile(article.email),
      getBoardListPayload(boardId, requestedPageNo, viewerId)
    ]);

    const commentTree = convertToTree(
      comments.map((c) => ({
        ...toCommentJson(c),
        id: c.id,
        isNewSinceLastRead: Boolean(
          previousReadAtMs &&
            c.email !== viewerId &&
            new Date(c.createdAt).getTime() > previousReadAtMs
        )
      }))
    );

    const articleJson = toArticleJson(article, commentTree.length);
    const articleComments =
      /** @type {Array<Record<string, unknown> & { likes?: string[]; liked?: boolean }>} */ (
        JSON.parse(JSON.stringify(commentTree))
      );
    articleJson.comments = articleComments;

    const insta =
      articleJson.content.includes('<div data-oembed-url=') &&
      article.content.includes('instagram.com');

    if (session?.user?.email) {
      const userEmail = session.user.email;
      articleJson.liked = article.likes.includes(userEmail);

      articleComments.forEach(
        /** @param {{ likes?: string[], liked?: boolean }} comment */ (comment) => {
          comment.liked = comment.likes?.includes(userEmail) ?? false;
          delete comment.likes;
        }
      );
    }

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
    const ogUrl = `https://www.dgst.me/board/${boardId}/${articleId}`;

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
      ...boardListPayload,
      ogTitle,
      ogDescription,
      ogUrl,
      ogImage,
      lastReadAt: previousReadAt?.toISOString() ?? null,
      currentReadAt: currentReadAt?.toISOString() ?? null
    };
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err) throw err;
    throw error(500, { message: '게시물을 불러오지 못했습니다.' });
  }
};
