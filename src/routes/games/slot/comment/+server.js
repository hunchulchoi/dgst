import connectDB from '$lib/database/mongoosePriomise.js';
import { error, json } from '@sveltejs/kit';
import { Comment } from '$lib/models/comment.js';
import { markAsRead, upsertAlarm } from '$lib/server/redis/alarmService.js';
import { GameScore } from '$lib/models/gameScore.js';
import convertToTree from '$lib/util/tree.js';
import { checkAndLogSessionDevice } from '$lib/server/auth/checkSessionDevice.js';
import { updateSlotUserBalance } from '$lib/server/slotUserBalance.js';

connectDB();

// 게임용 댓글: boardId='slot', articleId='slot' 사용
const SLOT_BOARD_ID = 'slot';
const SLOT_ARTICLE_ID = 'slot';

export async function GET({ locals, setHeaders, url }) {
  // 캐시 방지 헤더 설정
  setHeaders({
    'Cache-Control': 'private, max-age=0, no-store, must-revalidate, proxy-revalidate'
  });

  const session = await locals.auth();
  const perPageParam = Number(url.searchParams.get('limit') ?? '50');
  const pageParam = Number(url.searchParams.get('page') ?? '1');
  const perPage =
    Number.isFinite(perPageParam) && perPageParam > 0 ? Math.min(perPageParam, 50) : 50;
  const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;

  try {
    // 최근 24시간 내 댓글만 조회
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const comments = await Comment.find(
      {
        boardId: SLOT_BOARD_ID,
        articleId: SLOT_ARTICLE_ID,
        createdAt: { $gte: oneDayAgo }
      },
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
    )
      .sort({ createdAt: -1 })
      .lean();

    // ID를 문자열로 변환하고 트리 구조로 변환
    const commentsWithId = comments.map((c) => ({
      ...c,
      id: c._id.toString(),
      parentCommentId: c.parentCommentId?.toString()
    }));

    // 대댓글인데 부모가 없는 경우 제외하기 위해 유효한 댓글만 필터링
    const sortedByDepth = [...commentsWithId].sort((a, b) => {
      const depthDiff = (a.depth ?? 1) - (b.depth ?? 1);
      if (depthDiff !== 0) return depthDiff;
      // 깊이가 같으면 생성일 기준 오름차순 정렬
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    });

    const validCommentIds = new Set();
    for (const comment of sortedByDepth) {
      const depth = comment.depth ?? 1;
      if (depth <= 1) {
        validCommentIds.add(comment.id);
        continue;
      }

      if (comment.parentCommentId && validCommentIds.has(comment.parentCommentId)) {
        validCommentIds.add(comment.id);
      }
    }

    const filteredComments = commentsWithId.filter((comment) => validCommentIds.has(comment.id));

    const commentsTree = JSON.parse(JSON.stringify(convertToTree(filteredComments)));
    const total = commentsTree.length;
    const offset = Math.max(0, (page - 1) * perPage);

    if (offset >= total) {
      return json({
        comments: [],
        page,
        perPage,
        total,
        totalPages: total > 0 ? Math.ceil(total / perPage) : 0,
        hasMore: false
      });
    }

    let startIndex = 0;
    let lastRootIndex = 0;
    let processed = 0;

    for (let i = 0; i < commentsTree.length; i++) {
      const depth = commentsTree[i].depth ?? 1;
      if (depth <= 1) {
        lastRootIndex = i;
      }
      if (processed === offset) {
        startIndex = lastRootIndex;
        break;
      }
      processed += 1;
    }

    let count = 0;
    let endIndex = commentsTree.length;
    for (let i = startIndex; i < commentsTree.length; i++) {
      const depth = commentsTree[i].depth ?? 1;
      count += 1;
      if (count >= perPage) {
        let j = i + 1;
        while (j < commentsTree.length && (commentsTree[j].depth ?? 1) > 1) {
          j += 1;
        }
        endIndex = j;
        break;
      }
    }

    const pagedComments = commentsTree.slice(startIndex, endIndex);
    const hasMore = endIndex < commentsTree.length;

    // 좋아요 여부 표시 및 알림 읽음 처리
    if (session?.user?.email) {
      pagedComments.forEach((c) => {
        c.liked = c.likes?.includes(session.user.email) || false;
        delete c.likes;
      });

      // 알림 읽음 처리 (Redis)
      await markAsRead(session.user.email, SLOT_ARTICLE_ID);
    } else {
      pagedComments.forEach((c) => {
        delete c.likes;
      });
    }

    return json({
      comments: pagedComments,
      page,
      perPage,
      total,
      totalPages: total > 0 ? Math.ceil(total / perPage) : 0,
      hasMore
    });
  } catch (err) {
    console.error('댓글 목록 실패', err);
    throw error(500, { message: '데이터를 가져오는 중에 오류가 발생하였습니다.' });
  }
}

