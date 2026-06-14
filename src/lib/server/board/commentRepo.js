import crypto from 'crypto';
import { getPrisma } from '$lib/database/prisma.js';

/**
 * @typedef {{
 *   _id: string;
 *   id: string;
 *   email: string;
 *   nickname: string;
 *   photo: string | null;
 *   boardId: string;
 *   articleId: string;
 *   parentCommentId: string | null;
 *   parentCommentNickname: string | null;
 *   depth: number;
 *   content: string | null;
 *   image: string | null;
 *   state: string;
 *   modifiedEmail: string | null;
 *   createdAt: string | Date;
 *   updatedAt: string | Date;
 *   like: number;
 *   likes?: string[];
 *   liked?: boolean;
 * }} CommentJson
 */

/**
 * @param {import('@prisma/client').Comment} comment
 * @returns {CommentJson}
 */
export function toCommentJson(comment) {
  return {
    _id: comment.id,
    id: comment.id,
    email: comment.email,
    nickname: comment.nickname,
    photo: comment.photo,
    boardId: comment.boardId,
    articleId: comment.articleId,
    parentCommentId: comment.parentCommentId,
    parentCommentNickname: comment.parentCommentNickname,
    depth: comment.depth,
    content: comment.content,
    image: comment.image,
    state: comment.state,
    modifiedEmail: comment.modifiedEmail,
    createdAt:
      comment.createdAt instanceof Date ? comment.createdAt.toISOString() : comment.createdAt,
    updatedAt:
      comment.updatedAt instanceof Date ? comment.updatedAt.toISOString() : comment.updatedAt,
    like: comment.likes?.length ?? 0,
    likes: comment.likes ?? []
  };
}

/**
 * @param {string} articleId
 * @param {string} [boardId]
 * @param {import('@prisma/client').Prisma.CommentSelect} [select]
 */
export async function findCommentsByArticle(articleId, boardId, select) {
  try {
    /** @type {import('@prisma/client').Prisma.CommentWhereInput} */
    const where = { articleId };
    if (boardId) where.boardId = boardId;

    return await getPrisma().comment.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      ...(select ? { select } : {})
    });
  } catch {
    return [];
  }
}

/**
 * @param {string} id
 */
export async function findCommentById(id) {
  try {
    return await getPrisma().comment.findUnique({ where: { id } });
  } catch {
    return null;
  }
}

/**
 * @template {import('@prisma/client').Prisma.CommentSelect | undefined} TSelect
 * @param {object} params
 * @param {string} params.id
 * @param {string} params.email
 * @param {string} params.boardId
 * @param {string} params.articleId
 * @param {TSelect} [params.select]
 * @returns {Promise<TSelect extends import('@prisma/client').Prisma.CommentSelect ? import('@prisma/client').Prisma.CommentGetPayload<{ select: TSelect }> | null : import('@prisma/client').Comment | null>}
 */
export async function findOwnedActiveComment({ id, email, boardId, articleId, select }) {
  try {
    return await getPrisma().comment.findFirst({
      where: {
        id,
        email,
        boardId,
        articleId,
        state: 'write'
      },
      ...(select ? { select } : {})
    });
  } catch {
    return null;
  }
}

/**
 * @param {object} data
 * @param {string} data.email
 * @param {string} data.nickname
 * @param {string} [data.photo]
 * @param {string} data.boardId
 * @param {string} data.articleId
 * @param {string} [data.content]
 * @param {string} [data.image]
 * @param {string} [data.parentCommentId]
 * @param {string} [data.parentCommentNickname]
 * @param {number} [data.depth]
 */
export async function createComment(data) {
  const id = crypto.randomBytes(12).toString('hex');
  return await getPrisma().comment.create({
    data: {
      id,
      email: data.email,
      nickname: data.nickname,
      photo: data.photo ?? null,
      boardId: data.boardId,
      articleId: data.articleId,
      content: data.content ?? null,
      image: data.image ?? null,
      parentCommentId: data.parentCommentId ?? null,
      parentCommentNickname: data.parentCommentNickname ?? null,
      depth: data.depth ?? 1
    }
  });
}

/**
 * @param {string} id
 * @param {object} data
 * @param {string} [data.content]
 * @param {string} [data.image]
 * @param {string} [data.modifiedEmail]
 */
export async function updateComment(id, data) {
  /** @type {import('@prisma/client').Prisma.CommentUpdateInput} */
  const updateData = {};
  if (data.content !== undefined) updateData.content = data.content;
  if (data.image !== undefined) updateData.image = data.image;
  if (data.modifiedEmail !== undefined) updateData.modifiedEmail = data.modifiedEmail;

  return await getPrisma().comment.update({
    where: { id },
    data: updateData
  });
}

