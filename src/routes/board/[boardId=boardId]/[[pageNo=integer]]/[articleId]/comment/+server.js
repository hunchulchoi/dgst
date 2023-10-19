import connectDB from '$lib/database/mongoosePriomise.js';
import { error, json } from '@sveltejs/kit';
import { Comment } from '$lib/models/comment.js';
import { Article } from '$lib/models/article.js';
import { write } from '$lib/util/fileUpload.js';
import {Alarm} from "$lib/models/alarm.js";

connectDB();

export async function GET({ params }) {
  const boardId = params.boardId;
  const articleId = params.articleId;

  if (!boardId || !articleId) {
    console.error('invalid', params);
    throw error(400, { message: '잘못된 접근입니다.' });
  }

  let comments;

  try {
    comments = await Comment.find(
      { articleId: params.articleId, boardId: params.boardId, state: 'write' },
      { _id: 1, photo: 1, nickname: 1, createdAt: 1, image: 1, email: 1, content: 1 }
    ).sort({ createdAt: -1 });

  } catch (err) {
    console.error('댓글 목록 실패', err);
    throw error(500, { message: '데이터를 가져오는 중에 오류가 발생하였습니다.ㅜㅜ' });
  }

  return json(comments);
}

export async function POST({ request, params, locals }) {

  const boardId = params.boardId;
  const articleId = params.articleId;

  if (!boardId || !articleId) {
    console.error('invalid', params);
    throw error(400, { message: '잘못된 접근입니다.' });
  }

  const session = await locals.getSession();

  // 권한 검사
  if (!session?.user?.nickname) {
    throw error(401, { message: '권한이 없습니다. 로그인 해주세요' });
  }

  const data = await request.formData();

  //파일 저장
  let storeFileName;

  const image = data.get('image');

  if (image) {
    storeFileName = await write(image,  session.user.email,'jjal');
  }

  try {
    const comment = new Comment({
      email: session.user.email,
      nickname: session.user.nickname,
      photo: session.user.photo,
      boardId,
      articleId: articleId,
      content: data.get('content')
    });

    if (storeFileName) comment.image = storeFileName;

    console.log(comment);

    const inserted = await comment.save();

    console.log('inserted', inserted);

    const article = await Article.findByIdAndUpdate(articleId, {
      $push: { comments: comment._id }
    }).lean();

    // 내글이 아닐때 알림
    if(article.email !== session.user.email){
        const alarm = await Alarm.findOneAndUpdate({email: article.email, articleId: articleId}
          , {$set:{title: article.title, boardId: boardId}, $addToSet: {comments: comment._id}}
          , {upsert: true, new: true}).lean();
    }

  } catch (err) {
    console.error('댓글 저장 실패', err);
    throw error(500, { message: '댓글 저장 중 오류가 발생하였습니다.ㅜㅜ' });
  }

  return new Response('ok', { status: 201 });
}

export async function DELETE({ request, params, locals }) {

  const boardId = params.boardId;
  const articleId = params.articleId;

  if (!boardId || !articleId) {
    console.error('invalid', params);
    throw error(400, { message: '잘못된 접근입니다.' });
  }

  const session = await locals.getSession();

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

   await Article.updateOne({_id:articleId}
     , {$pull: {comments: data.commentId}}
     , {timestamps: false}
    )

  } catch (err) {
    console.error(err);
    throw error(err.status, err.body.message ?? '삭제 중에 오류가 발생하였습니다.');
  }

  return new Response('ok', { status: 200 });
}
