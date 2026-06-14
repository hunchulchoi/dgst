import { error, json } from '@sveltejs/kit';
import { findArticleById } from '$lib/server/board/articleRepo.js';
import {
  createComment,
  findCommentById,
  findCommentsByArticle,
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

/** @param {import('@sveltejs/kit').RequestEvent} event */
export async function GET({ params, locals }) {
  const boardId = params.boardId;
  const articleId = params.articleId;

  if (!boardId || !articleId) {
    console.error('invalid', params);
    throw error(400, { message: '잘못된 접근입니다.' });
  }

  const session = await locals.auth();

  try {
    const comments = await findCommentsByArticle(articleId, boardId);

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
    console.error('댓글 목록 실패', err);
    throw error(500, { message: '데이터를 가져오는 중에 오류가 발생하였습니다.ㅜㅜ' });
  }
}

/** @param {import('@sveltejs/kit').RequestEvent} event */
export async function POST(event) {
  const { request, params, locals } = event;
  const boardId = params.boardId;
  const articleId = params.articleId;

  if (!boardId || !articleId) {
    console.error('invalid', params);
    throw error(400, { message: '잘못된 접근입니다.' });
  }

  const session = await locals.auth();

  if (!session?.user?.nickname || !session.user.email) {
    throw error(401, { message: '권한이 없습니다. 로그인 해주세요' });
  }
  const userEmail = session.user.email;

  await checkAndLogSessionDevice(event, { action: 'board.comment' });

  const data = await request.formData();

  let storeFileName;
  const image = data.get('image');

  if (image && image instanceof File && image.size > 0) {
    storeFileName = await write(image, userEmail, 'jjal');
  }

  const parentCommentId = data.get('parentCommentId');
  const parentKey = parentCommentId ? String(parentCommentId) : '';

  let parentComment = null;
  if (parentCommentId) {
    parentComment = await findCommentById(String(parentCommentId));
  }

  const contentText = String(data.get('content') ?? '').trim();

  try {
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
        return new Response('ok', { status: 201 });
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

    const article = await findArticleById(articleId, boardId, 'write');

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
  } catch (err) {
    console.error('댓글 저장 실패', err);
    throw error(500, { message: '댓글 저장 중 오류가 발생하였습니다.ㅜㅜ' });
  }

  return new Response('ok', { status: 201 });
}

/** @param {import('@sveltejs/kit').RequestEvent} event */
export async function PUT({ request, params, locals }) {
  const boardId = params.boardId;
  const articleId = params.articleId;

  if (!boardId || !articleId) {
    console.error('invalid', params);
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

  if (!commentId || !content) {
    throw error(400, { message: '댓글 ID와 내용이 필요합니다.' });
  }

  let storeFileName;
  const image = data.get('image');

  if (image && image instanceof File && image.size > 0) {
    storeFileName = await write(image, userEmail, 'jjal');
  }

  try {
    const existing = await findCommentById(String(commentId));
    if (
      !existing ||
      existing.boardId !== boardId ||
      existing.articleId !== articleId ||
      existing.email !== userEmail ||
      existing.state !== 'write'
    ) {
      throw error(401, {
        message: '수정되지 않았습니다. 이미 삭제되었거나 권한이 없는 것 같습니다.'
      });
    }

    /** @type {{ content: string, modifiedEmail: string, image?: string }} */
    const updateData = {
      content: String(content),
      modifiedEmail: userEmail
    };

    if (storeFileName) {
      updateData.image = storeFileName;
    }

    await updateComment(String(commentId), updateData);

    return json({ message: '댓글이 수정되었습니다.' });
  } catch (err) {
    console.error('댓글 수정 실패', err);
    if (err && typeof err === 'object' && 'status' in err) throw err;
    throw error(500, { message: '댓글 수정 중 오류가 발생하였습니다.' });
  }
}

/** @param {import('@sveltejs/kit').RequestEvent} event */
export async function DELETE({ request, params, locals }) {
  const boardId = params.boardId;
  const articleId = params.articleId;

  if (!boardId || !articleId) {
    console.error('invalid', params);
    throw error(400, { message: '잘못된 접근입니다.' });
  }

  const session = await locals.auth();

  if (!session?.user?.nickname || !session.user.email) {
    throw error(401, { message: '권한이 없습니다. 로그인 해주세요' });
  }
  const userEmail = session.user.email;

  const data = await request.json();

  try {
    const existing = await findCommentById(String(data.commentId));
    if (
      !existing ||
      existing.boardId !== boardId ||
      existing.articleId !== articleId ||
      existing.email !== userEmail ||
      existing.state !== 'write'
    ) {
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
    console.error(err);
    if (err && typeof err === 'object' && 'status' in err) throw err;
    throw error(500, { message: '삭제 중에 오류가 발생하였습니다.' });
  }

  return new Response('삭제했습니다.', { status: 200 });
}
