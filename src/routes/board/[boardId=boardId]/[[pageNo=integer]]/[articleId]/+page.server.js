import connectDB from '$lib/database/mongoosePriomise.js';
import { Article } from '$lib/models/article.js';
import { error } from '@sveltejs/kit';
import { User } from '$lib/models/user.js';
import {Alarm} from "$lib/models/alarm.js";
import {Comment} from "$lib/models/comment.js";
import convertToTree from '$lib/util/tree.js';

connectDB();
export const load = async ({ params, locals }) => {

  if (!params.articleId) {
    throw error(400, { message: '잘못된 접근입니다.' });
  }

  const session = await locals.getSession();

  const filter = { _id: params.articleId, boardId: params.boardId, state: 'write', createdAt: {$gt: new Date(new Date()-1000*60*60*24*3)} };

  const projection = {email:1, nickname:1, title:1, content:1, reads:1,  likes:1, createdAt:1, read:1, like:1}

  let alarmCount = 0;
  
  // 알람 삭제
  if(session?.user?.nickname){
    const deleteAlarm = await Alarm.deleteMany({email: session.user.email, articleId: params.articleId});
    console.log('delete alarm', deleteAlarm);
    
    alarmCount = await Alarm.countDocuments({ email: session.user.email });
  }
  
  const article = await Article.findOneAndUpdate(
    filter,
    { $addToSet: { reads: session?.user?.email } },
    { new: true, timestamps: false, projection }
  );
  
  if (!article) {
    throw error(410, { message: `삭제되었거나 존지하지 않는 게시물입니다.
    게시물은 72시간만 조회 가능합니다.` });
  }
  
  const comments = await Comment.find({articleId: params.articleId})
    .sort('createdAt');
  
  //console.log('comments', comments)
  
  const commentTree = convertToTree(comments, 'id', 'parentCommentId', 'childComments')

  //console.log('commentTree', commentTree);
  
  article.comments = commentTree;
  
  const author = await User.findOne({ email: article.email }, { photo: 1, introduction: 1 }).lean();
  
  const articleJson = JSON.parse(JSON.stringify(article));
  
  if(session?.user?.email) {
    articleJson.liked = article.likes.includes(session.user.email);
    
    articleJson.comments.forEach(comment =>{
      comment.liked = comment.likes.includes(session.user.email)
      delete comment.likes
    })
  }
  
  delete articleJson.likes;
  delete articleJson.reads;
  
  return {
    article: articleJson,
    photo: author.photo || '/icons/unknown-person-icon-4.jpg',
    introduction: author.introduction,
    alarmCount
  };
};
