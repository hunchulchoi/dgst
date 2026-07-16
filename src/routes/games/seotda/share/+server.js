import { error, json } from '@sveltejs/kit';
import { checkRateLimit } from '$lib/server/apiRateLimit.js';
import { checkAndLogSessionDevice } from '$lib/server/auth/checkSessionDevice.js';
import { createArticle } from '$lib/server/board/articleRepo.js';
import { bustBoardListCache } from '$lib/server/boardListLoad.js';
import { sanitizeArticleContent } from '$lib/server/sanitizeArticleContent.js';
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

/** @param {string} value */
function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** @param {import('../seotdaEngine.js').SeotdaCard} card */
function cardImagePath(card) {
  const month = String(Math.max(1, Math.min(10, Number(card.month) || 1))).padStart(2, '0');
  return `/images/seotda/hwatu/${month}${card.gwang ? '-gwang' : ''}.webp`;
}

/** @param {string} entry */
function actionIcon(entry) {
  if (entry.includes('승리')) return '🏆';
  if (entry.includes('레이즈') || entry.includes('올인')) return '🔥';
  if (entry.includes('콜')) return '🪙';
  if (entry.includes('다이')) return '🏳️';
  return '·';
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
  const resultClass = result === '승리' ? 'is-win' : result === '패배' ? 'is-loss' : 'is-draw';
  const userFolded = !!user?.folded;
  const noteHtml = note
    ? `<div class="seotda-share-note">${escapeHtml(note).replaceAll('\n', '<br>')}</div>`
    : '';
  const seatsHtml = round.seats
    .map((seat) => {
      const winner = winnerIds.includes(seat.id);
      const revealDdaengWinner = userFolded && seat.isNpc && seat.id === round.ddaengWinnerId;
      const revealCards = !seat.isNpc || !userFolded || revealDdaengWinner;
      const seatClasses = [
        'seotda-share-seat',
        winner ? 'is-winner' : '',
        seat.folded ? 'is-folded' : ''
      ]
        .filter(Boolean)
        .join(' ');
      const cardsHtml = revealCards
        ? seat.cards
            .map(
              (card) =>
                `<img src="${cardImagePath(card)}" alt="${escapeHtml(
                  `${card.month}월${card.gwang ? ' 광' : ''}`
                )}" width="72" height="104">`
            )
            .join('')
        : '<span class="seotda-share-card-back">花</span><span class="seotda-share-card-back">花</span>';
      const handName = revealCards ? evaluateHand(seat.cards).name : '비공개';
      const chips = Math.max(0, Number(seat.chips) || 0).toLocaleString('ko-KR');
      return (
        `<div class="${seatClasses}">` +
        `<div class="seotda-share-seat-head"><strong>${escapeHtml(seat.name)}</strong>` +
        `<span>${chips}점</span></div>` +
        `<div class="seotda-share-cards">${cardsHtml}</div>` +
        `<div class="seotda-share-hand">${escapeHtml(handName)}${winner ? ' · 승자' : ''}</div>` +
        `</div>`
      );
    })
    .join('');
  const actionsHtml = round.log
    .slice(-5)
    .map(
      (entry) =>
        `<span class="seotda-share-action"><strong>${actionIcon(entry)}</strong>${escapeHtml(entry)}</span>`
    )
    .join('');
  const ddaengValuePerLoser = Math.max(0, Number(round.ddaengValuePerLoser) || 0);
  const ddaengTotalPaid = Math.max(0, Number(round.ddaengTotalPaid) || 0);
  const ddaengWinner = round.seats.find((seat) => seat.id === round.ddaengWinnerId);
  const ddaengLayerHtml = ddaengValuePerLoser
    ? `<div class="seotda-share-ddaeng-layer">` +
      `<span class="seotda-share-ddaeng-sparks" aria-hidden="true">✦ 🪙 ✦</span>` +
      `<span class="seotda-share-ddaeng-label">땡값 정산</span>` +
      `<strong>${escapeHtml(round.ddaengHandName || '땡')}</strong>` +
      `<span>${escapeHtml(ddaengWinner?.name || '승자')} 수령</span>` +
      `<div><b>1인당 ${ddaengValuePerLoser.toLocaleString('ko-KR')}점</b>` +
      `<b>총 ${ddaengTotalPaid.toLocaleString('ko-KR')}점</b></div>` +
      `</div>`
    : '';

  return sanitizeArticleContent(
    `<div class="seotda-share-card ${resultClass}">` +
      `<div class="seotda-share-banner"><span>SEOTDA SHOWDOWN</span><strong>${result}</strong></div>` +
      noteHtml +
      `<div class="seotda-share-table">${seatsHtml}</div>` +
      ddaengLayerHtml +
      `<div class="seotda-share-actions">${actionsHtml}</div>` +
      `</div>`
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
