import { error } from '@sveltejs/kit';
import connectDB from '$lib/database/mongoosePriomise.js';
import { Article } from '$lib/models/article.js';
import { User } from '$lib/models/user.js';
import { fetchLottoHistory, countAllLottoPicks24h } from '$lib/server/lotto.js';
import { computeLottoWeekMatchSummary } from '$lib/server/lottoOfficial.js';

connectDB();

export const load = async ({ params, depends, locals }) => {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  // 캐시 키를 매번 다르게 생성하여 캐시 방지
  depends('board-list');

  const session = await locals.auth();
  const viewerEmail = session?.user?.email ?? null;

  console.log('📊 [자유게시판] load 함수 시작:', {
    boardId: params.boardId,
    pageNo: params.pageNo,
    timestamp,
    startTime
  });

  // 한페이지에 보여주는 게시물
  const pageUnit = 30;

  let pageNo = parseInt(params.pageNo || 1);

  try {
    const filter = {
      boardId: params.boardId,
      state: 'write',
      createdAt: { $gt: new Date(new Date() - 1000 * 60 * 60 * 24 * 3) }
    };

    const dbStartTime = Date.now();
    const total = await Article.countDocuments(filter);
    const dbEndTime = Date.now();

    console.debug('total', total);

    if (!total) {
      if (params.boardId === 'free') {
        const [lottoHistory, lottoWeekMatch, lottoTotalPicks24h] = await Promise.all([
          fetchLottoHistory(viewerEmail),
          computeLottoWeekMatchSummary(),
          countAllLottoPicks24h()
        ]);
        return { articles: [], lottoHistory, lottoWeekMatch, lottoTotalPicks24h };
      }
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

    const articlesStartTime = Date.now();
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
    const articlesEndTime = Date.now();

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
        Math.max(...article.comments.map((a) => new Date(a.createdAt))) >
        new Date() - 30 * 60 * 1000;

      delete article.comments;
      delete article.reads;
      delete article.likes;

      const image = article.content.includes('<img ');
      const video = article.content.includes('<video ');
      const youtube =
        article.content.includes('youtube.com') ||
        article.content.includes('youtu.be') ||
        article.content.includes('youtube.com/embed');
      const insta =
        article.content.includes('instagram.com') ||
        article.content.includes('blockquote class="instagram-media"');

      article.content =
        (image ? '<i class="bi bi-card-image text-success px-2"></i>' : '') +
        (video ? '<i class="bi bi-camera-video text-primary px-2"></i>' : '') +
        (youtube ? '<i class="bi bi-youtube text-danger px-2"></i>' : '') +
        (insta ? '<i class="bi bi-instagram text-warning px-2"></i>' : '');
    });

    const endTime = Date.now();
    const executionTime = endTime - startTime;

    console.log('✅ [자유게시판] load 함수 완료:', {
      boardId: params.boardId,
      pageNo,
      articleCount: jsonArticles.length,
      totalArticles: total,
      countTime: `${dbEndTime - dbStartTime}ms`,
      findTime: `${articlesEndTime - articlesStartTime}ms`,
      totalTime: `${executionTime}ms`,
      timestamp,
      fromCache: false // 항상 DB에서 조회
    });

    let lottoHistory = [];
    let lottoWeekMatch = null;
    let lottoTotalPicks24h = 0;

    if (params.boardId === 'free') {
      [lottoHistory, lottoWeekMatch, lottoTotalPicks24h] = await Promise.all([
        fetchLottoHistory(viewerEmail),
        computeLottoWeekMatchSummary(),
        countAllLottoPicks24h()
      ]);
    }

    return {
      pageNo,
      maxPage,
      startNo,
      endNo,
      articles: jsonArticles,
      lottoHistory,
      lottoWeekMatch,
      lottoTotalPicks24h
    };
  } catch (err) {
    const endTime = Date.now();
    const executionTime = endTime - startTime;

    console.error('❌ 게시판 목록 로드 실패:', {
      boardId: params.boardId,
      pageNo,
      error: err.message,
      executionTime: `${executionTime}ms`,
      status: 'error',
      stack: err.stack
    });

    throw error(500, '목록을 가져오는 중에 오류가 발생하였습니다.');
  }
};
