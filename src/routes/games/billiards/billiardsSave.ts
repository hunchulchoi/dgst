import {
  BILLIARDS_MODES,
  FOUR_BALL_TARGET_OPTIONS,
  type ActiveBilliardsMode,
  type CueSpinResponse,
  type FourBallTargetScore,
  type ShotContact
} from './gameUtils';
import type { ArtScoreBreakdown } from './artStages';

export const BILLIARDS_SAVE_KEY = 'dgst:billiards:autosave:v3';
export const BILLIARDS_SAVE_VERSION = 3;
export const BILLIARDS_SAVE_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export type BilliardsSaveStatus =
  | 'aiming'
  | 'charging'
  | 'rolling'
  | 'scored'
  | 'miss'
  | 'game-over';

export type SavedBilliardsBall = {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  angularVelocity: number;
};

export type SavedCueSpinResponse = {
  ballId: string;
  response: CueSpinResponse;
};

export type BilliardsSave = {
  version: typeof BILLIARDS_SAVE_VERSION;
  savedAt: number;
  currentMode: ActiveBilliardsMode;
  artMode: boolean;
  artStageNumber: number;
  score: number;
  npcScore: number;
  targetScore: FourBallTargetScore;
  playerCombo: number;
  npcCombo: number;
  lastShotMultiplier: number;
  lastFoulPenalty: number;
  currentTurn: 'player' | 'npc';
  chances: number;
  status: BilliardsSaveStatus;
  aimAngle: number;
  displayAimAngle: number;
  spin: number;
  verticalSpin: number;
  spinTipX: number;
  spinTipY: number;
  activeSpin: number;
  activeVerticalSpin: number;
  power: number;
  submittedGameOver: boolean;
  contacts: ShotContact[];
  pocketedThisShot: number;
  cuePocketedThisShot: boolean;
  opponentCueHitThisShot: boolean;
  npcShotWasDefensive: boolean;
  artCueContacts: string[];
  artCushionHits: string[];
  artBlackHit: boolean;
  artWaypointsVisited: number[];
  artBallCollisions: number;
  artShotSideSpin: number;
  artShotVerticalSpin: number;
  artResult: 'idle' | 'success' | 'failed';
  artResultMessage: string;
  artHelpUsed: boolean;
  artScoreBreakdown: ArtScoreBreakdown | null;
  activeCueSpinResponses: SavedCueSpinResponse[];
  balls: SavedBilliardsBall[];
};

const STATUSES = new Set<BilliardsSaveStatus>([
  'aiming',
  'charging',
  'rolling',
  'scored',
  'miss',
  'game-over'
]);
const ART_RESULTS = new Set(['idle', 'success', 'failed']);

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isSavedBall(value: unknown): value is SavedBilliardsBall {
  if (!value || typeof value !== 'object') return false;
  const ball = value as Record<string, unknown>;
  return (
    typeof ball.id === 'string' &&
    ball.id.length > 0 &&
    isFiniteNumber(ball.x) &&
    isFiniteNumber(ball.y) &&
    isFiniteNumber(ball.vx) &&
    isFiniteNumber(ball.vy) &&
    isFiniteNumber(ball.angle) &&
    isFiniteNumber(ball.angularVelocity)
  );
}

function isSavedCueSpinResponse(value: unknown): value is SavedCueSpinResponse {
  if (!value || typeof value !== 'object') return false;
  const saved = value as Record<string, unknown>;
  if (typeof saved.ballId !== 'string' || !saved.response || typeof saved.response !== 'object') {
    return false;
  }
  const response = saved.response as Record<string, unknown>;
  const direction = response.direction as Record<string, unknown> | undefined;
  return (
    saved.ballId.length > 0 &&
    Boolean(direction) &&
    isFiniteNumber(direction?.x) &&
    isFiniteNumber(direction?.y) &&
    isFiniteNumber(response.remainingDeltaSpeed) &&
    isFiniteNumber(response.remainingMs) &&
    response.remainingMs >= 0
  );
}

