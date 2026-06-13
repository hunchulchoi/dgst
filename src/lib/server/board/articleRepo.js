import crypto from 'crypto';
import { getPrisma } from '$lib/database/prisma.js';

/**
 * @param {string} content
 * @returns {string}
 */
export function contentIcons(content) {
  const image = content.includes('<img ');
  const video = content.includes('<video ');
  const youtube =
    content.includes('youtube.com') ||
    content.includes('youtu.be') ||
    content.includes('youtube.com/embed');
  const insta =
    content.includes('instagram.com') || content.includes('blockquote class="instagram-media"');

  return (
    (image ? '<i class="bi bi-card-image text-success px-2"></i>' : '') +
    (video ? '<i class="bi bi-camera-video text-primary px-2"></i>' : '') +
    (youtube ? '<i class="bi bi-youtube text-danger px-2"></i>' : '') +
    (insta ? '<i class="bi bi-instagram text-warning px-2"></i>' : '')
  );
}

/**
 * @typedef {{
 *   _id: string;
 *   email: string;
 *   nickname: string;
 *   boardId: string;
 *   title: string;
 *   content: string;
 *   state: string;
 *   modifiedEmail: string | null;
 *   createdAt: string | Date;
 *   updatedAt: string | Date;
 *   read: number;
 *   like: number;
 *   comment: number;
 *   liked?: boolean;
 *   comments?: Array<Record<string, unknown>>;
 * }} ArticleJson
 */

/**
 * @param {import('@prisma/client').Article} article
 * @param {number} [commentCount]
 * @returns {ArticleJson}
 */
export function toArticleJson(article, commentCount = 0) {
  return {
    _id: article.id,
    email: article.email,
    nickname: article.nickname,
    boardId: article.boardId,
    title: article.title,
    content: article.content,
    state: article.state,
    modifiedEmail: article.modifiedEmail,
    createdAt:
      article.createdAt instanceof Date ? article.createdAt.toISOString() : article.createdAt,
    updatedAt:
      article.updatedAt instanceof Date ? article.updatedAt.toISOString() : article.updatedAt,
    read: article.reads?.length ?? 0,
    like: article.likes?.length ?? 0,
    comment: commentCount
  };
}

/**
 * @param {string} id
 * @param {string} boardId
 * @param {string} [state]
 */
export async function findArticleById(id, boardId, state = 'write') {
  try {
    return await getPrisma().article.findFirst({
      where: { id, boardId, state }
    });
  } catch {
    return null;
  }
}

/**
 * @param {string} id
 * @param {string} viewerId
 */
export async function addRead(id, viewerId) {
  try {
    const prisma = getPrisma();
    const article = await prisma.article.findUnique({ where: { id } });
    if (!article) return null;
    if (article.reads.includes(viewerId)) return article;

    return await prisma.article.update({
      where: { id },
      data: { reads: { push: viewerId } }
    });
  } catch {
    return null;
  }
}

/**
 * @param {import('@prisma/client').Prisma.ArticleWhereInput} filter
 */
export async function countArticles(filter) {
  try {
    return await getPrisma().article.count({ where: filter });
  } catch {
    return 0;
  }
}

/**
 * @param {object} params
 * @param {string} params.boardId
 * @param {string} [params.state]
 * @param {number} params.pageNo
 * @param {number} params.pageUnit
 * @param {Date} [params.createdAfter]
 */
export async function findArticlesList({
  boardId,
  state = 'write',
  pageNo,
  pageUnit,
  createdAfter
}) {
  try {
    /** @type {import('@prisma/client').Prisma.ArticleWhereInput} */
    const where = { boardId, state };
    if (createdAfter) {
      where.createdAt = { gt: createdAfter };
    }

    return await getPrisma().article.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (pageNo - 1) * pageUnit,
      take: pageUnit
    });
  } catch {
    return [];
  }
}

/**
 * @param {object} data
 * @param {string} data.email
 * @param {string} data.nickname
 * @param {string} data.boardId
 * @param {string} data.title
 * @param {string} data.content
 */
export async function createArticle(data) {
  const id = crypto.randomBytes(12).toString('hex');
  return await getPrisma().article.create({
    data: {
      id,
      email: data.email,
      nickname: data.nickname,
      boardId: data.boardId,
      title: data.title,
      content: data.content
    }
  });
}

/**
 * @param {string} id
 * @param {object} data
 * @param {string} [data.title]
 * @param {string} [data.content]
 * @param {string} [data.modifiedEmail]
 */
export async function updateArticle(id, data) {
  /** @type {import('@prisma/client').Prisma.ArticleUpdateInput} */
  const updateData = {};
  if (data.title !== undefined) updateData.title = data.title;
  if (data.content !== undefined) updateData.content = data.content;
  if (data.modifiedEmail !== undefined) updateData.modifiedEmail = data.modifiedEmail;

  return await getPrisma().article.update({
    where: { id },
    data: updateData
  });
}

/**
 * @param {string} id
 * @param {string} [modifiedEmail]
 */
export async function softDeleteArticle(id, modifiedEmail) {
  return await getPrisma().article.update({
    where: { id },
    data: {
      state: 'deleted',
      ...(modifiedEmail ? { modifiedEmail } : {})
    }
  });
}

/**
 * @param {string} id
 * @param {string} email
 * @param {'like' | 'unlike'} [action='like']
 */
export async function toggleArticleLike(id, email, action = 'like') {
  try {
    const prisma = getPrisma();
    const article = await prisma.article.findUnique({ where: { id } });
    if (!article) return null;

    if (action === 'like') {
      if (article.likes.includes(email)) return article;
      return await prisma.article.update({
        where: { id },
        data: { likes: { push: email } }
      });
    }

    if (article.unlikes.includes(email)) return article;
    return await prisma.article.update({
      where: { id },
      data: { unlikes: { push: email } }
    });
  } catch {
    return null;
  }
}

/**
 * @param {string} id
 * @param {string} email
 * @param {string} boardId
 * @param {{ title?: string, content?: string, modifiedEmail?: string }} data
 * @param {string} [state]
 */
export async function updateArticleByOwner(id, email, boardId, data, state = 'write') {
  try {
    const existing = await getPrisma().article.findFirst({
      where: { id, email, boardId, state }
    });
    if (!existing) return null;
    return await updateArticle(id, data);
  } catch {
    return null;
  }
}

/**
 * @param {object} param
 * @param {string} param.email
 * @param {string} param.boardId
 * @param {string} param.title
 * @param {number} [param.withinMs=15000]
 * @returns {Promise<{ _id: string } | null>}
 */
export async function findRecentDuplicateArticle({ email, boardId, title, withinMs = 15000 }) {
  try {
    const row = await getPrisma().article.findFirst({
      where: {
        email,
        boardId,
        title,
        state: 'write',
        createdAt: { gte: new Date(Date.now() - withinMs) }
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true }
    });
    return row ? { _id: row.id } : null;
  } catch {
    return null;
  }
}
