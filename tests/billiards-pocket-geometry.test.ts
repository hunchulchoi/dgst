import Matter from 'matter-js';
import { describe, expect, it } from 'vitest';
import {
  BALL_RADIUS,
  MAX_SHOT_SPEED,
  PHYSICS_BASE_STEP_MS,
  PHYSICS_MAX_SUBSTEPS,
  RAIL_THICKNESS,
  SIDE_POCKET_MOUTH,
  TABLE_HEIGHT,
  TABLE_WIDTH,
  computePhysicsSubstepCount,
  containBallInPocketTable,
  containBallInTable,
  isBallInPocket
} from '../src/routes/games/billiards/gameUtils';
import {
  createBilliardsBallBody,
  createBilliardsPocketRailBodies
} from '../src/routes/games/billiards/billiardsPhysics';

function simulatePocketApproach(
  start: { x: number; y: number },
  velocity: { x: number; y: number }
) {
  const engine = Matter.Engine.create({ gravity: { x: 0, y: 0 } });
  const ball = createBilliardsBallBody(start.x, start.y);
  const rails = createBilliardsPocketRailBodies();
  Matter.Composite.add(engine.world, [...rails, ball]);
  Matter.Body.setVelocity(ball, velocity);
  let pocketed = false;
  let jawContacts = 0;
  let containmentCorrections = 0;
  Matter.Events.on(engine, 'collisionStart', (event) => {
    jawContacts += event.pairs.filter(
      (pair) =>
        (pair.bodyA === ball && pair.bodyB.label === 'rail-jaw') ||
        (pair.bodyB === ball && pair.bodyA.label === 'rail-jaw')
    ).length;
  });

  for (let frame = 0; frame < 45 && !pocketed; frame += 1) {
    let remainingDelta = PHYSICS_BASE_STEP_MS;
    for (let substep = 0; remainingDelta > 0.0001 && substep < PHYSICS_MAX_SUBSTEPS; substep += 1) {
      const count = computePhysicsSubstepCount(Matter.Body.getSpeed(ball), remainingDelta);
      const delta = substep === PHYSICS_MAX_SUBSTEPS - 1 ? remainingDelta : remainingDelta / count;
      Matter.Engine.update(engine, delta);
      if (isBallInPocket(ball.position)) {
        pocketed = true;
        break;
      }
      const contained = containBallInPocketTable({
        position: ball.position,
        velocity: ball.velocity
      });
      if (contained.corrected) {
        containmentCorrections += 1;
        Matter.Body.setPosition(ball, contained.position);
        Matter.Body.setVelocity(ball, contained.velocity);
      }
      remainingDelta = Math.max(0, remainingDelta - delta);
    }
  }

  const result = {
    pocketed,
    jawContacts,
    containmentCorrections,
    velocity: Matter.Body.getVelocity(ball),
    position: { ...ball.position }
  };
  Matter.Composite.clear(engine.world, false);
  Matter.Engine.clear(engine);
  return result;
}