export async function POST(event) {
  const { request, locals } = event;
  const session = await locals.auth();
  if (!session?.user?.email) {
    throw error(401, { message: '로그인이 필요합니다.' });
  }

  await checkAndLogSessionDevice(event, { action: 'games.slot.comment' });

  try {
    const data = await request.formData();
    const content = data.get('content')?.toString()?.trim();
    const parentCommentId = data.get('parentCommentId')?.toString();

    if (!content || content.length === 0) {
      throw error(400, { message: '댓글 내용을 입력해주세요.' });
    }

    if (content.length < 2) {
      throw error(400, { message: '댓글은 2자 이상 입력해주세요.' });
    }

    if (content.length > 1000) {
      throw error(400, { message: '댓글은 1000자 이하여야 합니다.' });
    }

    const email = session.user.email;
    const nickname = session.user.nickname || 'anonymous';

    // 한국 시간(KST, UTC+9) 기준으로 당일 0시 계산
    const now = new Date();
    const kstOffset = 9 * 60 * 60 * 1000; // UTC+9
    const kstNow = new Date(now.getTime() + kstOffset);
    const kstYear = kstNow.getUTCFullYear();
    const kstMonth = kstNow.getUTCMonth();
    const kstDate = kstNow.getUTCDate();

    // 한국 시간 기준 오늘 0시 (UTC로 변환)
    const todayStart = new Date(Date.UTC(kstYear, kstMonth, kstDate, 0, 0, 0, 0) - kstOffset);
    // 한국 시간 기준 오늘 23:59:59.999 (UTC로 변환)
    const todayEnd = new Date(Date.UTC(kstYear, kstMonth, kstDate, 23, 59, 59, 999) - kstOffset);

    // 오늘 받은 댓글 보상 개수 체크 (100점 보상은 하루 10개까지만, 한국 시간 기준 당일 0시~23:59:59)
    const todayRewardCount = await GameScore.countDocuments({
      email,
      game: 'slot',
      bet: 0,
      payout: 100,
      delta: 100,
      createdAt: { $gte: todayStart, $lte: todayEnd }
    });

    // 대댓글인 경우 부모 댓글 확인
    let parentComment = null;
    if (parentCommentId) {
      parentComment = await Comment.findById(parentCommentId).lean();
      if (
        !parentComment ||
        parentComment.boardId !== SLOT_BOARD_ID ||
        parentComment.articleId !== SLOT_ARTICLE_ID
      ) {
        throw error(400, { message: '부모 댓글을 찾을 수 없습니다.' });
      }
    }

    const comment = new Comment({
      email: session.user.email,
      nickname: session.user.nickname || 'anonymous',
      photo: session.user.photo,
      boardId: SLOT_BOARD_ID,
      articleId: SLOT_ARTICLE_ID,
      content: content,
      depth: parentComment ? parentComment.depth + 1 : 1,
      parentCommentId: parentCommentId || undefined,
      parentCommentNickname: parentComment?.nickname,
      state: 'write'
    });

    await comment.save();

    // 댓글 작성 보상: 100점 지급 (하루 10개까지만)
    let rewardGiven = false;
    if (todayRewardCount < 10) {
      const lastScore = await GameScore.findOne({ email }).sort({ createdAt: -1 }).lean();
      const currentBalance = lastScore?.balance ?? 0;
      const newBalance = currentBalance + 100;
      await GameScore.create({
        email,
        nickname,
        game: 'slot',
        bet: 0,
        payout: 100,
        delta: 100,
        balance: newBalance,
        reels: ['-', '-', '-']
      });
      await updateSlotUserBalance(email, nickname, newBalance, { incSpin: false });
      rewardGiven = true;
    }

    const title = '뺑뺑이';

    // 대댓글인 경우: 부모 댓글 작성자에게 알림 (Redis)
    if (parentComment && parentComment.email !== session.user.email) {
      await upsertAlarm({
        email: parentComment.email,
        articleId: SLOT_ARTICLE_ID,
        title,
        boardId: SLOT_BOARD_ID,
        parentCommentId: parentCommentId,
        parentCommentContent: parentComment.content,
        newCommentId: comment._id.toString()
      });
    }

    // 일반 댓글인 경우: 알림을 보내지 않음 (대댓글만 알림)

    return json({ success: true, comment, rewardGiven });
  } catch (err) {
    if (err.status) throw err;
    console.error('댓글 저장 실패', err);
    throw error(500, { message: '댓글 저장 중 오류가 발생하였습니다.' });
  }
}
