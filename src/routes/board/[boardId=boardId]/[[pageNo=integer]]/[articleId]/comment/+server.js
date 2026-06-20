import { error, isHttpError, json } from '@sveltejs/kit';
import { findArticleAlarmTarget, findArticleById } from '$lib/server/board/articleRepo.js';
import {
  createComment,
  findCommentById,
  findCommentsByArticle,
  findOwnedActiveComment,
  findRecentDuplicateComment,
  softDeleteComment,
  toCommentJson,
  updateComment
} from '$lib/server/board/commentRepo.js';
import { write } from '$lib/util/fileUpload.js';
import { upsertAlarm, markAsRead, removeCommentFromAlarm } from '$lib/server/alarm/alarmService.js';
import convertToTree from '$lib/util/tree.js';
import { checkAndLogSessionDevice } from '$lib/server/auth/checkSessionDevice.js';
import { buildSubmitFingerprint, tryAcquireSubmitDedup } from '$lib/server/submitDedup.js';
import logger from '$lib/util/logger.js';
import { traceFromUnknown } from '$lib/util/formatErrorTrace.js';

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

/**
 * @param {string} articleId
 * @param {string} boardId
 * @returns {Promise<import('@prisma/client').Article>}
 */
async function requireRecentArticle(articleId, boardId) {
  const article = await findArticleById(articleId, boardId, 'write');
  if (!article) {
    throw error(404, { message: '삭제되었거나 존재하지 않는 게시물입니다.' });
  }

  const createdAtMs = new Date(article.createdAt).getTime();
  const createdAfterMs = Date.now() - THREE_DAYS_MS;
  if (Number.isFinite(createdAtMs) && createdAtMs <= createdAfterMs) {
    throw error(404, { message: '삭제되었거나 존재하지 않는 게시물입니다.' });
  }

  return article;
}

/**
 * @param {unknown} err
 * @returns {string}
 */
function getErrorMessage(err) {
  return err instanceof Error ? err.message : String(err);
}

/**
 * @param {string} message
 * @param {unknown} err
 * @param {Record<string, unknown>} context
 */
function logCommentError(message, err, context = {}) {
  logger.error({
    message,
    ...context,
    errorMessage: getErrorMessage(err),
    trace: traceFromUnknown(err)
  });
}

/** @param {import('@sveltejs/kit').RequestEvent} event */
export async function GET({ params, locals }) {
  const boardId = params.boardId;
  const articleId = params.articleId;

  if (!boardId || !articleId) {
    logger.warn({
      message: '[board.comment] invalid params',
      params
    });
    throw error(400, { message: '잘못된 접근입니다.' });
  }

  const session = await locals.auth();

  try {
    await requireRecentArticle(articleId, boardId);

    const comments = await findCommentsByArticle(articleId, boardId, BOARD_COMMENT_SELECT);

    if (session?.user?.email) {
      await markAsRead(session.user.email, articleId);
    }

    const commentsTree = convertToTree(
      comments.map((c) => ({
        ...toCommentJson(c),
        id: c.id
      }))
    );

    const userEmail = session?.user?.email;
    if (userEmail) {
      commentsTree.forEach((c) => {
        c.liked = c.likes?.includes(userEmail) ?? false;
        delete c.likes;
      });
    }

    return json(commentsTree);
  } catch (err) {
    if (isHttpError(err)) throw err;
    logCommentError('[board.comment] list failed', err, {
      boardId,
      articleId,
      email: session?.user?.email ?? null
    });
    throw error(500, { message: '데이터를 가져오는 중에 오류가 발생하였습니다.ㅜㅜ' });
  }
}

