import {
  BILLIARDS_MODES,
  FOUR_BALL_TARGET_OPTIONS,
  isActiveBilliardsMode
} from '../../routes/games/billiards/gameUtils';

/** @param {unknown} value @param {number} maxLength */
export function cleanReplayText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

/** @param {unknown} value @param {number} min @param {number} max */
function cleanNumber(value, min, max) {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, Number(value))) : null;
}

/** @param {unknown} value @param {number} min @param {number} max */
function cleanOptionalNumber(value, min, max) {
  if (value === undefined || value === null) return undefined;
  const cleaned = cleanNumber(value, min, max);
  return cleaned === null ? undefined : Math.round(cleaned * 100) / 100;
}

/** @param {unknown} value @param {string} role */
function cleanColor(value, role) {
  if (typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value)) return value;
  if (role === 'cue') return '#f4efe0';
  if (role === 'opponent') return '#e6bc35';
  return '#d7352a';
}

/**
 * @param {unknown} value
 * @param {{ maxFrames?: number }} [options]
 */
export function sanitizeBilliardsReplay(value, { maxFrames = 80 } = {}) {
  if (!value || typeof value !== 'object') return null;

  const replay = /** @type {Record<string, unknown>} */ (value);
  const mode = replay.mode;
  if (!isActiveBilliardsMode(mode)) return null;

  const tableWidth = cleanOptionalNumber(replay.tableWidth, 240, 1_000);
  const tableHeight = cleanOptionalNumber(replay.tableHeight, 320, 2_000);
  const ballRadius = cleanOptionalNumber(replay.ballRadius, 3, 30);
  const providedGeometryCount = [replay.tableWidth, replay.tableHeight, replay.ballRadius].filter(
    (part) => part !== undefined && part !== null
  ).length;
  const hasRecordedGeometry = providedGeometryCount === 3;
  if (
    (providedGeometryCount !== 0 && !hasRecordedGeometry) ||
    (hasRecordedGeometry &&
      (tableWidth === undefined || tableHeight === undefined || ballRadius === undefined))
  ) {
    return null;
  }
  const replayTableWidth = hasRecordedGeometry && tableWidth !== undefined ? tableWidth : 360;
  const replayTableHeight = hasRecordedGeometry && tableHeight !== undefined ? tableHeight : 560;

  const rawFrames = Array.isArray(replay.frames) ? replay.frames : [];
  if (rawFrames.length < 2 || rawFrames.length > maxFrames) return null;

  const frames = rawFrames.map((rawFrame) => {
    if (!rawFrame || typeof rawFrame !== 'object') return null;
    const frame = /** @type {Record<string, unknown>} */ (rawFrame);
    const at = cleanNumber(frame.at, 0, 15_000);
    const rawBalls = Array.isArray(frame.balls) ? frame.balls : [];
    if (at === null || rawBalls.length < 1 || rawBalls.length > 10) return null;

    const balls = rawBalls.map((rawBall) => {
      if (!rawBall || typeof rawBall !== 'object') return null;
      const ball = /** @type {Record<string, unknown>} */ (rawBall);
      const role = String(ball.role);
      const x = cleanNumber(ball.x, -50, replayTableWidth + 50);
      const y = cleanNumber(ball.y, -50, replayTableHeight + 50);
      if (!['cue', 'opponent', 'red'].includes(role) || x === null || y === null) return null;
      return {
        id: cleanReplayText(ball.id, 32),
        role,
        color: cleanColor(ball.color, role),
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

  const power = cleanNumber(replay.power, 0, 100);
  const sideSpin = cleanNumber(replay.sideSpin, -100, 100);
  const verticalSpin = cleanNumber(replay.verticalSpin, -100, 100);
  const scoreBefore = cleanNumber(replay.scoreBefore, 0, 1_000_000);
  if (power === null || sideSpin === null || verticalSpin === null || scoreBefore === null) {
    return null;
  }

  return {
    id: cleanReplayText(replay.id, 64),
    mode,
    targetScore: mode === BILLIARDS_MODES.FOUR_BALL ? targetScore : null,
    power,
    sideSpin,
    verticalSpin,
    startedAt: cleanReplayText(replay.startedAt, 32),
    scoreBefore,
    outcome: cleanReplayText(replay.outcome, 80),
    ...(hasRecordedGeometry ? { tableWidth, tableHeight, ballRadius } : {}),
    frames
  };
}