describe('billiards pocket jaws', () => {
  it('builds six straight cushions and twelve physical jaws', () => {
    const rails = createBilliardsPocketRailBodies();
    expect(rails).toHaveLength(18);
    expect(rails.filter((rail) => rail.label === 'rail')).toHaveLength(6);
    expect(rails.filter((rail) => rail.label === 'rail-jaw')).toHaveLength(12);
    expect(rails.every((rail) => rail.isStatic && rail.billiardsRail)).toBe(true);
  });

  it('accepts centered side and corner shots even at maximum power', () => {
    const side = simulatePocketApproach(
      { x: 120, y: TABLE_HEIGHT / 2 },
      { x: -MAX_SHOT_SPEED, y: 0 }
    );
    const corner = simulatePocketApproach(
      { x: 120, y: 120 },
      { x: -MAX_SHOT_SPEED / Math.SQRT2, y: -MAX_SHOT_SPEED / Math.SQRT2 }
    );

    expect(side.pocketed).toBe(true);
    expect(side.jawContacts).toBe(0);
    expect(corner.pocketed).toBe(true);
    expect(corner.jawContacts).toBe(0);
  });

  it('keeps all six pocket throats open for angled maximum-power paths', () => {
    const diagonalSpeed = MAX_SHOT_SPEED / Math.SQRT2;
    const sideOffset = SIDE_POCKET_MOUTH / 2 - BALL_RADIUS - 0.06;
    const approaches = [
      {
        start: { x: 120, y: 124 },
        velocity: { x: -diagonalSpeed, y: -diagonalSpeed }
      },
      {
        start: { x: TABLE_WIDTH - 120, y: 124 },
        velocity: { x: diagonalSpeed, y: -diagonalSpeed }
      },
      {
        start: { x: 120, y: TABLE_HEIGHT / 2 + sideOffset },
        velocity: { x: -MAX_SHOT_SPEED, y: 0 }
      },
      {
        start: { x: TABLE_WIDTH - 120, y: TABLE_HEIGHT / 2 - sideOffset },
        velocity: { x: MAX_SHOT_SPEED, y: 0 }
      },
      {
        start: { x: 120, y: TABLE_HEIGHT - 124 },
        velocity: { x: -diagonalSpeed, y: diagonalSpeed }
      },
      {
        start: { x: TABLE_WIDTH - 120, y: TABLE_HEIGHT - 124 },
        velocity: { x: diagonalSpeed, y: diagonalSpeed }
      }
    ];

    for (const approach of approaches) {
      const result = simulatePocketApproach(approach.start, approach.velocity);
      expect(result.pocketed).toBe(true);
      expect(result.containmentCorrections).toBe(0);
    }
  });

  it('pockets the clear 60-degree maximum-power path without a hidden or jaw rebound', () => {
    const angle = Math.PI / 3;
    const startDistance = 80;
    const result = simulatePocketApproach(
      {
        x: RAIL_THICKNESS + Math.cos(angle) * startDistance,
        y: TABLE_HEIGHT / 2 + Math.sin(angle) * startDistance
      },
      {
        x: -Math.cos(angle) * MAX_SHOT_SPEED,
        y: -Math.sin(angle) * MAX_SHOT_SPEED
      }
    );

    expect(result.pocketed).toBe(true);
    expect(result.jawContacts).toBe(0);
    expect(result.containmentCorrections).toBe(0);
  });

  it('has no invisible side-pocket correction across steep angles and subpixel phases', () => {
    const angles = [50, 55, 58, 60, 62, 64, 65];
    const subpixelPhases = [0, 0.17, 0.41, 0.73, 0.97];

    for (const sideSign of [-1, 1]) {
      for (const verticalSign of [-1, 1]) {
        for (const degrees of angles) {
          const angle = (degrees * Math.PI) / 180;
          for (const phase of subpixelPhases) {
            const startDistance = 72 + phase;
            const pocketX = sideSign < 0 ? RAIL_THICKNESS : TABLE_WIDTH - RAIL_THICKNESS;
            const inwardX = -sideSign;
            const start = {
              x: pocketX + inwardX * Math.cos(angle) * startDistance,
              y: TABLE_HEIGHT / 2 + verticalSign * Math.sin(angle) * startDistance
            };
            const velocity = {
              x: -inwardX * Math.cos(angle) * MAX_SHOT_SPEED,
              y: -verticalSign * Math.sin(angle) * MAX_SHOT_SPEED
            };
            const result = simulatePocketApproach(start, velocity);

            expect(result.pocketed || result.jawContacts > 0).toBe(true);
            expect(result.containmentCorrections).toBe(0);
          }
        }
      }
    }
  });

  it('rejects a side-pocket shot outside the ball-clearance mouth', () => {
    const outsideCenterClearance = SIDE_POCKET_MOUTH / 2 - BALL_RADIUS + BALL_RADIUS * 0.95;
    const miss = simulatePocketApproach(
      { x: 120, y: TABLE_HEIGHT / 2 + outsideCenterClearance },
      { x: -18, y: 0 }
    );

    expect(miss.pocketed).toBe(false);
    expect(miss.jawContacts).toBeGreaterThan(0);
    expect(miss.velocity.x).toBeGreaterThan(0);
  });
});

