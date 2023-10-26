import connectDB from '$lib/database/mongoosePriomise.js';
import { Article } from '$lib/models/article.js';

connectDB();
export const load = async ({ params }) => {
  console.log('[[pageNo=integer]]', params);

  // 한페이지에 보여주는 게시물
  const pageUnit = 30;

  let pageNo = params.pageNo || 1;

  try {
    const filter = { boardId: params.boardId, state: 'write', createdAt: {$gt: new Date(new Date()-1000*60*60*24*3)} };

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
    
    let start = 1;
    let end = maxPage;
    
    if(maxPage > 7) {
      if((pageNo - 3) > 0){
        start = pageNo - 3;
        end = start + 6;
      }
      
      if(pageNo +3 < maxPage){
        end = maxPage;
        start = end - 6;
      }
      
      start = end - 6;
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

    return { pageNo, maxPage, start, end, articles: jsonArticles };
    
  } catch (error) {
    console.error('[[pageNo=integer]]', error);
    throw error(500, '목록을 가져오는 중에 오류가 발생하였습니다.');
  }
};
