import {
  BALL_RADIUS,
  RAIL_THICKNESS,
  TABLE_HEIGHT,
  TABLE_WIDTH,
  type BilliardsRailSide
} from './gameUtils';

export type ArtPoint = { x: number; y: number };
export type ArtBallSetup = ArtPoint & {
  id: string;
  color: string;
  static?: boolean;
  moving?: { axis: 'x' | 'y'; range: number; speed: number };
};

export type ArtGoal = {
  minUniqueTargets: number;
  minCushions?: number;
  sideSpin?: 'left' | 'right';
  verticalSpin?: 'follow' | 'draw';
  avoidBlack?: boolean;
  waypointCount?: number;
  allRails?: boolean;
  requiredCushionSequence?: BilliardsRailSide[];
};

export type ArtSolution = {
  angle: number;
  power: number;
  sideSpin: number;
  verticalSpin: number;
  tipLabel: string;
  trajectory: ArtPoint[];
};

export type ArtStage = {
  id: string;
  stage: number;
  title: string;
  description: string;
  cue: ArtPoint;
  targets: ArtBallSetup[];
  obstacles: ArtBallSetup[];
  waypoints: ArtPoint[];
  goal: ArtGoal;
  solution: ArtSolution;
};

export type ArtShotResult = {
  cueContacts: string[];
  cushionHits: string[];
  blackHit: boolean;
  waypointCount: number;
  ballCollisions: number;
  sideSpin: number;
  verticalSpin: number;
};

export type ArtScoreBreakdown = {
  base: number;
  noHelp: number;
  spin: number;
  control: number;
  cushion: number;
  total: number;
};

const red = (id: string, x: number, y: number, color = '#d7352a'): ArtBallSetup => ({
  id,
  x,
  y,
  color
});

const black = (id: string, x: number, y: number): ArtBallSetup => ({
  id,
  x,
  y,
  color: '#151817',
  static: true
});