/** @param {import('@sveltejs/kit').RequestEvent} event */
export async function POST(event) {
  const { request, params, locals } = event;
  const boardId = params.boardId;
  const articleId = params.articleId;

  if (!boardId || !articleId) {
    logger.warn({
      message: '[board.comment] invalid params',
      params
    });
    throw error(400, { message: '잘못된 접근입니다.' });
  }

  const session = await locals.auth();

  if (!session?.user?.nickname || !session.user.email) {
    throw error(401, { message: '권한이 없습니다. 로그인 해주세요' });
  }
  const userEmail = session.user.email;

  await checkAndLogSessionDevice(event, { action: 'board.comment' });

  const data = await request.formData();

  const parentCommentId = data.get('parentCommentId');
  const parentKey = parentCommentId ? String(parentCommentId) : '';

  const contentText = String(data.get('content') ?? '').trim();

  try {
    let storeFileName;
    const image = data.get('image');

    if (image && image instanceof File && image.size > 0) {
      storeFileName = await write(image, userEmail, 'jjal');
    }

    let parentComment = null;
    if (parentCommentId) {
      parentComment = await findCommentById(String(parentCommentId));
    }

    const fingerprint = buildSubmitFingerprint([boardId, articleId, parentKey, contentText]);
    const acquired = await tryAcquireSubmitDedup('comment', userEmail, fingerprint, 8);
    if (!acquired) {
      const dup = await findRecentDuplicateComment({
        email: userEmail,
        articleId,
        boardId,
        content: contentText,
        parentCommentId: parentKey
      });
      if (dup) {
        return json({ id: dup._id }, { status: 201 });
      }
    }

    const comment = await createComment({
      email: userEmail,
      nickname: session.user.nickname,
      photo: session.user.photo ?? undefined,
      boardId,
      articleId,
      content: contentText,
      parentCommentId: parentCommentId ? String(parentCommentId) : undefined,
      depth: parentComment ? parentComment.depth + 1 : 1,
      parentCommentNickname: parentComment?.nickname,
      image: storeFileName
    });

    const article = await findArticleAlarmTarget(articleId, boardId, 'write');

    if (article && article.email !== userEmail) {
      if (!parentComment || parentComment.email !== article.email) {
        await upsertAlarm({
          email: article.email,
          articleId,
          title: article.title,
          boardId,
          newCommentId: comment.id
        });
      }
    }

    if (parentComment && parentComment.email !== userEmail) {
      await upsertAlarm({
        email: parentComment.email,
        articleId,
        title: article?.title ?? '',
        boardId,
        parentCommentId: parentComment.id,
        parentCommentContent: parentComment.content ?? '',
        newCommentId: comment.id
      });
    }

    return json({ id: comment.id }, { status: 201 });
  } catch (err) {
    if (isHttpError(err)) throw err;
    logCommentError('[board.comment] create failed', err, {
      boardId,
      articleId,
      email: userEmail,
      parentCommentId: parentKey || null
    });
    throw error(500, { message: '댓글 저장 중 오류가 발생하였습니다.ㅜㅜ' });
  }
}

/** @param {import('@sveltejs/kit').RequestEvent} event */
export async function PUT({ request, params, locals }) {
  const boardId = params.boardId;
  const articleId = params.articleId;

  if (!boardId || !articleId) {
    logger.warn({
      message: '[board.comment] invalid params',
      params
    });
    throw error(400, { message: '잘못된 접근입니다.' });
  }

  const session = await locals.auth();

  if (!session?.user?.nickname || !session.user.email) {
    throw error(401, { message: '권한이 없습니다. 로그인 해주세요' });
  }
  const userEmail = session.user.email;

  const data = await request.formData();
  const commentId = data.get('commentId');
  const content = data.get('content');
  const removeImage = data.get('removeImage') === 'true';

  if (!commentId || !content) {
    throw error(400, { message: '댓글 ID와 내용이 필요합니다.' });
  }

  try {
    let storeFileName;
    const image = data.get('image');

    if (image && image instanceof File && image.size > 0) {
      storeFileName = await write(image, userEmail, 'jjal');
    }

    const existing = await findOwnedActiveComment({
      id: String(commentId),
      email: userEmail,
      boardId,
      articleId,
      select: { id: true }
    });

    if (!existing) {
      throw error(401, {
        message: '수정되지 않았습니다. 이미 삭제되었거나 권한이 없는 것 같습니다.'
      });
    }

    /** @type {{ content: string, modifiedEmail: string, image?: string | null }} */
    const updateData = {
      content: String(content),
      modifiedEmail: userEmail
    };

    if (removeImage) {
      updateData.image = null;
    } else if (storeFileName) {
      updateData.image = storeFileName;
    }

    await updateComment(String(commentId), updateData);

    return json({ message: '댓글이 수정되었습니다.' });
  } catch (err) {
    if (isHttpError(err)) throw err;
    logCommentError('[board.comment] update failed', err, {
      boardId,
      articleId,
      commentId: String(commentId),
      email: userEmail
    });
    throw error(500, { message: '댓글 수정 중 오류가 발생하였습니다.' });
  }
}

/** @param {import('@sveltejs/kit').RequestEvent} event */
export async function DELETE({ request, params, locals }) {
  const boardId = params.boardId;
  const articleId = params.articleId;

  if (!boardId || !articleId) {
    logger.warn({
      message: '[board.comment] invalid params',
      params
    });
    throw error(400, { message: '잘못된 접근입니다.' });
  }

  const session = await locals.auth();

  if (!session?.user?.nickname || !session.user.email) {
    throw error(401, { message: '권한이 없습니다. 로그인 해주세요' });
  }
  const userEmail = session.user.email;

  const data = await request.json();

  try {
    const existing = await findOwnedActiveComment({
      id: String(data.commentId),
      email: userEmail,
      boardId,
      articleId,
      select: { id: true }
    });

    if (!existing) {
      throw error(401, {
        message: '삭제 되지 않았습니다. 이미 삭제되었거나 권한이 없는 것 같습니다.'
      });
    }

    const update = await softDeleteComment(String(data.commentId), userEmail);

    await removeCommentFromAlarm({
      articleId,
      parentCommentId: update.parentCommentId,
      commentId: String(data.commentId)
    });
  } catch (err) {
    if (isHttpError(err)) throw err;
    logCommentError('[board.comment] delete failed', err, {
      boardId,
      articleId,
      commentId: String(data.commentId),
      email: userEmail
    });
    throw error(500, { message: '삭제 중에 오류가 발생하였습니다.' });
  }

  return new Response('삭제했습니다.', { status: 200 });
}
