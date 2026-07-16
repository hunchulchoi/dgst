import { error, json } from '@sveltejs/kit';
import { checkRateLimit } from '$lib/server/apiRateLimit.js';
import { checkAndLogSessionDevice } from '$lib/server/auth/checkSessionDevice.js';
import { createArticle } from '$lib/server/board/articleRepo.js';
import { bustBoardListCache } from '$lib/server/boardListLoad.js';
import { sanitizeArticleContent } from '$lib/server/sanitizeArticleContent.js';
import { embedSeotdaReplay } from '$lib/server/seotdaReplay.js';
import { evaluateHand } from '../seotdaEngine.js';
import { getRound } from '../seotdaState.js';

const ALLOWED_BOARDS = new Set(['free', 'bug']);
const MAX_BODY_BYTES = 8 * 1024;

/** @param {unknown} value @param {number} maxLength @param {boolean} [multiline] */
function cleanText(value, maxLength, multiline = false) {
  return Array.from(String(value ?? ''))
    .map((char) => {
      const code = char.charCodeAt(0);
      if (multiline && char === '\n') return char;
      return code < 32 || code === 127 ? ' ' : char;
    })
    .join('')
    .trim()
    .slice(0, maxLength);
}

/** @param {import('../seotdaState.js').SeotdaRound} round @param {string} note */
function buildShareContent(round, note) {
  const user = round.seats.find((seat) => seat.id === 'user');
  const winnerIds = round.winnerIds?.length
    ? round.winnerIds
    : round.winnerId
      ? [round.winnerId]
      : [];
  const result = winnerIds.length > 1 ? '무승부' : winnerIds.includes('user') ? '승리' : '패배';
  const userFolded = !!user?.folded;
  const ddaengValuePerLoser = Math.max(0, Number(round.ddaengValuePerLoser) || 0);
  const ddaengTotalPaid = Math.max(0, Number(round.ddaengTotalPaid) || 0);
  const initialPot = Math.max(0, Number(round.antePaid) || 0) * round.seats.length;
  let runningPot = initialPot;
  /** @type {Array<{ type: string; seatId: string | null; text: string; amount: number; potAfter: number }>} */
  const events = [
    { type: 'deal', seatId: null, text: '패를 돌립니다', amount: 0, potAfter: 0 },
    {
      type: 'ante',
      seatId: null,
      text: `판돈 ${Math.max(0, Number(round.antePaid) || 0).toLocaleString('ko-KR')}점`,
      amount: initialPot,
      potAfter: initialPot
    }
  ];

  for (const entry of round.log ?? []) {
    if (entry.startsWith('판돈 ') || entry.endsWith(' 선') || entry.includes('재입장')) continue;
    const seat = round.seats.find(
      (candidate) =>
        entry.startsWith(`${candidate.name}:`) || entry.startsWith(`${candidate.name} `)
    );
    const amountMatch = entry.match(/\(([\d,]+)\)/);
    const amount = amountMatch ? Number(amountMatch[1].replaceAll(',', '')) || 0 : 0;
    const type = entry.includes('땡값')
      ? 'ddaeng'
      : entry.includes('→')
        ? 'showdown'
        : entry.includes('승리') || entry.includes('무승부')
          ? 'result'
          : entry.includes('“')
            ? 'taunt'
            : 'action';
    if (type === 'action' && /콜|레이즈|올인/.test(entry)) runningPot += amount;
    events.push({ type, seatId: seat?.id ?? null, text: entry, amount, potAfter: runningPot });
  }

  const loggedResult = events.find((event) => event.type === 'result') ?? null;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    if (events[index].type === 'result') events.splice(index, 1);
  }
  if (!events.some((event) => event.type === 'showdown')) {
    events.push({
      type: 'showdown',
      seatId: null,
      text: '패 공개',
      amount: 0,
      potAfter: runningPot
    });
  }
  if (ddaengValuePerLoser && !events.some((event) => event.type === 'ddaeng')) {
    events.push({
      type: 'ddaeng',
      seatId: String(round.ddaengWinnerId ?? '') || null,
      text: `땡값 ${String(round.ddaengHandName ?? '땡')}: ${ddaengValuePerLoser.toLocaleString('ko-KR')}씩 · 총 ${ddaengTotalPaid.toLocaleString('ko-KR')}`,
      amount: ddaengTotalPaid,
      potAfter: runningPot
    });
  }
  if (loggedResult) {
    events.push(loggedResult);
  } else {
    const winnerNames = round.seats
      .filter((seat) => winnerIds.includes(seat.id))
      .map((seat) => seat.name)
      .join(', ');
    events.push({
      type: 'result',
      seatId: winnerIds.length === 1 ? winnerIds[0] : null,
      text: winnerNames ? `${winnerNames} ${result}` : result,
      amount: 0,
      potAfter: runningPot
    });
  }

  const totalContributed = round.seats.reduce(
    (sum, seat) => sum + Math.max(0, Number(seat.totalContrib) || 0),
    0
  );
  const replay = {
    version: 1,
    result,
    ante: Math.max(0, Number(round.antePaid) || 0),
    finalPot: Math.max(runningPot, totalContributed),
    note,
    seats: round.seats.map((seat) => {
      const revealDdaengWinner = userFolded && seat.isNpc && seat.id === round.ddaengWinnerId;
      const revealCards = !seat.isNpc || !userFolded || revealDdaengWinner;
      return {
        id: seat.id,
        name: seat.name,
        chips: Math.max(0, Number(seat.chips) || 0),
        folded: !!seat.folded,
        winner: winnerIds.includes(seat.id),
        handName: revealCards ? evaluateHand(seat.cards).name : '비공개',
        cards: revealCards ? seat.cards : []
      };
    }),
    events,
    ddaeng: ddaengValuePerLoser
      ? {
          winnerId: String(round.ddaengWinnerId ?? ''),
          handName: String(round.ddaengHandName ?? '땡'),
          valuePerLoser: ddaengValuePerLoser,
          totalPaid: ddaengTotalPaid
        }
      : null
  };

  return sanitizeArticleContent(
    `<p>섯다 한 판 리플레이를 공유했습니다.</p>${embedSeotdaReplay(replay)}`
  );
}