const LEGACY_ART_STAGES: ArtStage[] = [
  {
    id: 'art-1',
    stage: 1,
    title: '직선 맞히기',
    description: '중앙으로 곧게 쳐서 적구를 맞히세요.',
    cue: { x: 180, y: 455 },
    targets: [red('target-1', 180, 250)],
    obstacles: [],
    waypoints: [],
    goal: { minUniqueTargets: 1 },
    solution: {
      angle: -Math.PI / 2,
      power: 58,
      sideSpin: 0,
      verticalSpin: 25,
      tipLabel: '중앙보다 약간 위',
      trajectory: [
        { x: 180, y: 455 },
        { x: 180, y: 250 }
      ]
    }
  },
  {
    id: 'art-2',
    stage: 2,
    title: '원쿠션 맞히기',
    description: '왼쪽 쿠션을 한 번 사용해 적구를 맞히세요.',
    cue: { x: 125, y: 440 },
    targets: [red('target-1', 205, 185)],
    obstacles: [],
    waypoints: [],
    goal: { minUniqueTargets: 1, minCushions: 1, requiredCushionSequence: ['left'] },
    solution: {
      angle: -2.314,
      power: 50,
      sideSpin: 0,
      verticalSpin: 0,
      tipLabel: '중앙',
      trajectory: [
        { x: 125, y: 440 },
        { x: 28, y: 355 },
        { x: 205, y: 185 }
      ]
    }
  },
  {
    id: 'art-3',
    stage: 3,
    title: '투쿠션 맞히기',
    description: '오른쪽과 위 쿠션을 거쳐 적구를 맞히세요.',
    cue: { x: 155, y: 450 },
    targets: [red('target-1', 92, 220)],
    obstacles: [],
    waypoints: [],
    goal: {
      minUniqueTargets: 1,
      minCushions: 2,
      requiredCushionSequence: ['right', 'top']
    },
    solution: {
      angle: -1.074,
      power: 70,
      sideSpin: 0,
      verticalSpin: 0,
      tipLabel: '중앙',
      trajectory: [
        { x: 155, y: 450 },
        { x: 332.2, y: 185.2 },
        { x: 235.6, y: 27.6 },
        { x: 92, y: 220 }
      ]
    }
  },
  {
    id: 'art-4',
    stage: 4,
    title: '3쿠션 완주',
    description: '세 면의 쿠션을 돌고 적구를 맞히세요.',
    cue: { x: 105, y: 445 },
    targets: [red('target-1', 175, 318)],
    obstacles: [],
    waypoints: [],
    goal: {
      minUniqueTargets: 1,
      minCushions: 3,
      requiredCushionSequence: ['right', 'top', 'left']
    },
    solution: {
      angle: -0.887,
      power: 80,
      sideSpin: 10,
      verticalSpin: 0,
      tipLabel: '중앙보다 약간 오른쪽',
      trajectory: [
        { x: 105, y: 445 },
        { x: 332.2, y: 219.1 },
        { x: 157.8, y: 27.7 },
        { x: 27.8, y: 157.4 },
        { x: 175, y: 318 }
      ]
    }
  },
  {
    id: 'art-5',
    stage: 5,
    title: '오른쪽 회전 쿠션',
    description: '오른쪽 당점으로 쿠션 반사각을 벌려 좁은 문 뒤 적구를 맞히세요.',
    cue: { x: 165, y: 450 },
    targets: [red('target-1', 235, 180)],
    obstacles: [black('black-1', 145, 315), black('black-2', 215, 315)],
    waypoints: [{ x: 180, y: 315 }],
    goal: {
      minUniqueTargets: 1,
      minCushions: 1,
      requiredCushionSequence: ['top'],
      sideSpin: 'right',
      waypointCount: 1,
      avoidBlack: true
    },
    solution: {
      angle: -1.48,
      power: 62,
      sideSpin: 45,
      verticalSpin: 0,
      tipLabel: '오른쪽 당점 · 쿠션 회전',
      trajectory: [
        { x: 165, y: 450 },
        { x: 180.6, y: 311.6 },
        { x: 212.4, y: 27.9 },
        { x: 236.7, y: 168.8 }
      ]
    }
  },
  {
    id: 'art-6',
    stage: 6,
    title: '왼쪽 회전 돌아가기',
    description: '검은 공 왼쪽을 돌아 적구를 맞히세요.',
    cue: { x: 180, y: 450 },
    targets: [red('target-1', 185, 175)],
    obstacles: [black('black-1', 180, 305)],
    waypoints: [{ x: 122, y: 300 }],
    goal: {
      minUniqueTargets: 1,
      sideSpin: 'left',
      waypointCount: 1,
      avoidBlack: true,
      requiredCushionSequence: ['right', 'left']
    },
    solution: {
      angle: -0.43,
      power: 65,
      sideSpin: -58,
      verticalSpin: 35,
      tipLabel: '왼쪽 위',
      trajectory: [
        { x: 180, y: 450 },
        { x: 332.8, y: 393.2 },
        { x: 128.1, y: 297.6 },
        { x: 27.7, y: 250.5 },
        { x: 173.3, y: 180 }
      ]
    }
  },
  {
    id: 'art-7',
    stage: 7,
    title: '밀어치기 전진',
    description: '윗당점으로 적구를 민 뒤 수구를 앞 목표 지점까지 전진시키세요.',
    cue: { x: 180, y: 450 },
    targets: [red('target-1', 180, 310)],
    obstacles: [],
    waypoints: [{ x: 180, y: 300 }],
    goal: { minUniqueTargets: 1, verticalSpin: 'follow', waypointCount: 1 },
    solution: {
      angle: -Math.PI / 2,
      power: 70,
      sideSpin: 0,
      verticalSpin: 55,
      tipLabel: '위쪽 당점',
      trajectory: [
        { x: 180, y: 450 },
        { x: 180, y: 310 },
        { x: 180, y: 300 }
      ]
    }
  },
  {
    id: 'art-8',
    stage: 8,
    title: '끌어치기 당점',
    description: '아랫당점을 주고 앞쪽 적구를 정확히 맞히세요.',
    cue: { x: 180, y: 380 },
    targets: [red('target-1', 180, 235)],
    obstacles: [],
    waypoints: [{ x: 180, y: 430 }],
    goal: { minUniqueTargets: 1, verticalSpin: 'draw', waypointCount: 1 },
    solution: {
      angle: -Math.PI / 2,
      power: 72,
      sideSpin: 0,
      verticalSpin: -72,
      tipLabel: '아래쪽 당점',
      trajectory: [
        { x: 180, y: 380 },
        { x: 180, y: 235 },
        { x: 180, y: 430 }
      ]
    }
  },
  {
    id: 'art-9',
    stage: 9,
    title: '장애물 사이 통과',
    description: '검은 공을 건드리지 않고 문 사이로 적구를 맞히세요.',
    cue: { x: 180, y: 450 },
    targets: [red('target-1', 180, 175)],
    obstacles: [black('black-1', 145, 305), black('black-2', 215, 305)],
    waypoints: [{ x: 180, y: 305 }],
    goal: { minUniqueTargets: 1, waypointCount: 1, avoidBlack: true },
    solution: {
      angle: -Math.PI / 2,
      power: 58,
      sideSpin: 0,
      verticalSpin: 0,
      tipLabel: '중앙',
      trajectory: [
        { x: 180, y: 450 },
        { x: 180, y: 305 },
        { x: 180, y: 175 }
      ]
    }
  },
  {
    id: 'art-10',
    stage: 10,
    title: '쿠션 네 면 완주',
    description: '네 방향 쿠션을 모두 맞히면 마지막 퍼즐이 클리어됩니다.',
    cue: { x: 180, y: 300 },
    targets: [],
    obstacles: [],
    waypoints: [],
    goal: {
      minUniqueTargets: 0,
      minCushions: 4,
      allRails: true,
      requiredCushionSequence: ['left', 'top', 'right', 'bottom']
    },
    solution: {
      angle: -2.247,
      power: 95,
      sideSpin: 25,
      verticalSpin: 35,
      tipLabel: '오른쪽 위',
      trajectory: [
        { x: 180, y: 300 },
        { x: 27.7, y: 146.3 },
        { x: 132.6, y: 27.6 },
        { x: 332.6, y: 230.2 },
        { x: 60.9, y: 532.3 }
      ]
    }
  }
];

