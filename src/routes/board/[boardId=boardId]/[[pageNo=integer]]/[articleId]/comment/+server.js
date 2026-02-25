import connectDB from '$lib/database/mongoosePriomise.js';
import { error, json } from '@sveltejs/kit';
import { Comment } from '$lib/models/comment.js';
import { Article } from '$lib/models/article.js';
import { write } from '$lib/util/fileUpload.js';
import { upsertAlarm, markAsRead } from '$lib/server/redis/alarmService.js';
import convertToTree from '$lib/util/tree.js';
import { checkAndLogSessionDevice } from '$lib/server/auth/checkSessionDevice.js';
import logger from '$lib/util/logger.js';

connectDB();

export async function GET({ params, locals }) {
  const boardId = params.boardId;
  const articleId = params.articleId;

  if (!boardId || !articleId) {
    console.error('invalid', params);
    throw error(400, { message: '잘못된 접근입니다.' });
  }

  let comments;

  const session = await locals.auth();

  console.debug('session', session);

  try {
    comments = await Comment.find(
      { articleId: params.articleId, boardId: params.boardId },
      {
        _id: 1,
        photo: 1,
        nickname: 1,
        createdAt: 1,
        image: 1,
        email: 1,
        content: 1,
        depth: 1,
        parentCommentId: 1,
        parentCommentNickname: 1,
        state: 1,
        likes: 1,
        like: 1
      }
    ).sort('createdAt');

    // 알람 삭제 (Redis)
    if (session?.user?.email) {
      await markAsRead(session.user.email, params.articleId);
    }
  } catch (err) {
    console.error('댓글 목록 실패', err);
    throw error(500, { message: '데이터를 가져오는 중에 오류가 발생하였습니다.ㅜㅜ' });
  }

  const commentsTree = JSON.parse(JSON.stringify(convertToTree(comments)));

  if (session?.user?.email) {
    commentsTree.forEach((c) => {
      // likes 속성이 존재하는지 체크
      c.liked = c.likes?.includes(session.user.email) || false;
      delete c.likes;
    });
  }

  return json(commentsTree);
}

export async function POST(event) {
  const { request, params, locals } = event;
  const boardId = params.boardId;
  const articleId = params.articleId;

  if (!boardId || !articleId) {
    console.error('invalid', params);
    throw error(400, { message: '잘못된 접근입니다.' });
  }

  const session = await locals.auth();

  if (!session?.user?.nickname) {
    throw error(401, { message: '권한이 없습니다. 로그인 해주세요' });
  }

  await checkAndLogSessionDevice(event, { action: 'board.comment' });

  const data = await request.formData();

  //파일 저장
  let storeFileName;

  const image = data.get('image');

  if (image) {
    storeFileName = await write(image, session.user.email, 'jjal');
  }

  const parentCommentId = data.get('parentCommentId');

  let parentComment;

  if (parentCommentId) {
    parentComment = await Comment.findById(parentCommentId);
  }

  //console.log('parentComment', parentComment);

  try {
    const comment = new Comment({
      email: session.user.email,
      nickname: session.user.nickname,
      photo: session.user.photo,
      boardId,
      articleId: articleId,
      content: data.get('content'),
      parentCommentId,
      depth: parentComment?.depth + 1 || 1,
      parentCommentNickname: parentComment?.nickname
    });

    if (storeFileName) comment.image = storeFileName;

    //console.log(comment);

    const inserted = await comment.save();

    //console.log('inserted', inserted);

    const article = await Article.findByIdAndUpdate(articleId, {
      $push: { comments: comment._id }
    }).lean();

    // 내글이 아닐때 알림 (Redis)
    if (article.email !== session.user.email) {
      if (!parentComment || parentComment.email !== article.email) {
        await upsertAlarm({
          email: article.email,
          articleId: articleId,
          title: article.title,
          boardId: boardId,
          newCommentId: comment._id.toString()
        });
      }
    } else {
      logger.info(`🚨 [Redis Alarm SKIP] 본인 게시글에 작성된 댓글이므로 알람을 생성하지 않습니다.`);
    }

    // 내 댓글이 아닐때 알림 (Redis)
    if (parentComment) {
      if (parentComment.email !== session.user.email) {
        await upsertAlarm({
          email: parentComment.email,
          articleId: articleId,
          title: article.title,
          boardId: boardId,
          parentCommentId: parentComment._id.toString(),
          parentCommentContent: parentComment.content,
          newCommentId: comment._id.toString()
        });
      } else {
        logger.info(`🚨 [Redis Alarm SKIP] 본인 대댓글이므로 알람을 생성하지 않습니다.`);
      }
    }
  } catch (err) {
    console.error('댓글 저장 실패', err);
    throw error(500, { message: '댓글 저장 중 오류가 발생하였습니다.ㅜㅜ' });
  }

  return new Response('ok', { status: 201 });
}

