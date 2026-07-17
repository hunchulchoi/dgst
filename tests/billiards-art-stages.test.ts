import { describe, expect, it } from 'vitest';
import {
  ART_STAGES,
  computeArtScore,
  evaluateArtShot,
  getArtStage
} from '../src/routes/games/billiards/artStages';

describe('billiards art stages', () => {
  it('provides exactly ten progressively harder one-shot puzzles', () => {
    expect(ART_STAGES).toHaveLength(10);
    expect(ART_STAGES.map((stage) => stage.stage)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('contains playable cushion, spin and obstacle missions with authored help', () => {
    const titles = ART_STAGES.map((stage) => stage.title).join(' ');
    for (const mission of ['원쿠션', '투쿠션', '3쿠션', '오른쪽 회전', '끌어치기', '쿠션 네 면']) {
      expect(titles).toContain(mission);
    }
    for (const stage of ART_STAGES) {
      expect(stage.solution.power).toBeGreaterThanOrEqual(10);
      expect(stage.solution.power).toBeLessThanOrEqual(100);
      expect(stage.solution.trajectory[0]).toEqual(stage.cue);
      expect(stage.solution.trajectory.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('explains why a shot failed and accepts a valid shot', () => {
    const stage = getArtStage(2);
    expect(
      evaluateArtShot(stage, {
        cueContacts: ['target-1'],
        cushionHits: [],
        blackHit: false,
        waypointCount: 0,
        ballCollisions: 0,
        sideSpin: 0,
        verticalSpin: 0
      })
    ).toEqual({ success: false, message: '쿠션이 1회 부족합니다' });

    expect(
      evaluateArtShot(stage, {
        cueContacts: ['target-1'],
        cushionHits: ['left'],
        blackHit: false,
        waypointCount: 0,
        ballCollisions: 1,
        sideSpin: 0,
        verticalSpin: 0
      })
    ).toEqual({ success: true, message: '한 번에 클리어!' });

    expect(
      evaluateArtShot(stage, {
        cueContacts: ['target-1'],
        cushionHits: ['right'],
        blackHit: false,
        waypointCount: 0,
        ballCollisions: 1,
        sideSpin: 0,
        verticalSpin: 0
      })
    ).toEqual({ success: false, message: '지정된 쿠션 순서대로 맞혀야 합니다' });
  });

  it('scores difficulty, no-help play, spin, control and unique cushions', () => {
    const stage = getArtStage(5);
    const shot = {
      cueContacts: ['target-1'],
      cushionHits: ['left', 'left', 'top'],
      blackHit: false,
      waypointCount: 1,
      ballCollisions: 1,
      sideSpin: 45,
      verticalSpin: 30
    };

    expect(computeArtScore(stage, shot, false)).toEqual({
      base: 1500,
      noHelp: 400,
      spin: 150,
      control: 60,
      cushion: 100,
      total: 2210
    });
    expect(computeArtScore(stage, shot, true).total).toBe(1810);
  });
});
