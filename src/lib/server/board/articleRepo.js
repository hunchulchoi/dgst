import crypto from 'crypto';
import { getPrisma } from '$lib/database/prisma.js';

/**
 * @param {string} content
 * @returns {{ hasImage: boolean; hasVideo: boolean; hasAudio: boolean; hasYoutube: boolean; hasInstagram: boolean }}
 */
export function deriveArticleContentFlags(content) {
  return {
    hasImage: content.includes('<img '),
    hasVideo: content.includes('<video '),
    hasAudio: content.includes('<audio '),
    hasYoutube:
      content.includes('youtube.com') ||
      content.includes('youtu.be') ||
      content.includes('youtube.com/embed'),
    hasInstagram:
      content.includes('instagram.com') || content.includes('blockquote class="instagram-media"')
  };
}

/**
 * @param {{ hasImage?: boolean; hasVideo?: boolean; hasAudio?: boolean; hasYoutube?: boolean; hasInstagram?: boolean }} flags
 * @returns {string}
 */
export function contentIconsFromFlags(flags) {
  return (
    (flags.hasImage ? '<i class="bi bi-card-image text-success px-2"></i>' : '') +
    (flags.hasVideo ? '<i class="bi bi-camera-video text-primary px-2"></i>' : '') +
    (flags.hasAudio ? '<i class="bi bi-music-note-beamed text-info px-2"></i>' : '') +
    (flags.hasYoutube ? '<i class="bi bi-youtube text-danger px-2"></i>' : '') +
    (flags.hasInstagram ? '<i class="bi bi-instagram text-warning px-2"></i>' : '')
  );
}

/**
 * @param {string} content
 * @returns {string}
 */
export function contentIcons(content) {
  return contentIconsFromFlags(deriveArticleContentFlags(content));
}

/**
 * @param {string} content
 * @returns {boolean}
 */
export function hasYoutubeContent(content) {
  return (
    content.includes('youtube.com') ||
    content.includes('youtu.be') ||
    content.includes('youtube.com/embed')
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
 * @param {object} params
 * @param {string} params.id
 * @param {string} params.email
 * @param {string} params.boardId
 * @param {string} [params.state]
 * @param {import('@prisma/client').Prisma.ArticleSelect} [params.select]
 * @returns {Promise<any>}
 */
export async function findOwnedArticle({ id, email, boardId, state = 'write', select }) {
  try {
    return await getPrisma().article.findFirst({
      where: { id, email, boardId, state },
      ...(select ? { select } : {})
    });
  } catch {
    return null;
  }
}

/**
 * 댓글 알람 발송에 필요한 최소 게시글 정보만 조회
 *
 * @param {string} id
 * @param {string} boardId
 * @param {string} [state]
 */
export async function findArticleAlarmTarget(id, boardId, state = 'write') {
  try {
    return await getPrisma().article.findFirst({
      where: { id, boardId, state },
      select: {
        id: true,
        email: true,
        title: true
      }
    });
  } catch {
    return null;
  }
}

/**
 * 게시글 상세 작성자 패널에 필요한 최소 프로필 정보만 조회
 *
 * @param {string} email
 */
export async function findArticleAuthorProfile(email) {
  try {
    return await getPrisma().user.findFirst({
      where: { email },
      select: {
        photo: true,
        introduction: true
      }
    });
  } catch {
    return null;
  }
}

/**
 * @param {string} id
 * @param {string} viewerId
 */
export async function recordArticleRead(id, viewerId) {
  try {
    const prisma = getPrisma();
    const [article, previousRead] = await Promise.all([
      prisma.article.findUnique({ where: { id } }),
      /** @type {any} */ (prisma).articleRead.findUnique({
        where: {
          articleId_viewerId: {
            articleId: id,
            viewerId
          }
        },
        select: { readAt: true }
      })
    ]);
    if (!article) return null;
    const readAt = new Date();
    const result = article.reads.includes(viewerId)
      ? article
      : await prisma.article.update({
          where: { id },
          data: { reads: { push: viewerId } }
        });

    await /** @type {any} */ (prisma).articleRead.upsert({
      where: {
        articleId_viewerId: {
          articleId: id,
          viewerId
        }
      },
      update: { readAt },
      create: {
        articleId: id,
        viewerId,
        readAt
      }
    });
    return {
      article: result,
      previousReadAt: previousRead?.readAt ?? null,
      readAt
    };
  } catch {
    return null;
  }
}

/**
 * @param {string} id
 * @param {string} viewerId
 */
export async function addRead(id, viewerId) {
  const result = await recordArticleRead(id, viewerId);
  return result?.article ?? null;
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
  const contentFlags = deriveArticleContentFlags(data.content);
  return await getPrisma().article.create({
    data: {
      id,
      email: data.email,
      nickname: data.nickname,
      boardId: data.boardId,
      title: data.title,
      content: data.content,
      ...contentFlags
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
  if (data.content !== undefined) {
    updateData.content = data.content;
    Object.assign(updateData, deriveArticleContentFlags(data.content));
  }
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
 * @param {string} boardId
 * @param {string} [state]
 */
export async function softDeleteArticleByOwner(id, email, boardId, state = 'write') {
  try {
    return await getPrisma().article.updateMany({
      where: { id, email, boardId, state },
      data: {
        state: 'deleted',
        modifiedEmail: email
      }
    });
  } catch {
    return { count: 0 };
  }
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
    const existing = await findOwnedArticle({ id, email, boardId, state, select: { id: true } });
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
