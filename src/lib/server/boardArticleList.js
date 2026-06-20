import { getPrisma } from '$lib/database/prisma.js';
import { contentIconsFromFlags } from '$lib/server/board/articleRepo.js';
import { summarizeCommentsByArticles } from '$lib/server/board/commentRepo.js';

const ONE_HOUR_MS = 60 * 60 * 1000;

function getTodayReplyBadgeThreshold() {
  const now = new Date();
  const kstNow = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return new Date(
    Date.UTC(kstNow.getUTCFullYear(), kstNow.getUTCMonth(), kstNow.getUTCDate(), 4, 45, 0, 0)
  );
}

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
        hasAudio: true,
        hasYoutube: true,
        hasInstagram: true
      }
    });

    if (rows.length === 0) return [];

    const articleIds = rows.map((a) => a.id);
    const emails = [...new Set(rows.map((a) => a.email))];
    const newArticleThreshold = new Date(Date.now() - ONE_HOUR_MS);
    const replyBadgeThreshold = getTodayReplyBadgeThreshold();

    const [commentSummaryByArticle, users, articleReads, recentComments] = await Promise.all([
      summarizeCommentsByArticles(articleIds),
      getPrisma().user.findMany({
        where: { email: { in: emails } },
        select: { email: true, photo: true }
      }),
      viewerId
        ? /** @type {any} */ (getPrisma()).articleRead.findMany({
            where: {
              viewerId,
              articleId: { in: articleIds }
            },
            select: { articleId: true, readAt: true }
          })
        : Promise.resolve([]),
      viewerId
        ? getPrisma().comment.findMany({
            where: {
              articleId: { in: articleIds },
              state: 'write',
              createdAt: { gte: replyBadgeThreshold },
              NOT: { email: viewerId }
            },
            orderBy: { createdAt: 'desc' },
            select: { articleId: true, createdAt: true }
          })
        : Promise.resolve([])
    ]);
    const readAtByArticleId = new Map(
      articleReads.map(
        /** @param {{ articleId: string, readAt: Date }} read */ (read) => [read.articleId, read.readAt]
      )
    );
    /** @type {Map<string, Date>} */
    const latestUnreadReplyByArticleId = new Map();
    for (const comment of /** @type {Array<{ articleId: string, createdAt: Date }>} */ (
      recentComments
    )) {
      if (!latestUnreadReplyByArticleId.has(comment.articleId)) {
        latestUnreadReplyByArticleId.set(comment.articleId, comment.createdAt);
      }
    }

    /** @type {Record<string, string | undefined>} */
    const photoByEmail = {};
    for (const u of users) {
      if (u.email) photoByEmail[u.email] = u.photo ?? undefined;
    }

    return rows.map((a) => {
      const commentSummary = commentSummaryByArticle[a.id];
      const latestUnreadReplyAt = latestUnreadReplyByArticleId.get(a.id);
      const readAt = readAtByArticleId.get(a.id);
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
        isNewComment: Boolean(latestUnreadReplyAt && (!readAt || latestUnreadReplyAt > readAt)),
        photo: a.email ? photoByEmail[a.email] : undefined
      };
    });
  } catch {
    return [];
  }
}
