import { getPrisma } from '$lib/database/prisma.js';
import { contentIcons } from '$lib/server/board/articleRepo.js';
import {
  countCommentsByArticles,
  latestCommentAtByArticles
} from '$lib/server/board/commentRepo.js';

const THIRTY_MIN_MS = 30 * 60 * 1000;

/**
 * 게시판 목록 + 최신 댓글 시각/유저 photo (Prisma + JS content icons)
 *
 * @param {object} params
 * @param {string} params.boardId
 * @param {number} params.pageNo
 * @param {number} params.pageUnit
 * @param {Date} [params.createdAfter]
 * @returns {Promise<Array<Record<string, unknown>>>}
 */
export async function fetchBoardArticleList({ boardId, pageNo, pageUnit, createdAfter }) {
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
        content: true
      }
    });

    if (rows.length === 0) return [];

    const articleIds = rows.map((a) => a.id);
    const emails = [...new Set(rows.map((a) => a.email))];
    const newCommentThreshold = new Date(Date.now() - THIRTY_MIN_MS);

    const [commentCounts, latestByArticle, users] = await Promise.all([
      countCommentsByArticles(articleIds),
      latestCommentAtByArticles(articleIds),
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
      const latest = latestByArticle[a.id];
      return {
        _id: a.id,
        title: a.title,
        createdAt: a.createdAt.toISOString(),
        nickname: a.nickname,
        email: a.email,
        read: a.reads.length,
        like: a.likes.length,
        comment: commentCounts[a.id] ?? 0,
        content: contentIcons(a.content),
        isNewComment: Boolean(latest && latest >= newCommentThreshold),
        photo: a.email ? photoByEmail[a.email] : undefined
      };
    });
  } catch {
    return [];
  }
}