/**
 * @param {string} id
 * @param {string} [modifiedEmail]
 */
export async function softDeleteComment(id, modifiedEmail) {
  return await getPrisma().comment.update({
    where: { id },
    data: {
      state: 'deleted',
      ...(modifiedEmail ? { modifiedEmail } : {})
    }
  });
}

/**
 * @param {string} commentId
 * @param {string} email
 * @param {'like' | 'unlike'} [action='like']
 */
export async function toggleCommentLike(commentId, email, action = 'like') {
  try {
    const prisma = getPrisma();
    const comment = await prisma.comment.findUnique({ where: { id: commentId } });
    if (!comment) return null;

    if (action === 'like') {
      if (comment.likes.includes(email)) return comment;
      return await prisma.comment.update({
        where: { id: commentId },
        data: { likes: { push: email } }
      });
    }

    if (comment.unlikes.includes(email)) return comment;
    return await prisma.comment.update({
      where: { id: commentId },
      data: { unlikes: { push: email } }
    });
  } catch {
    return null;
  }
}

/**
 * @param {object} param
 * @param {string} param.email
 * @param {string} param.articleId
 * @param {string} param.boardId
 * @param {string} param.content
 * @param {string} [param.parentCommentId]
 * @param {number} [param.withinMs=12000]
 * @returns {Promise<{ _id: string } | null>}
 */
export async function findRecentDuplicateComment({
  email,
  articleId,
  boardId,
  content,
  parentCommentId = '',
  withinMs = 12000
}) {
  try {
    /** @type {import('@prisma/client').Prisma.CommentWhereInput} */
    const where = {
      email,
      articleId,
      boardId,
      content,
      state: 'write',
      createdAt: { gte: new Date(Date.now() - withinMs) }
    };

    if (parentCommentId) {
      where.parentCommentId = parentCommentId;
    } else {
      where.parentCommentId = null;
    }

    const row = await getPrisma().comment.findFirst({
      where,
      orderBy: { createdAt: 'desc' },
      select: { id: true }
    });
    return row ? { _id: row.id } : null;
  } catch {
    return null;
  }
}

/**
 * @param {string} articleId
 * @returns {Promise<number>}
 */
export async function countCommentsByArticle(articleId) {
  try {
    return await getPrisma().comment.count({
      where: { articleId, state: 'write' }
    });
  } catch {
    return 0;
  }
}

/**
 * @param {string[]} articleIds
 * @returns {Promise<Record<string, number>>}
 */
export async function countCommentsByArticles(articleIds) {
  /** @type {Record<string, number>} */
  const counts = {};
  if (articleIds.length === 0) return counts;

  try {
    const rows = await getPrisma().comment.groupBy({
      by: ['articleId'],
      where: { articleId: { in: articleIds }, state: 'write' },
      _count: { _all: true }
    });
    for (const row of rows) {
      counts[row.articleId] = row._count._all;
    }
  } catch {
    // graceful fallback
  }
  return counts;
}

/**
 * @param {string[]} articleIds
 * @returns {Promise<Record<string, { count: number; latestCreatedAt: Date | null }>>}
 */
export async function summarizeCommentsByArticles(articleIds) {
  /** @type {Record<string, { count: number; latestCreatedAt: Date | null }>} */
  const summary = {};
  if (articleIds.length === 0) return summary;

  try {
    const rows = await getPrisma().comment.groupBy({
      by: ['articleId'],
      where: { articleId: { in: articleIds }, state: 'write' },
      _count: { _all: true },
      _max: { createdAt: true }
    });
    for (const row of rows) {
      summary[row.articleId] = {
        count: row._count._all,
        latestCreatedAt: row._max.createdAt ?? null
      };
    }
  } catch {
    // graceful fallback
  }
  return summary;
}

/**
 * @param {string[]} articleIds
 * @returns {Promise<Record<string, Date>>}
 */
export async function latestCommentAtByArticles(articleIds) {
  /** @type {Record<string, Date>} */
  const latest = {};
  if (articleIds.length === 0) return latest;

  try {
    const rows = await getPrisma().comment.findMany({
      where: { articleId: { in: articleIds }, state: 'write' },
      orderBy: [{ articleId: 'asc' }, { createdAt: 'desc' }],
      select: { articleId: true, createdAt: true },
      distinct: ['articleId']
    });
    for (const row of rows) {
      latest[row.articleId] = row.createdAt;
    }
  } catch {
    // graceful fallback
  }
  return latest;
}
