import connectDB from '$lib/database/mongoosePriomise.js';
import {error, json} from "@sveltejs/kit";
import {Article} from "$lib/models/article.js";

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
  
  const filter = { _id: params.articleId, boardId: params.boardId, state: 'write', createdAt: {$gt: new Date(new Date()-1000*60*60*24*3)} };
  
  const projection = {reads:1,  likes:1, read:1, like:1};
  
  const article = await Article.findOneAndUpdate(
    filter,
    { $addToSet: { likes: session.user.email } },
    { new: true, timestamps: false, projection }
  );
  
  if (!article) {
    throw error(410, { message: `삭제되었거나 존지하지 않는 게시물입니다.
    게시물은 72시간만 조회 가능합니다.` });
  }
  
  const articleJson = JSON.parse(JSON.stringify(article));
  articleJson.liked = article.likes.includes(session.user.email)
  
  delete articleJson.likes;
  delete articleJson.reads;
  
  return new Response(JSON.stringify(articleJson), { status: 200 });
}
