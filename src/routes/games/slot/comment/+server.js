import { error, json } from '@sveltejs/kit';
import { getPrisma } from '$lib/database/prisma.js';
import { markAsRead, upsertAlarm } from '$lib/server/alarm/alarmService.js';
import { createComment, findCommentById, toCommentJson } from '$lib/server/board/commentRepo.js';
import convertToTree from '$lib/util/tree.js';
import { checkAndLogSessionDevice } from '$lib/server/auth/checkSessionDevice.js';
import { getGameSession, isLocalGameSmokeSession } from '$lib/server/localGameSmokeSession.js';
import { attachGameProfilePhotos } from '$lib/server/gameProfilePhotos.js';
import { updateSlotUserBalance } from '$lib/server/slotUserBalance.js';
import { getSeotdaBalance, writeSeotdaScore } from '../../seotda/seotdaBalance.js';
import { ensureSsamchiBalance, writeSsamchiScore } from '../../ssamchi/ssamchiBalance.js';
import {
  buildSubmitFingerprint,
  findRecentDuplicateComment,
  tryAcquireSubmitDedup
} from '$lib/server/submitDedup.js';

const GAME_ARTICLES = {
  slot: { boardId: 'slot', articleId: 'slot', title: '뺑뺑이' },
  seotda: { boardId: 'seotda', articleId: 'seotda', title: '섯다' },
  ssamchi: { boardId: 'ssamchi', articleId: 'ssamchi', title: '홀짝·쌈치기' }
};

/** @param {string | null | undefined} game */
function getGameArticle(game) {
  if (game === 'seotda') return GAME_ARTICLES.seotda;
  if (game === 'ssamchi') return GAME_ARTICLES.ssamchi;
  return GAME_ARTICLES.slot;
}

/** @param {ReturnType<typeof getPrisma>} prisma @param {{ boardId: string; articleId: string; title: string }} gameArticle */
async function ensureGameArticle(prisma, gameArticle) {
  await prisma.article.upsert({
    where: { id: gameArticle.articleId },
    update: {},
    create: {
      id: gameArticle.articleId,
      email: 'system@dgst.me',
      nickname: gameArticle.title,
      boardId: gameArticle.boardId,
      title: gameArticle.title,
      content: '',
      state: 'write'
    }
  });
}