export async function PUT({ request, params, locals }) {
  const boardId = params.boardId;
  const articleId = params.articleId;

  if (!boardId || !articleId) {
    console.error('invalid', params);
    throw error(400, { message: '잘못된 접근입니다.' });
  }

  const session = await locals.auth();

  // 권한 검사
  if (!session?.user?.nickname) {
    throw error(401, { message: '권한이 없습니다. 로그인 해주세요' });
  }

  const data = await request.formData();
  const commentId = data.get('commentId');
  const content = data.get('content');

  if (!commentId || !content) {
    throw error(400, { message: '댓글 ID와 내용이 필요합니다.' });
  }

  // 파일 저장
  let storeFileName;
  const image = data.get('image');

  if (image) {
    storeFileName = await write(image, session.user.email, 'jjal');
  }

  try {
    const updateData = {
      content: content,
      modified_email: session.user.email
    };

    // 새 이미지가 있으면 업데이트
    if (storeFileName) {
      updateData.image = storeFileName;
    }

    const updatedComment = await Comment.findOneAndUpdate(
      { _id: commentId, boardId, articleId, email: session.user.email, state: 'write' },
      updateData,
      { timestamps: true, new: true }
    );

    if (!updatedComment) {
      throw error(401, {
        message: '수정되지 않았습니다. 이미 삭제되었거나 권한이 없는 것 같습니다.'
      });
    }

    return json({ message: '댓글이 수정되었습니다.' });
  } catch (err) {
    console.error('댓글 수정 실패', err);
    throw error(err.status || 500, {
      message: err.body?.message || '댓글 수정 중 오류가 발생하였습니다.'
    });
  }
}

export async function DELETE({ request, params, locals }) {
  const boardId = params.boardId;
  const articleId = params.articleId;

  if (!boardId || !articleId) {
    console.error('invalid', params);
    throw error(400, { message: '잘못된 접근입니다.' });
  }

  const session = await locals.auth();

  // 권한 검사
  if (!session?.user?.nickname) {
    throw error(401, { message: '권한이 없습니다. 로그인 해주세요' });
  }
  const data = await request.json();

  try {
    const update = await Comment.findOneAndUpdate(
      { _id: data.commentId, boardId, articleId, email: session.user.email, state: 'write' },
      { state: 'deleted', modified_email: session.user.email },
      { timestamps: true }
    );

    if (!update) {
      throw error(401, {
        message: '삭제 되지 않았습니다. 이미 삭제되었거나 권한이 없는 것 같습니다.'
      });
    }

    //게시글 리플 목록에서 삭제
    await Article.updateOne(
      { _id: articleId },
      { $pull: { comments: data.commentId } },
      { timestamps: false }
    );
  } catch (err) {
    console.error(err);
    throw error(err.status, err.body.message ?? '삭제 중에 오류가 발생하였습니다.');
  }

  return new Response('삭제했습니다.', { status: 200 });
}
