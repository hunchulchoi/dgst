import { describe, expect, it } from 'vitest';
import {
  BILLIARDS_SAVE_KEY,
  BILLIARDS_SAVE_MAX_AGE_MS,
  BILLIARDS_SAVE_VERSION,
  parseBilliardsSave,
  type BilliardsSave
} from '../src/routes/games/billiards/billiardsSave';

const now = 1_800_000_000_000;

function validSave(): BilliardsSave {
  return {
    version: BILLIARDS_SAVE_VERSION,
    savedAt: now,
    currentMode: 'four-ball',
    artMode: false,
    artStageNumber: 1,
    score: 20,
    npcScore: 10,
    targetScore: 100,
    playerCombo: 2,
    npcCombo: 0,
    lastShotMultiplier: 1.5,
    lastFoulPenalty: 0,
    currentTurn: 'player',
    chances: 10,
    status: 'rolling',
    aimAngle: -1.5,
    displayAimAngle: -1.5,
    spin: 30,
    verticalSpin: -20,
    spinTipX: 15,
    spinTipY: -10,
    activeSpin: 30,
    activeVerticalSpin: -20,
    power: 65,
    submittedGameOver: false,
    contacts: [{ cueRole: 'cue', targetId: 'red-1' }],
    pocketedThisShot: 0,
    cuePocketedThisShot: false,
    opponentCueHitThisShot: false,
    npcShotWasDefensive: false,
    artCueContacts: [],
    artCushionHits: [],
    artBlackHit: false,
    artWaypointsVisited: [],
    artBallCollisions: 0,
    artShotSideSpin: 0,
    artShotVerticalSpin: 0,
    artResult: 'idle',
    artResultMessage: '',
    artHelpUsed: false,
    artScoreBreakdown: null,
    activeCueSpinResponses: [
      {
        ballId: 'cue',
        response: {
          direction: { x: 1, y: 0 },
          remainingDeltaSpeed: -2.2,
          remainingMs: 75
        }
      }
    ],
    balls: [{ id: 'cue', x: 180, y: 300, vx: 2.4, vy: -8.1, angle: 0.2, angularVelocity: 1.4 }]
  };
}

describe('billiards autosave validation', () => {
  it('uses the v2 storage key and rejects v1 geometry saves', () => {
    expect(BILLIARDS_SAVE_KEY).toBe('dgst:billiards:autosave:v2');
    expect(BILLIARDS_SAVE_VERSION).toBe(2);
    expect(parseBilliardsSave(JSON.stringify({ ...validSave(), version: 1 }), now)).toBeNull();
  });

  it('keeps rolling-shot physics and gameplay state', () => {
    const parsed = parseBilliardsSave(JSON.stringify(validSave()), now);
    expect(parsed?.status).toBe('rolling');
    expect(parsed?.balls[0]).toMatchObject({ vx: 2.4, vy: -8.1, angularVelocity: 1.4 });
    expect(parsed?.contacts).toEqual([{ cueRole: 'cue', targetId: 'red-1' }]);
    expect(parsed?.activeCueSpinResponses[0]).toMatchObject({
      ballId: 'cue',
      response: { remainingDeltaSpeed: -2.2, remainingMs: 75 }
    });
  });

  it('keeps older v2 saves valid with no in-flight cue-spin response', () => {
    const save = { ...validSave(), activeCueSpinResponses: undefined };
    expect(parseBilliardsSave(JSON.stringify(save), now)?.activeCueSpinResponses).toEqual([]);
  });

  it('rejects stale, malformed, and incompatible saves', () => {
    const stale = validSave();
    stale.savedAt = now - BILLIARDS_SAVE_MAX_AGE_MS - 1;
    expect(parseBilliardsSave(JSON.stringify(stale), now)).toBeNull();
    expect(parseBilliardsSave('{broken', now)).toBeNull();
    expect(parseBilliardsSave(JSON.stringify({ ...validSave(), version: 3 }), now)).toBeNull();
    expect(
      parseBilliardsSave(
        JSON.stringify({ ...validSave(), balls: [{ ...validSave().balls[0], vx: null }] }),
        now
      )
    ).toBeNull();
  });

  it('preserves art puzzle progress', () => {
    const save = validSave();
    save.artMode = true;
    save.artStageNumber = 7;
    save.artHelpUsed = true;
    save.artWaypointsVisited = [0, 1];
    save.artCueContacts = ['target-1'];
    const parsed = parseBilliardsSave(JSON.stringify(save), now);
    expect(parsed).toMatchObject({
      artMode: true,
      artStageNumber: 7,
      artHelpUsed: true,
      artWaypointsVisited: [0, 1]
    });
  });
});
