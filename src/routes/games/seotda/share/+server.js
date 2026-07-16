import { error, json } from '@sveltejs/kit';
import { checkRateLimit } from '$lib/server/apiRateLimit.js';
import { checkAndLogSessionDevice } from '$lib/server/auth/checkSessionDevice.js';
import { createArticle } from '$lib/server/board/articleRepo.js';
import { bustBoardListCache } from '$lib/server/boardListLoad.js';
import { sanitizeArticleContent } from '$lib/server/sanitizeArticleContent.js';
import { cardLabel, evaluateHand } from '../seotdaEngine.js';
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

/** @param {string} value */
function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** @param {import('../seotdaState.js').SeotdaRound} round @param {string} note */
function buildShareContent(round, note) {
  const user = round.seats.find((seat) => seat.id === 'user');
  const winnerIds = round.winnerIds?.length
    ? round.winnerIds
    : round.winnerId
      ? [round.winnerId]
      : [];
  const result =
    winnerIds.length > 1 ? '무승부' : winnerIds.includes('user') ? '승리' : '패배';
  const hideNpcHands = !!user?.folded;
  const noteHtml = note ? `<p>${escapeHtml(note).replaceAll('\n', '<br>')}</p>` : '';
  const seatsHtml = round.seats
    .map((seat) => {
      const cards = hideNpcHands && seat.isNpc ? '비공개' : seat.cards.map(cardLabel).join(' · ');
      const hand = hideNpcHands && seat.isNpc ? '' : ` · ${evaluateHand(seat.cards).name}`;
      const state = seat.folded ? ' · 다이' : winnerIds.includes(seat.id) ? ' · 승자' : '';
      return `<li><strong>${escapeHtml(seat.name)}</strong>: ${escapeHtml(cards + hand + state)}</li>`;
    })
    .join('');
  const logHtml = round.log.map((entry) => `<li>${escapeHtml(entry)}</li>`).join('');

  return sanitizeArticleContent(
    `<h3>섯다 결과</h3>${noteHtml}<p><strong>결과:</strong> ${result}</p>` +
      `<h4>참가자 패</h4><ul>${seatsHtml}</ul><h4>진행 기록</h4><ol>${logHtml}</ol>`
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
