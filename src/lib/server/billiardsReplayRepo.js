import crypto from 'node:crypto';
import { getPrisma } from '$lib/database/prisma.js';

/**
 * @param {{ email: string, nickname: string, boardId: string, title: string, content: string, replay: object }} data
 */
export async function createBilliardsReplayArticle(data) {
  const articleId = crypto.randomBytes(12).toString('hex');
  const replayId = crypto.randomBytes(12).toString('hex');
  const prisma = getPrisma();

  await prisma.$transaction(async (tx) => {
    await tx.article.create({
      data: {
        id: articleId,
        email: data.email,
        nickname: data.nickname,
        boardId: data.boardId,
        title: data.title,
        content: data.content
      }
    });
    await tx.billiardsReplay.create({
      data: {
        id: replayId,
        articleId,
        email: data.email,
        data: data.replay
      }
    });
  });

  return { articleId, replayId };
}

/** @param {string} articleId */
export async function findBilliardsReplayByArticleId(articleId) {
  const replayModel = getPrisma().billiardsReplay;
  if (!replayModel) return null;
  return await replayModel.findUnique({
    where: { articleId },
    select: { id: true, data: true, createdAt: true }
  });
}