describe('pocket-aware table containment', () => {
  const min = RAIL_THICKNESS + BALL_RADIUS;
  const maxX = TABLE_WIDTH - RAIL_THICKNESS - BALL_RADIUS;
  const maxY = TABLE_HEIGHT - RAIL_THICKNESS - BALL_RADIUS;
  const diagonalSpeed = MAX_SHOT_SPEED / Math.SQRT2;
  const sideMouthOffset = SIDE_POCKET_MOUTH / 2 - BALL_RADIUS + 0.01;

  it('does not create an invisible rectangular rebound in any pocket mouth', () => {
    const samples = [
      {
        position: { x: min - 0.05, y: min + 3.95 },
        velocity: { x: -diagonalSpeed, y: -diagonalSpeed }
      },
      {
        position: { x: maxX - 3.95, y: min - 0.05 },
        velocity: { x: diagonalSpeed, y: -diagonalSpeed }
      },
      {
        position: { x: min - 0.05, y: TABLE_HEIGHT / 2 + sideMouthOffset },
        velocity: { x: -MAX_SHOT_SPEED, y: 0 }
      },
      {
        position: { x: maxX + 0.05, y: TABLE_HEIGHT / 2 - sideMouthOffset },
        velocity: { x: MAX_SHOT_SPEED, y: 0 }
      },
      {
        position: { x: min + 3.95, y: maxY + 0.05 },
        velocity: { x: -diagonalSpeed, y: diagonalSpeed }
      },
      {
        position: { x: maxX + 0.05, y: maxY - 3.95 },
        velocity: { x: diagonalSpeed, y: diagonalSpeed }
      }
    ];

    for (const sample of samples) {
      expect(isBallInPocket(sample.position)).toBe(false);
      expect(containBallInTable(sample).corrected).toBe(true);
      expect(containBallInPocketTable(sample)).toEqual({
        corrected: false,
        position: sample.position,
        velocity: sample.velocity
      });
    }
  });

  it('leaves the reported 60-degree side-pocket gap to the physical geometry', () => {
    const sample = {
      position: { x: 24.73, y: TABLE_HEIGHT / 2 + 11.66 },
      velocity: {
        x: -MAX_SHOT_SPEED * 0.5,
        y: (-MAX_SHOT_SPEED * Math.sqrt(3)) / 2
      }
    };

    expect(isBallInPocket(sample.position)).toBe(false);
    expect(containBallInTable(sample).corrected).toBe(true);
    expect(containBallInPocketTable(sample)).toEqual({
      corrected: false,
      position: sample.position,
      velocity: sample.velocity
    });
  });

  it('still rebounds escaped balls outside every rail opening', () => {
    const samples = [
      {
        position: { x: min - 2, y: TABLE_HEIGHT / 2 + SIDE_POCKET_MOUTH },
        velocity: { x: -12, y: 3 },
        expectedPosition: { x: min, y: TABLE_HEIGHT / 2 + SIDE_POCKET_MOUTH },
        reflectedAxis: 'x' as const
      },
      {
        position: { x: maxX + 2, y: TABLE_HEIGHT / 2 - SIDE_POCKET_MOUTH },
        velocity: { x: 12, y: -3 },
        expectedPosition: { x: maxX, y: TABLE_HEIGHT / 2 - SIDE_POCKET_MOUTH },
        reflectedAxis: 'x' as const
      },
      {
        position: { x: TABLE_WIDTH / 2, y: min - 2 },
        velocity: { x: 3, y: -12 },
        expectedPosition: { x: TABLE_WIDTH / 2, y: min },
        reflectedAxis: 'y' as const
      },
      {
        position: { x: TABLE_WIDTH / 2, y: maxY + 2 },
        velocity: { x: -3, y: 12 },
        expectedPosition: { x: TABLE_WIDTH / 2, y: maxY },
        reflectedAxis: 'y' as const
      }
    ];

    for (const sample of samples) {
      const result = containBallInPocketTable(sample);
      expect(result.corrected).toBe(true);
      expect(result.position).toEqual(sample.expectedPosition);
      expect(Math.sign(result.velocity[sample.reflectedAxis])).toBe(
        -Math.sign(sample.velocity[sample.reflectedAxis])
      );
    }
  });
});
