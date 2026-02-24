import connectDB from '$lib/database/mongoosePriomise.js';
import { Article } from '$lib/models/article.js';
import { error } from '@sveltejs/kit';
import { User } from '$lib/models/user.js';
import { getUnreadAlarmCount, markAsRead } from '$lib/server/redis/alarmService.js';
import { Comment } from '$lib/models/comment.js';
import convertToTree from '$lib/util/tree.js';

connectDB();
export const load = async ({ params, locals, cookies }) => {
  if (!params.articleId) {
    throw error(400, { message: '잘못된 접근입니다.' });
  }

  const session = await locals.auth();

  let filter = { _id: params.articleId, boardId: params.boardId, state: 'write' };

  const projection = {
    email: 1,
    nickname: 1,
    title: 1,
    content: 1,
    reads: 1,
    likes: 1,
    createdAt: 1,
    read: 1,
    like: 1
  };

  let alarmCount = 0;

  // 알람 읽음 처리 (Redis): 해당 글을 읽을 때만 처리
  if (session?.user?.nickname) {
    await markAsRead(session.user.email, params.articleId);
    alarmCount = await getUnreadAlarmCount(session.user.email);
  }

  // 비로그인 사용자도 기기 ID로 조회수를 올릴 수 있도록 처리
  const viewerId = session?.user?.email || cookies.get('dgst_device') || `guest-${Date.now()}`;

  const article = await Article.findOneAndUpdate(
    filter,
    { $addToSet: { reads: viewerId } },
    { new: true, timestamps: false, projection }
  );

  if (!article) {
    throw error(404, { message: `삭제되었거나 존재하지 않는 게시물입니다.` });
  }

  const comments = await Comment.find({ articleId: params.articleId }).sort('createdAt');

  //console.log('comments', comments)

  const commentTree = convertToTree(comments, 'id', 'parentCommentId', 'childComments');

  //console.log('commentTree', commentTree);

  article.comments = commentTree;

  const author = await User.findOne({ email: article.email }, { photo: 1, introduction: 1 }).lean();

  const articleJson = JSON.parse(JSON.stringify(article));

  const insta =
    articleJson.content.includes('<div data-oembed-url=') &&
    article.content.includes('instagram.com');

  if (session?.user?.email) {
    articleJson.liked = article.likes.includes(session.user.email);

    articleJson.comments.forEach((comment) => {
      comment.liked = comment.likes.includes(session.user.email);
      delete comment.likes;
    });
  }

  delete articleJson.likes;
  delete articleJson.reads;

  // 목록

  // 한페이지에 보여주는 게시물
  const pageUnit = 30;

  let pageNo = parseInt(params.pageNo || 1);

  filter = {
    boardId: params.boardId,
    state: 'write',
    createdAt: { $gt: new Date(new Date() - 1000 * 60 * 60 * 24 * 3) }
  };

  const total = await Article.countDocuments(filter);

  console.debug('total', total);

  if (!total) {
    return { articles: [] };
  }

  const maxPage = parseInt(total / pageUnit + (total % pageUnit ? 1 : 0));

  //
  if (maxPage < pageNo) {
    pageNo = maxPage;
  }

  let startNo = 1;
  let endNo = maxPage > 7 ? 7 : maxPage;

  if (maxPage > 7) {
    if (pageNo - 3 > 0) {
      startNo = pageNo - 3;
      endNo = startNo + 6;
    }

    if (pageNo + 3 > maxPage) {
      endNo = maxPage;
      startNo = endNo - 6;
    }
  }

  const articles = await Article.find(filter, {
    content: 1,
    createdAt: 1,
    nickname: 1,
    email: 1,
    title: 1,
    read: 1,
    like: 1,
    reads: 1,
    comments: 1,
    likes: 1
  })
    .sort({ createdAt: -1 })
    .skip((pageNo - 1) * pageUnit)
    .limit(pageUnit)
    .populate({ path: 'comments', select: 'createdAt' })
    .exec();

  const jsonArticles = JSON.parse(JSON.stringify(articles));

  const emails = [...new Set(jsonArticles.map((a) => a.email))];
  const users = await User.find({ email: { $in: emails } }, { email: 1, photo: 1 }).lean();
  const userPhotoMap = users.reduce((acc, user) => {
    acc[user.email] = user.photo;
    return acc;
  }, {});

  jsonArticles.forEach((article) => {
    article.photo = userPhotoMap[article.email];
    article.isNewComment =
      Math.max(...article.comments.map((a) => new Date(a.createdAt))) > new Date() - 30 * 60 * 1000;

    delete article.comments;
    delete article.reads;
    delete article.likes;

    const image = article.content.includes('<img ');
    const youtube =
      article.content.includes('youtube.com') ||
      article.content.includes('youtu.be') ||
      article.content.includes('youtube.com/embed');
    const insta =
      article.content.includes('instagram.com') ||
      article.content.includes('blockquote class="instagram-media"');

    article.content =
      (image ? '<i class="bi bi-card-image text-success px-2"></i>' : '') +
      (youtube ? '<i class="bi bi-youtube text-danger px-2"></i>' : '') +
      (insta ? '<i class="bi bi-instagram text-warning px-2"></i>' : '');
  });

  // 카카오톡 등 크롤러용 OG 메타 (SSR에서 안전하게 생성, HTML 제거·길이 제한)
  /** @param {string | null | undefined} str @param {number} [maxLen=200] */
  const safeText = (str, maxLen = 200) => {
    if (str == null) return '';
    const s = String(str)
      .replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim();
    return s.length > maxLen ? s.slice(0, maxLen) : s;
  };
  const ogTitle = `${safeText(articleJson.title, 60)} - ${safeText(articleJson.nickname, 30)}`;
  const ogDescription = safeText(articleJson.content, 200) || `${articleJson.nickname}의 글`;
  const ogUrl = `https://www.dgst.me/board/${params.boardId}/${params.articleId}`;

  // 본문에서 첫 번째 이미지 추출
  const imgMatch = articleJson.content?.match(/<img[^>]+src=["']([^"']+)["']/i);
  let firstImage = imgMatch ? imgMatch[1] : null;
  // 상대 경로일 경우 절대 경로로 변환
  if (firstImage && firstImage.startsWith('/')) {
    firstImage = `https://www.dgst.me${firstImage}`;
  }
  const ogImage = firstImage || 'https://www.dgst.me/logo/twitter_header_photo_2.png';

  return {
    article: articleJson,
    photo: author?.photo || '/icons/unknown-person-icon-4.jpg',
    introduction: author?.introduction,
    insta,
    alarmCount,
    pageNo,
    maxPage,
    startNo,
    endNo,
    articles: jsonArticles,
    ogTitle,
    ogDescription,
    ogUrl,
    ogImage
  };
};
