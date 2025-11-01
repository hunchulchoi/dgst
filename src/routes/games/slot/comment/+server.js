import connectDB from '$lib/database/mongoosePriomise.js';
import { error, json } from '@sveltejs/kit';
import { Comment } from '$lib/models/comment.js';
import { Alarm } from '$lib/models/alarm.js';
import { GameScore } from '$lib/models/gameScore.js';
import convertToTree from '$lib/util/tree.js';

connectDB();

// 게임용 댓글: boardId='slot', articleId='slot' 사용
const SLOT_BOARD_ID = 'slot';
const SLOT_ARTICLE_ID = 'slot';

export async function GET({ locals, setHeaders }) {
  // 캐시 방지 헤더 설정
  setHeaders({
    'Cache-Control': 'private, max-age=0, no-store, must-revalidate, proxy-revalidate'
  });
  
  const session = await locals.auth();
  
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
        _id: 1, photo: 1, nickname: 1, createdAt: 1, image: 1, email: 1, 
        content: 1, depth: 1, parentCommentId: 1, parentCommentNickname: 1, 
        state: 1, likes: 1, like: 1 
      }
    ).sort({ createdAt: -1 }).lean();
    
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

    // 좋아요 여부 표시 및 알림 읽음 처리
    if (session?.user?.email) {
      commentsTree.forEach((c) => {
        c.liked = c.likes?.includes(session.user.email) || false;
        delete c.likes;
      });
      
      // 알림 읽음 처리
      await Alarm.updateMany(
        { email: session.user.email, articleId: SLOT_ARTICLE_ID },
        { $set: { readAt: new Date() } },
        { timestamps: false }
      );
    } else {
      commentsTree.forEach((c) => {
        delete c.likes;
      });
    }

    return json(commentsTree);
  } catch (err) {
    console.error('댓글 목록 실패', err);
    throw error(500, { message: '데이터를 가져오는 중에 오류가 발생하였습니다.' });
  }
}

export async function POST({ request, locals }) {
  const session = await locals.auth();
  if (!session?.user?.email) {
    throw error(401, { message: '로그인이 필요합니다.' });
  }

  try {
    const data = await request.formData();
    const content = data.get('content')?.toString()?.trim();
    const parentCommentId = data.get('parentCommentId')?.toString();
    
    if (!content || content.length === 0) {
      throw error(400, { message: '댓글 내용을 입력해주세요.' });
    }

    if (content.length < 5) {
      throw error(400, { message: '댓글은 5자 이상 입력해주세요.' });
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
      if (!parentComment || parentComment.boardId !== SLOT_BOARD_ID || parentComment.articleId !== SLOT_ARTICLE_ID) {
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
      depth: parentComment ? (parentComment.depth + 1) : 1,
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
      await GameScore.create({
        email,
        nickname,
        game: 'slot',
        bet: 0,
        payout: 100,
        delta: 100,
        balance: currentBalance + 100,
        reels: ['-', '-', '-']
      });
      rewardGiven = true;
    }

    const title = '뺑뺑이';

    // 대댓글인 경우: 부모 댓글 작성자에게 알림
    if (parentComment && parentComment.email !== session.user.email) {
      await Alarm.findOneAndUpdate(
        { email: parentComment.email, articleId: SLOT_ARTICLE_ID, comment: parentCommentId },
        {
          $set: {
            title,
            boardId: SLOT_BOARD_ID,
            comment: parentCommentId,
            commentContent: parentComment.content,
            readAt: null
          },
          $addToSet: { comments: comment._id.toString() }
        },
        { upsert: true, new: true }
      );
    }

    // 일반 댓글인 경우: 알림을 보내지 않음 (대댓글만 알림)

    return json({ success: true, comment, rewardGiven });
  } catch (err) {
    if (err.status) throw err;
    console.error('댓글 저장 실패', err);
    throw error(500, { message: '댓글 저장 중 오류가 발생하였습니다.' });
  }
}

