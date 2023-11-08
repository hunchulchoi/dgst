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

  let filter = { _id: params.articleId, boardId: params.boardId, state: 'write', createdAt: {$gt: new Date(new Date()-1000*60*60*24*3)} };

  const projection = {email:1, nickname:1, title:1, content:1, reads:1,  likes:1, createdAt:1, read:1, like:1}

  let alarmCount = 0;

  // 알람 삭제
  if(session?.user?.nickname){
    const deleteAlarm = await Alarm.updateMany({email: session.user.email, articleId: params.articleId}
        ,{$set:{readAt: new Date()}}, {timestamps: false});
    console.log('delete alarm', deleteAlarm);

    alarmCount = await Alarm.countDocuments({ email: session.user.email, readAt: null, createdAt: {$gt: new Date(new Date()-1000*60*60*24)} });
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

  // 목록

  // 한페이지에 보여주는 게시물
  const pageUnit = 30;

  let pageNo = parseInt(params.pageNo || 1)

  filter = { boardId: params.boardId, state: 'write', createdAt: {$gt: new Date(new Date()-1000*60*60*24*3)} };

  const total = await Article.countDocuments(filter);

  console.debug('total', total);

  if (!total) {
      return { articles: [] };
  }

  const maxPage = parseInt(total / pageUnit + ((total % pageUnit)?1:0));

  //
  if (maxPage < pageNo) {
      pageNo = maxPage;
  }

  let startNo = 1;
  let endNo = maxPage>7?7:maxPage;

  if(maxPage > 7) {
      if((pageNo - 3) > 0){
          startNo = pageNo - 3;
          endNo = startNo + 6;
      }

      if((pageNo +3) > maxPage){
          endNo = maxPage;
          startNo = endNo - 6;
      }
  }


  const articles = await Article.find(filter,
      {content:1, createdAt:1, nickname:1, title: 1, read:1, like:1, reads:1, comments: 1, likes:1}
  )
      .sort({ createdAt: -1 })
      .skip((pageNo - 1) * pageUnit)
      .limit(pageUnit)
      .populate({path: 'comments', select: 'createdAt'})
      .exec();

  const jsonArticles = JSON.parse(JSON.stringify(articles));

  jsonArticles.forEach((article) => {

      article.isNewComment = Math.max(...article.comments.map(a=>new Date(a.createdAt))) > new Date() - 30*60*1000;

      delete article.comments;
      delete article.reads;
      delete article.likes;

      const image = article.content.includes('<img ');
      const youtube = article.content.includes('<div data-oembed-url=');

      article.content =
          (image ? '<i class="bi bi-card-image text-success px-2"></i>' : '') +
          (youtube ? '<i class="bi bi-youtube text-danger px-2"></i>' : '');
  });

  return {
    article: articleJson,
    photo: author.photo || '/icons/unknown-person-icon-4.jpg',
    introduction: author.introduction,
    alarmCount,
      pageNo, maxPage, startNo, endNo, articles: jsonArticles
  };
};
