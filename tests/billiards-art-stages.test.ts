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

  it('builds a varied trick-shot curriculum instead of only adding cushions', () => {
    expect(ART_STAGES.map((stage) => stage.title)).toEqual([
      '정타 워밍업',
      '원쿠션 뱅크',
      '도미노 캐논',
      '바늘구멍',
      '투쿠션 지그재그',
      '밀어치기 추격',
      '끌어치기 귀환',
      '오른회전 비밀문',
      '왼회전 움직이는 수문',
      '4면 그랜드 투어'
    ]);

    expect(ART_STAGES[2].targets).toHaveLength(2);
    expect(ART_STAGES[2].goal.minBallCollisions).toBe(1);
    expect(ART_STAGES[3].goal).toMatchObject({ avoidBlack: true, waypointCount: 1 });
    expect(ART_STAGES[5].goal.verticalSpin).toBe('follow');
    expect(ART_STAGES[6].goal.verticalSpin).toBe('draw');
    expect(ART_STAGES[7].goal.sideSpin).toBe('right');
    expect(ART_STAGES[8].goal.sideSpin).toBe('left');
    expect(ART_STAGES[8].obstacles.some((ball) => ball.moving)).toBe(true);
    expect(ART_STAGES[9].goal.allRails).toBe(true);
    expect(ART_STAGES[9].targets).toHaveLength(1);

    for (const stage of ART_STAGES) {
      expect(stage.solution.power).toBeGreaterThanOrEqual(10);
      expect(stage.solution.power).toBeLessThanOrEqual(100);
      expect(stage.solution.trajectory[0]).toEqual(stage.cue);
      expect(stage.solution.trajectory.length).toBeGreaterThanOrEqual(2);
    }
  });

  it('requires the domino stage to create an object-ball collision', () => {
    const stage = getArtStage(3);
    const shot = {
      cueContacts: ['target-1'],
      cushionHits: [],
      blackHit: false,
      waypointCount: 0,
      ballCollisions: 0,
      sideSpin: 0,
      verticalSpin: 0
    };

    expect(evaluateArtShot(stage, shot)).toEqual({
      success: false,
      message: '적구끼리 연속 충돌시켜야 합니다'
    });
    expect(evaluateArtShot(stage, { ...shot, ballCollisions: 1 })).toEqual({
      success: true,
      message: '한 번에 클리어!'
    });
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
