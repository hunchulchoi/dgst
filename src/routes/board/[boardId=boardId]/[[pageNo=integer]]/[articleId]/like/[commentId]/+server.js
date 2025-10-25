import connectDB from '$lib/database/mongoosePriomise.js';
import {error, json} from "@sveltejs/kit";
import {Comment} from "$lib/models/comment.js";

connectDB();

export async function POST({ params, locals }) {
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
  
  const filter = { _id: params.commentId, boardId: params.boardId, articleId: params.articleId, state: 'write' };
  
  const projection = {likes:1, like:1};
  
  const comment = await Comment.findOneAndUpdate(
    filter,
    { $addToSet: { likes: session.user.email } },
    { new: true, timestamps: false, projection }
  );
  
  if (!comment) {
    throw error(410, { message: `삭제되었거나 존지하지 않는 댓글입니다.` });
  }
  
  const commentJson = JSON.parse(JSON.stringify(comment));
  commentJson.liked = comment.likes.includes(session.user.email)
  
  delete commentJson.likes;
  delete commentJson.reads;
  
  return new Response(JSON.stringify(commentJson), { status: 200 });
}