const LEGACY_MIN_BALL_CENTER = 28;
const LEGACY_MAX_BALL_CENTER_X = 332;
const LEGACY_MAX_BALL_CENTER_Y = 532;
const CURRENT_MIN_BALL_CENTER = RAIL_THICKNESS + BALL_RADIUS;
const CURRENT_MAX_BALL_CENTER_X = TABLE_WIDTH - RAIL_THICKNESS - BALL_RADIUS;
const CURRENT_MAX_BALL_CENTER_Y = TABLE_HEIGHT - RAIL_THICKNESS - BALL_RADIUS;

function scaleArtPoint(point: ArtPoint): ArtPoint {
  return {
    x:
      CURRENT_MIN_BALL_CENTER +
      ((point.x - LEGACY_MIN_BALL_CENTER) / (LEGACY_MAX_BALL_CENTER_X - LEGACY_MIN_BALL_CENTER)) *
        (CURRENT_MAX_BALL_CENTER_X - CURRENT_MIN_BALL_CENTER),
    y:
      CURRENT_MIN_BALL_CENTER +
      ((point.y - LEGACY_MIN_BALL_CENTER) / (LEGACY_MAX_BALL_CENTER_Y - LEGACY_MIN_BALL_CENTER)) *
        (CURRENT_MAX_BALL_CENTER_Y - CURRENT_MIN_BALL_CENTER)
  };
}

