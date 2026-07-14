import { error, json } from '@sveltejs/kit';
import { checkRateLimit } from '$lib/server/apiRateLimit.js';
import { cleanReplayText, sanitizeBilliardsReplay } from '$lib/server/billiardsReplay.js';
import logger from '$lib/util/logger.js';

const MAX_BODY_BYTES = 64 * 1024;
const MAX_NOTE_LENGTH = 500;
const MAX_REPLAY_FRAMES = 80;

export async function POST(event) {
  const rate = await checkRateLimit(event, {
    bucket: 'billiards-shot-report',
    limit: 8,
    windowSeconds: 60
  });
  if (!rate.allowed)
    throw error(429, { message: '신고가 너무 많습니다. 잠시 후 다시 시도하세요.' });

  const contentLength = Number(event.request.headers.get('content-length') ?? 0);
  if (contentLength > MAX_BODY_BYTES) throw error(413, { message: '신고 데이터가 너무 큽니다.' });

  const rawBody = await event.request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
    throw error(413, { message: '신고 데이터가 너무 큽니다.' });
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    throw error(400, { message: '신고 데이터가 올바르지 않습니다.' });
  }

  const replay = sanitizeBilliardsReplay(body?.replay, { maxFrames: MAX_REPLAY_FRAMES });
  if (!replay) throw error(400, { message: '리플레이 데이터가 올바르지 않습니다.' });

  const reportId = crypto.randomUUID();
  logger.warn({
    message: 'Billiards shot issue reported',
    event: 'billiards.shot-report',
    reportId,
    note: cleanReplayText(body?.note, MAX_NOTE_LENGTH),
    replay,
    userAgent: event.request.headers.get('user-agent'),
    timestamp: new Date().toISOString()
  });

  return json({ success: true, reportId });
}