/** @param {import('@sveltejs/kit').RequestEvent} event */
export async function POST(event) {
  const session = await event.locals.auth();
  if (!session?.user?.email || !session.user.nickname) {
    throw error(401, { message: '로그인 후 섯다 결과를 공유할 수 있습니다.' });
  }

  const rate = await checkRateLimit(event, {
    bucket: 'seotda-share',
    limit: 5,
    windowSeconds: 60
  });
  if (!rate.allowed) {
    throw error(429, { message: '공유가 너무 많습니다. 잠시 후 다시 시도하세요.' });
  }

  const rawBody = await event.request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    throw error(413, { message: '공유 내용이 너무 큽니다.' });
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw error(400, { message: '공유 데이터가 올바르지 않습니다.' });
  }

  const round = getRound(session.user.email);
  if (!round || round.phase !== 'showdown' || !round.showdown) {
    throw error(400, { message: '끝난 섯다 판만 공유할 수 있습니다.' });
  }

  const boardId = ALLOWED_BOARDS.has(body?.boardId) ? body.boardId : 'free';
  const user = round.seats.find((seat) => seat.id === 'user');
  const userHand = user?.cards?.length === 2 ? evaluateHand(user.cards).name : '결과';
  const title = cleanText(body?.title, 80) || `[섯다] ${userHand}`;
  const note = cleanText(body?.note, 500, true);
  const content = buildShareContent(round, note);

  await checkAndLogSessionDevice(event, { action: 'seotda.share' });
  const article = await createArticle({
    email: session.user.email,
    nickname: session.user.nickname,
    boardId,
    title,
    content
  });
  await bustBoardListCache(boardId);

  return json({ success: true, boardId, articleId: article.id });
}
