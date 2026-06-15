import { getPrisma } from '$lib/database/prisma.js';
import { contentIconsFromFlags } from '$lib/server/board/articleRepo.js';
import { summarizeCommentsByArticles } from '$lib/server/board/commentRepo.js';

const ONE_HOUR_MS = 60 * 60 * 1000;
const THIRTY_MIN_MS = 30 * 60 * 1000;

/**
 * 게시판 목록 + 최신 댓글 시각/유저 photo (Prisma + JS content icons)
 *
 * @param {object} params
 * @param {string} params.boardId
 * @param {number} params.pageNo
 * @param {number} params.pageUnit
 * @param {Date} [params.createdAfter]
 * @param {string} [params.viewerId]
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function fetchBoardArticleList({ boardId, pageNo, pageUnit, createdAfter, viewerId }) {
  try {
    /** @type {import('@prisma/client').Prisma.ArticleWhereInput} */
    const where = { boardId, state: 'write' };
    if (createdAfter) {
      where.createdAt = { gt: createdAfter };
    }

    const skip = (pageNo - 1) * pageUnit;

    const rows = await getPrisma().article.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageUnit,
      select: {
        id: true,
        title: true,
        createdAt: true,
        nickname: true,
        email: true,
        reads: true,
        likes: true,
        hasImage: true,
        hasVideo: true,
        hasYoutube: true,
        hasInstagram: true
      }
    });

    if (rows.length === 0) return [];

    const articleIds = rows.map((a) => a.id);
    const emails = [...new Set(rows.map((a) => a.email))];
    const newArticleThreshold = new Date(Date.now() - ONE_HOUR_MS);
    const newCommentThreshold = new Date(Date.now() - THIRTY_MIN_MS);

    const [commentSummaryByArticle, users] = await Promise.all([
      summarizeCommentsByArticles(articleIds),
      getPrisma().user.findMany({
        where: { email: { in: emails } },
        select: { email: true, photo: true }
      })
    ]);

    /** @type {Record<string, string | undefined>} */
    const photoByEmail = {};
    for (const u of users) {
      if (u.email) photoByEmail[u.email] = u.photo ?? undefined;
    }

    return rows.map((a) => {
      const commentSummary = commentSummaryByArticle[a.id];
      const latest = commentSummary?.latestCreatedAt;
      return {
        _id: a.id,
        title: a.title,
        createdAt: a.createdAt.toISOString(),
        nickname: a.nickname,
        email: a.email,
        read: a.reads.length,
        like: a.likes.length,
        comment: commentSummary?.count ?? 0,
        content: contentIconsFromFlags(a),
        isNewArticle: Boolean(
          viewerId && a.createdAt > newArticleThreshold && !a.reads.includes(viewerId)
        ),
        isNewComment: Boolean(latest && latest >= newCommentThreshold),
        photo: a.email ? photoByEmail[a.email] : undefined
      };
    });
  } catch {
    return [];
  }
}