export async function GET(event) {
  const { setHeaders, url } = event;
  // 캐시 방지 헤더 설정
  setHeaders({
    'Cache-Control': 'private, max-age=0, no-store, must-revalidate, proxy-revalidate'
  });

  const session = await getGameSession(event);
  const email = typeof session?.user?.email === 'string' ? session.user.email : '';
  if (isLocalGameSmokeSession(session)) {
    return json({ comments: [], page: 1, perPage: 50, total: 0, totalPages: 0, hasMore: false });
  }
  const gameArticle = getGameArticle(url.searchParams.get('game'));
  const perPageParam = Number(url.searchParams.get('limit') ?? '50');
  const pageParam = Number(url.searchParams.get('page') ?? '1');
  const alarmId = url.searchParams.get('alarm') ?? '';
  const perPage =
    Number.isFinite(perPageParam) && perPageParam > 0 ? Math.min(perPageParam, 50) : 50;
  const page = Number.isFinite(pageParam) && pageParam > 0 ? Math.floor(pageParam) : 1;

  try {
    // 최근 24시간 내 댓글만 조회
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const rows = await getPrisma().comment.findMany({
      where: {
        boardId: gameArticle.boardId,
        articleId: gameArticle.articleId,
        createdAt: { gte: oneDayAgo }
      },
      orderBy: { createdAt: 'desc' }
    });

    const comments = await attachGameProfilePhotos(
      rows.map((c) => ({
        ...toCommentJson(c),
        parentCommentId: c.parentCommentId ?? undefined
      }))
    );

    // ID를 문자열로 변환하고 트리 구조로 변환
    const commentsWithId = comments.map((c) => ({
      ...c,
      id: String(c._id),
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

    /** @type {Array<{ [key: string]: unknown; id: string; depth?: number; parentCommentId?: string; likes?: string[]; liked?: boolean }>} */
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
    if (email) {
      pagedComments.forEach((c) => {
        c.liked = c.likes?.includes(email) || false;
        delete c.likes;
      });

      // 알림 읽음 처리
      const targetAlarmId =
        alarmId === gameArticle.articleId || alarmId.startsWith(`${gameArticle.articleId}_`)
          ? alarmId
          : gameArticle.articleId;
      await markAsRead(email, targetAlarmId);
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
  const { request } = event;
  const session = await getGameSession(event);
  const user = session?.user;
  const email = typeof user?.email === 'string' ? user.email : '';
  if (!email) {
    throw error(401, { message: '로그인이 필요합니다.' });
  }

  await checkAndLogSessionDevice(event, { action: 'games.slot.comment' });

  try {
    const data = await request.formData();
    const content = data.get('content')?.toString()?.trim();
    const parentCommentId = data.get('parentCommentId')?.toString();
    const requestedGame = data.get('game')?.toString();
    const rewardGame =
      requestedGame === 'seotda' || requestedGame === 'ssamchi' ? requestedGame : 'slot';
    const gameArticle = getGameArticle(rewardGame);
    const automatic = data.get('automatic')?.toString() === '1';

    if (!content || content.length === 0) {
      throw error(400, { message: '댓글 내용을 입력해주세요.' });
    }

    if (content.length < 2) {
      throw error(400, { message: '댓글은 2자 이상 입력해주세요.' });
    }

    if (content.length > 1000) {
      throw error(400, { message: '댓글은 1000자 이하여야 합니다.' });
    }
    if (isLocalGameSmokeSession(session)) {
      return json({
        success: true,
        rewardGiven: false,
        smoke: true,
        comment: {
          id: `smoke-${Date.now()}`,
          _id: `smoke-${Date.now()}`,
          email,
          nickname: typeof user?.nickname === 'string' ? user.nickname : '로컬스모크',
          content,
          depth: parentCommentId ? 2 : 1,
          parentCommentId: parentCommentId || undefined,
          createdAt: new Date().toISOString()
        }
      });
    }

    const fingerprint = buildSubmitFingerprint([
      gameArticle.boardId,
      gameArticle.articleId,
      parentCommentId ?? '',
      content
    ]);
    const acquired = await tryAcquireSubmitDedup('comment', email, fingerprint, 8);
    if (!acquired) {
      const dup = await findRecentDuplicateComment({
        email,
        articleId: gameArticle.articleId,
        boardId: gameArticle.boardId,
        content,
        parentCommentId: parentCommentId ?? ''
      });
      if (dup) {
        return json({ success: true, rewardGiven: false, duplicate: true });
      }
    }

    const nickname =
      typeof user?.nickname === 'string' && user.nickname ? user.nickname : 'anonymous';
    const photo = typeof user?.photo === 'string' && user.photo ? user.photo : undefined;

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

    const prisma = getPrisma();
    await ensureGameArticle(prisma, gameArticle);

    // 게임 리플 보상은 뺑뺑이·섯다·쌈치기 합산 하루 10개까지만 지급한다.
    const todayRewardCount = await prisma.gameScore.count({
      where: {
        email,
        game: { in: ['slot', 'seotda', 'ssamchi'] },
        bet: 0,
        payout: 100,
        delta: 100,
        createdAt: { gte: todayStart, lte: todayEnd }
      }
    });

    // 대댓글인 경우 부모 댓글 확인
    let parentComment = null;
    if (parentCommentId) {
      parentComment = await findCommentById(parentCommentId);
      if (
        !parentComment ||
        parentComment.boardId !== gameArticle.boardId ||
        parentComment.articleId !== gameArticle.articleId
      ) {
        throw error(400, { message: '부모 댓글을 찾을 수 없습니다.' });
      }
    }

    const comment = await createComment({
      email,
      nickname,
      photo,
      boardId: gameArticle.boardId,
      articleId: gameArticle.articleId,
      content,
      depth: parentComment ? parentComment.depth + 1 : 1,
      parentCommentId: parentCommentId || undefined,
      parentCommentNickname: parentComment?.nickname
    });

    // 댓글 작성 보상: 100점 지급 (하루 10개까지만)
    let rewardGiven = false;
    if (!automatic && todayRewardCount < 10) {
      if (rewardGame === 'seotda') {
        const newBalance = (await getSeotdaBalance(email)) + 100;
        await writeSeotdaScore(email, nickname, newBalance, {
          bet: 0,
          payout: 100,
          delta: 100,
          reels: ['comment', 'seotda', '-']
        });
      } else if (rewardGame === 'ssamchi') {
        const current = await ensureSsamchiBalance(email, nickname);
        const newBalance = current.balance + 100;
        await writeSsamchiScore(email, nickname, newBalance, {
          payout: 100,
          delta: 100,
          reels: ['comment', 'ssamchi', '-']
        });
      } else {
        const lastScore = await prisma.gameScore.findFirst({
          where: { email },
          orderBy: { createdAt: 'desc' }
        });
        const currentBalance = Number(lastScore?.balance ?? 0);
        const newBalance = currentBalance + 100;
        await prisma.gameScore.create({
          data: {
            email,
            nickname,
            game: 'slot',
            bet: 0,
            payout: 100,
            delta: 100,
            balance: newBalance,
            reels: ['-', '-', '-']
          }
        });
        await updateSlotUserBalance(email, nickname, newBalance, { incSpin: false });
      }
      rewardGiven = true;
    }

    const title = gameArticle.title;

    // 대댓글인 경우: 부모 댓글 작성자에게 알림
    if (parentComment && parentComment.email !== email) {
      await upsertAlarm({
        email: parentComment.email,
        articleId: gameArticle.articleId,
        title,
        boardId: gameArticle.boardId,
        parentCommentId: parentCommentId,
        parentCommentContent: parentComment.content,
        newCommentId: comment.id
      });
    }

    // 일반 댓글인 경우: 알림을 보내지 않음 (대댓글만 알림)

    return json({ success: true, comment: toCommentJson(comment), rewardGiven });
  } catch (err) {
    if (err && typeof err === 'object' && 'status' in err) throw err;
    console.error('댓글 저장 실패', err);
    throw error(500, { message: '댓글 저장 중 오류가 발생하였습니다.' });
  }
}
