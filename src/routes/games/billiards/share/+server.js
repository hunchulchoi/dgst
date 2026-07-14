import { error, json } from '@sveltejs/kit';
import { checkRateLimit } from '$lib/server/apiRateLimit.js';
import { checkAndLogSessionDevice } from '$lib/server/auth/checkSessionDevice.js';
import { bustBoardListCache } from '$lib/server/boardListLoad.js';
import { cleanReplayText, sanitizeBilliardsReplay } from '$lib/server/billiardsReplay.js';
import { createBilliardsReplayArticle } from '$lib/server/billiardsReplayRepo.js';
import { sanitizeArticleContent } from '$lib/server/sanitizeArticleContent.js';

const MAX_BODY_BYTES = 96 * 1024;
const ALLOWED_BOARDS = new Set(['free', 'bug']);

/** @param {string} value */
function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

/** @param {import('@sveltejs/kit').RequestEvent} event */
export async function POST(event) {
  const session = await event.locals.auth();
  if (!session?.user?.email || !session.user.nickname) {
    throw error(401, { message: '로그인 후 리플레이를 공유할 수 있습니다.' });
  }

  const rate = await checkRateLimit(event, {
    bucket: 'billiards-replay-share',
    limit: 5,
    windowSeconds: 60
  });
  if (!rate.allowed)
    throw error(429, { message: '공유가 너무 많습니다. 잠시 후 다시 시도하세요.' });

  const rawBody = await event.request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    throw error(413, { message: '리플레이 데이터가 너무 큽니다.' });
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw error(400, { message: '공유 데이터가 올바르지 않습니다.' });
  }

  const replay = sanitizeBilliardsReplay(body?.replay);
  if (!replay) throw error(400, { message: '리플레이 데이터가 올바르지 않습니다.' });

  const boardId = ALLOWED_BOARDS.has(body?.boardId) ? body.boardId : 'free';
  const defaultTitle = `[당구 리플레이] ${replay.outcome || '내 샷'}`;
  const title = cleanReplayText(body?.title, 80) || defaultTitle;
  const note = cleanReplayText(body?.note, 500);
  const noteHtml = note ? `<p>${escapeHtml(note).replaceAll('\n', '<br>')}</p>` : '';
  const content = sanitizeArticleContent(`<p>당구 리플레이를 공유했습니다.</p>${noteHtml}`);

  await checkAndLogSessionDevice(event, { action: 'billiards.replay.share' });
  const result = await createBilliardsReplayArticle({
    email: session.user.email,
    nickname: session.user.nickname,
    boardId,
    title,
    content,
    replay
  });
  await bustBoardListCache(boardId);

  return json({ success: true, boardId, ...result });
}
