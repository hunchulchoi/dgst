import { error, json } from '@sveltejs/kit';
import { checkRateLimit } from '$lib/server/apiRateLimit.js';
import logger from '$lib/util/logger.js';
import { BILLIARDS_MODES, FOUR_BALL_TARGET_OPTIONS, isActiveBilliardsMode } from '../gameUtils';

const MAX_BODY_BYTES = 64 * 1024;
const MAX_NOTE_LENGTH = 500;
const MAX_REPLAY_FRAMES = 80;

/** @param {unknown} value */
function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

/** @param {unknown} value */
function cleanNumber(value, min, max) {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, Number(value))) : null;
}

/** @param {unknown} value */
function sanitizeReplay(value) {
  if (!value || typeof value !== 'object') return null;

  const replay = /** @type {Record<string, unknown>} */ (value);
  const mode = replay.mode;
  if (!isActiveBilliardsMode(mode)) return null;

  const rawFrames = Array.isArray(replay.frames) ? replay.frames : [];
  if (rawFrames.length < 2 || rawFrames.length > MAX_REPLAY_FRAMES) return null;

  const frames = rawFrames.map((rawFrame) => {
    if (!rawFrame || typeof rawFrame !== 'object') return null;
    const frame = /** @type {Record<string, unknown>} */ (rawFrame);
    const at = cleanNumber(frame.at, 0, 15_000);
    const rawBalls = Array.isArray(frame.balls) ? frame.balls : [];
    if (at === null || rawBalls.length > 10) return null;

    const balls = rawBalls.map((rawBall) => {
      if (!rawBall || typeof rawBall !== 'object') return null;
      const ball = /** @type {Record<string, unknown>} */ (rawBall);
      const role = ball.role;
      const x = cleanNumber(ball.x, -50, 410);
      const y = cleanNumber(ball.y, -50, 610);
      if (!['cue', 'opponent', 'red'].includes(String(role)) || x === null || y === null) {
        return null;
      }
      return {
        id: cleanText(ball.id, 32),
        role,
        x: Math.round(x * 100) / 100,
        y: Math.round(y * 100) / 100
      };
    });
    if (balls.some((ball) => ball === null)) return null;
    return { at, balls };
  });
  if (frames.some((frame) => frame === null)) return null;

  const targetScore = Number(replay.targetScore);
  if (
    mode === BILLIARDS_MODES.FOUR_BALL &&
    !FOUR_BALL_TARGET_OPTIONS.some((option) => option === targetScore)
  ) {
    return null;
  }

  return {
    id: cleanText(replay.id, 64),
    mode,
    targetScore: mode === BILLIARDS_MODES.FOUR_BALL ? targetScore : null,
    power: cleanNumber(replay.power, 0, 100),
    sideSpin: cleanNumber(replay.sideSpin, -100, 100),
    verticalSpin: cleanNumber(replay.verticalSpin, -100, 100),
    startedAt: cleanText(replay.startedAt, 32),
    scoreBefore: cleanNumber(replay.scoreBefore, 0, 1_000_000),
    outcome: cleanText(replay.outcome, 80),
    frames
  };
}

export async function POST(event) {
  const rate = await checkRateLimit(event, {
    bucket: 'billiards-shot-report',
    limit: 8,
    windowSeconds: 60
  });
  if (!rate.allowed) throw error(429, { message: '신고가 너무 많습니다. 잠시 후 다시 시도하세요.' });

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

  const replay = sanitizeReplay(body?.replay);
  if (!replay) throw error(400, { message: '리플레이 데이터가 올바르지 않습니다.' });

  const reportId = crypto.randomUUID();
  logger.warn({
    message: 'Billiards shot issue reported',
    event: 'billiards.shot-report',
    reportId,
    note: cleanText(body?.note, MAX_NOTE_LENGTH),
    replay,
    userAgent: event.request.headers.get('user-agent'),
    timestamp: new Date().toISOString()
  });

  return json({ success: true, reportId });
}