export function parseBilliardsSave(raw: string | null, now = Date.now()): BilliardsSave | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Record<string, unknown>;
    const savedCueSpinResponses = value.activeCueSpinResponses ?? [];
    if (
      value.version !== BILLIARDS_SAVE_VERSION ||
      !isFiniteNumber(value.savedAt) ||
      value.savedAt > now + 60_000 ||
      now - value.savedAt > BILLIARDS_SAVE_MAX_AGE_MS ||
      (value.currentMode !== BILLIARDS_MODES.FOUR_BALL &&
        value.currentMode !== BILLIARDS_MODES.POCKET_BALL) ||
      typeof value.artMode !== 'boolean' ||
      !Number.isSafeInteger(value.artStageNumber) ||
      (value.artStageNumber as number) < 1 ||
      (value.artStageNumber as number) > 10 ||
      !isNonNegativeInteger(value.score) ||
      !isNonNegativeInteger(value.npcScore) ||
      !FOUR_BALL_TARGET_OPTIONS.includes(value.targetScore as FourBallTargetScore) ||
      !isNonNegativeInteger(value.playerCombo) ||
      !isNonNegativeInteger(value.npcCombo) ||
      !isFiniteNumber(value.lastShotMultiplier) ||
      !isNonNegativeInteger(value.lastFoulPenalty) ||
      (value.currentTurn !== 'player' && value.currentTurn !== 'npc') ||
      !isNonNegativeInteger(value.chances) ||
      !STATUSES.has(value.status as BilliardsSaveStatus) ||
      !isFiniteNumber(value.aimAngle) ||
      !isFiniteNumber(value.displayAimAngle) ||
      !isFiniteNumber(value.spin) ||
      !isFiniteNumber(value.verticalSpin) ||
      !isFiniteNumber(value.spinTipX) ||
      !isFiniteNumber(value.spinTipY) ||
      !isFiniteNumber(value.activeSpin) ||
      !isFiniteNumber(value.activeVerticalSpin) ||
      !isFiniteNumber(value.power) ||
      typeof value.submittedGameOver !== 'boolean' ||
      !Array.isArray(value.contacts) ||
      !value.contacts.every(
        (contact) =>
          contact &&
          typeof contact === 'object' &&
          ['cue', 'red', 'opponent'].includes((contact as ShotContact).cueRole) &&
          typeof (contact as ShotContact).targetId === 'string'
      ) ||
      !isNonNegativeInteger(value.pocketedThisShot) ||
      typeof value.cuePocketedThisShot !== 'boolean' ||
      typeof value.opponentCueHitThisShot !== 'boolean' ||
      typeof value.npcShotWasDefensive !== 'boolean' ||
      !isStringArray(value.artCueContacts) ||
      !isStringArray(value.artCushionHits) ||
      typeof value.artBlackHit !== 'boolean' ||
      !Array.isArray(value.artWaypointsVisited) ||
      !value.artWaypointsVisited.every(isNonNegativeInteger) ||
      !isNonNegativeInteger(value.artBallCollisions) ||
      !isFiniteNumber(value.artShotSideSpin) ||
      !isFiniteNumber(value.artShotVerticalSpin) ||
      !ART_RESULTS.has(value.artResult as string) ||
      typeof value.artResultMessage !== 'string' ||
      typeof value.artHelpUsed !== 'boolean' ||
      (value.artScoreBreakdown !== null && typeof value.artScoreBreakdown !== 'object') ||
      !Array.isArray(savedCueSpinResponses) ||
      savedCueSpinResponses.length > 10 ||
      !savedCueSpinResponses.every(isSavedCueSpinResponse) ||
      !Array.isArray(value.balls) ||
      value.balls.length === 0 ||
      !value.balls.every(isSavedBall)
    ) {
      return null;
    }
    return { ...value, activeCueSpinResponses: savedCueSpinResponses } as BilliardsSave;
  } catch {
    return null;
  }
}