export const ART_STAGES: ArtStage[] = LEGACY_ART_STAGES.map((stage) => ({
  ...stage,
  cue: scaleArtPoint(stage.cue),
  targets: stage.targets.map((target) => ({ ...target, ...scaleArtPoint(target) })),
  obstacles: stage.obstacles.map((obstacle) => ({
    ...obstacle,
    ...scaleArtPoint(obstacle),
    moving: obstacle.moving
      ? {
          ...obstacle.moving,
          range:
            obstacle.moving.axis === 'x'
              ? obstacle.moving.range *
                ((CURRENT_MAX_BALL_CENTER_X - CURRENT_MIN_BALL_CENTER) /
                  (LEGACY_MAX_BALL_CENTER_X - LEGACY_MIN_BALL_CENTER))
              : obstacle.moving.range *
                ((CURRENT_MAX_BALL_CENTER_Y - CURRENT_MIN_BALL_CENTER) /
                  (LEGACY_MAX_BALL_CENTER_Y - LEGACY_MIN_BALL_CENTER))
        }
      : undefined
  })),
  waypoints: stage.waypoints.map(scaleArtPoint),
  solution: {
    ...stage.solution,
    trajectory: stage.solution.trajectory.map(scaleArtPoint)
  }
}));

export function getArtStage(stage: number): ArtStage {
  return ART_STAGES.find((item) => item.stage === stage) ?? ART_STAGES[0];
}

export function computeArtScore(
  stage: ArtStage,
  shot: ArtShotResult,
  helpUsed: boolean
): ArtScoreBreakdown {
  const sideSpin = Math.abs(shot.sideSpin);
  const verticalSpin = Math.abs(shot.verticalSpin);
  const base = 500 + stage.stage * 200;
  const noHelp = helpUsed ? 0 : 400;
  const spin = sideSpin >= 20 ? Math.min(300, Math.round(sideSpin / 10) * 30) : 0;
  const control = verticalSpin >= 20 ? Math.min(200, Math.round(verticalSpin / 10) * 20) : 0;
  const cushion = Math.min(new Set(shot.cushionHits).size, 4) * 50;

  return {
    base,
    noHelp,
    spin,
    control,
    cushion,
    total: base + noHelp + spin + control + cushion
  };
}

export function evaluateArtShot(
  stage: ArtStage,
  shot: ArtShotResult
): {
  success: boolean;
  message: string;
} {
  const uniqueTargets = new Set(shot.cueContacts.filter((id) => id.startsWith('target-')));
  const cushionCount = shot.cushionHits.length;
  const goal = stage.goal;

  if (goal.avoidBlack && shot.blackHit)
    return { success: false, message: '검은 공을 건드렸습니다' };
  if (goal.sideSpin === 'right' && shot.sideSpin < 20)
    return { success: false, message: '오른쪽 회전이 필요합니다' };
  if (goal.sideSpin === 'left' && shot.sideSpin > -20)
    return { success: false, message: '왼쪽 회전이 필요합니다' };
  if (goal.verticalSpin === 'follow' && shot.verticalSpin < 20)
    return { success: false, message: '윗당점 밀어치기가 필요합니다' };
  if (goal.verticalSpin === 'draw' && shot.verticalSpin > -20)
    return { success: false, message: '아랫당점 끌어치기가 필요합니다' };
  if (goal.minCushions && cushionCount < goal.minCushions)
    return { success: false, message: `쿠션이 ${goal.minCushions - cushionCount}회 부족합니다` };
  if (
    goal.requiredCushionSequence?.some(
      (requiredSide, index) => shot.cushionHits[index] !== requiredSide
    )
  ) {
    return { success: false, message: '지정된 쿠션 순서대로 맞혀야 합니다' };
  }
  if (goal.allRails && new Set(shot.cushionHits).size < 4)
    return { success: false, message: '쿠션 네 면을 모두 맞혀야 합니다' };
  if (goal.waypointCount && shot.waypointCount < goal.waypointCount)
    return { success: false, message: '목표 지점을 지나지 않았습니다' };
  if (uniqueTargets.size < goal.minUniqueTargets)
    return { success: false, message: '목표 공을 맞히지 못했습니다' };
  return { success: true, message: '한 번에 클리어!' };
}
