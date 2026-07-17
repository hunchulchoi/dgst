import Matter from 'matter-js';
import { describe, expect, it } from 'vitest';
import {
  BALL_RADIUS,
  PHYSICS_BASE_STEP_MS,
  PHYSICS_MAX_SUBSTEPS,
  RAIL_THICKNESS,
  RAIL_RESTITUTION,
  RAIL_SURFACE_FRICTION,
  TABLE_HEIGHT,
  TABLE_WIDTH,
  containBallInTable,
  computeDynamicVelocityScale,
  computeMaxCollisionSpeed,
  computePhysicsFrameSlices,
  computePhysicsSubstepCount,
  computeRailReboundVelocity,
  shouldSnapStoppedSpeed
} from '../src/routes/games/billiards/gameUtils';
import { createBilliardsBallBody } from '../src/routes/games/billiards/billiardsPhysics';

const FRAME_MS = 16.66;

function makeBall(x: number, y: number) {
  return createBilliardsBallBody(x, y);
}

function advance(engine: Matter.Engine, moving: Matter.Body[]) {
  let remainingDelta = FRAME_MS;
  for (let index = 0; remainingDelta > 0.0001 && index < PHYSICS_MAX_SUBSTEPS; index += 1) {
    const collisionSpeed = computeMaxCollisionSpeed(moving);
    const remainingSubsteps = computePhysicsSubstepCount(collisionSpeed, remainingDelta);
    const delta =
      index === PHYSICS_MAX_SUBSTEPS - 1 ? remainingDelta : remainingDelta / remainingSubsteps;
    Matter.Engine.update(engine, delta);
    for (const body of moving) {
      const speed = Math.hypot(body.velocity.x, body.velocity.y);
      const scale = computeDynamicVelocityScale(speed, delta);
      Matter.Body.setVelocity(body, {
        x: body.velocity.x * scale,
        y: body.velocity.y * scale
      });
    }
    remainingDelta = Math.max(0, remainingDelta - delta);
  }
}

function kineticEnergy(bodies: Matter.Body[]) {
  return bodies.reduce(
    (sum, body) => sum + 0.5 * body.mass * (body.velocity.x ** 2 + body.velocity.y ** 2),
    0
  );
}

function simulateRollingStop(frameRate: number) {
  const engine = Matter.Engine.create({ gravity: { x: 0, y: 0 } });
  const ball = makeBall(0, 0);
  Matter.Composite.add(engine.world, ball);
  Matter.Body.setVelocity(ball, { x: 8, y: 0 });
  const frameDelta = 1000 / frameRate;
  let simulatedMs = 0;

  for (let frame = 0; frame < frameRate * 5 && ball.speed > 0; frame += 1) {
    for (const slice of computePhysicsFrameSlices(frameDelta)) {
      let remainingDelta = slice;
      for (
        let substep = 0;
        remainingDelta > 0.0001 && substep < PHYSICS_MAX_SUBSTEPS;
        substep += 1
      ) {
        const count = computePhysicsSubstepCount(ball.speed, remainingDelta);
        const delta =
          substep === PHYSICS_MAX_SUBSTEPS - 1 ? remainingDelta : remainingDelta / count;
        Matter.Engine.update(engine, delta);
        const speed = ball.speed;
        if (shouldSnapStoppedSpeed(speed)) {
          Matter.Body.setVelocity(ball, { x: 0, y: 0 });
        } else {
          const scale = computeDynamicVelocityScale(speed, delta);
          Matter.Body.setVelocity(ball, {
            x: ball.velocity.x * scale,
            y: ball.velocity.y * scale
          });
        }
        simulatedMs += delta;
        remainingDelta = Math.max(0, remainingDelta - delta);
        if (ball.speed === 0) break;
      }
      if (ball.speed === 0) break;
    }
  }

  return { stopMs: simulatedMs, distance: ball.position.x };
}

describe('billiards real-world collision invariants', () => {
  it('keeps the adaptive rolling loop nearly frame-independent at 30, 60 and 120Hz', () => {
    const runs = [30, 60, 120].map(simulateRollingStop);
    const stopTimes = runs.map((run) => run.stopMs);
    const distances = runs.map((run) => run.distance);

    expect(Math.max(...stopTimes) - Math.min(...stopTimes)).toBeLessThanOrEqual(
      PHYSICS_BASE_STEP_MS
    );
    expect(Math.max(...distances) - Math.min(...distances)).toBeLessThan(1);
    expect(runs[1].stopMs).toBeGreaterThan(1_200);
    expect(runs[1].stopMs).toBeLessThan(1_400);
  });

  it('enforces the configured cushion restitution after Matter resolves the pair', () => {
    const rebound = computeRailReboundVelocity({ x: -9.4, y: 4 }, 'right');
    expect(rebound.x).toBeCloseTo(-8.8, 6);
    expect(rebound.y).toBeCloseTo(3.84, 6);

    const diagonalNormal = { x: Math.SQRT1_2, y: Math.SQRT1_2 };
    const diagonalTangent = { x: -Math.SQRT1_2, y: Math.SQRT1_2 };
    const diagonalVelocity = {
      x: diagonalNormal.x * -9.4 + diagonalTangent.x * 4,
      y: diagonalNormal.y * -9.4 + diagonalTangent.y * 4
    };
    const diagonalRebound = computeRailReboundVelocity(diagonalVelocity, 'top', diagonalNormal);
    expect(diagonalRebound.x * diagonalNormal.x + diagonalRebound.y * diagonalNormal.y).toBeCloseTo(
      -8.8,
      6
    );
    expect(
      diagonalRebound.x * diagonalTangent.x + diagonalRebound.y * diagonalTangent.y
    ).toBeCloseTo(3.84, 6);
  });

  it('produces the configured normal-speed loss in an actual rail collision', () => {
    const engine = Matter.Engine.create({ gravity: { x: 0, y: 0 } });
    const cue = makeBall(TABLE_WIDTH - 50, TABLE_HEIGHT / 2);
    const rightRail = Matter.Bodies.rectangle(
      TABLE_WIDTH - RAIL_THICKNESS / 2,
      TABLE_HEIGHT / 2,
      RAIL_THICKNESS,
      TABLE_HEIGHT,
      {
        isStatic: true,
        restitution: RAIL_RESTITUTION,
        friction: RAIL_SURFACE_FRICTION
      }
    );
    Matter.Composite.add(engine.world, [cue, rightRail]);
    Matter.Body.setVelocity(cue, { x: 10, y: 0 });
    let pending = false;
    let incoming = 0;
    let outgoing = 0;
    Matter.Events.on(engine, 'collisionStart', () => {
      pending = true;
    });

    for (let frame = 0; frame < 10 && outgoing === 0; frame += 1) {
      const substeps = computePhysicsSubstepCount(cue.speed, FRAME_MS);
      const delta = FRAME_MS / substeps;
      for (let substep = 0; substep < substeps; substep += 1) {
        const before = cue.velocity.x;
        Matter.Engine.update(engine, delta);
        if (!pending) continue;
        incoming = before;
        Matter.Body.setVelocity(cue, computeRailReboundVelocity(cue.velocity, 'right'));
        const contained = containBallInTable({
          position: cue.position,
          velocity: cue.velocity
        });
        if (contained.corrected) {
          Matter.Body.setPosition(cue, contained.position);
          Matter.Body.setVelocity(cue, contained.velocity);
        }
        outgoing = cue.velocity.x;
        pending = false;
        break;
      }
    }

    expect(outgoing).toBeLessThan(0);
    expect(Math.abs(outgoing / incoming)).toBeGreaterThan(0.84);
    expect(Math.abs(outgoing / incoming)).toBeLessThan(0.9);
  });

  it('nearly transfers a straight hit from one equal ball to the other without adding energy', () => {
    const engine = Matter.Engine.create({ gravity: { x: 0, y: 0 } });
    const cue = makeBall(80, 280);
    const object = makeBall(200, 280);
    Matter.Composite.add(engine.world, [cue, object]);
    Matter.Body.setVelocity(cue, { x: 18, y: 0 });
    const initialEnergy = kineticEnergy([cue, object]);

    for (let frame = 0; frame < 20 && object.velocity.x <= 0.1; frame += 1) {
      advance(engine, [cue, object]);
    }

    expect(object.velocity.x).toBeGreaterThan(0);
    expect(Math.abs(cue.velocity.x)).toBeLessThan(object.velocity.x * 0.15);
    expect(kineticEnergy([cue, object])).toBeLessThan(initialEnergy);
  });

  it('separates equal balls at close to a right angle on a half-ball cut', () => {
    const engine = Matter.Engine.create({ gravity: { x: 0, y: 0 } });
    const cue = makeBall(80, 280);
    const object = makeBall(200, 290);
    Matter.Composite.add(engine.world, [cue, object]);
    Matter.Body.setVelocity(cue, { x: 18, y: 0 });

    for (let frame = 0; frame < 20 && object.speed <= 0.1; frame += 1) {
      advance(engine, [cue, object]);
    }

    const dot = cue.velocity.x * object.velocity.x + cue.velocity.y * object.velocity.y;
    const cosine = dot / (cue.speed * object.speed);
    expect(cue.speed).toBeGreaterThan(2);
    expect(object.speed).toBeGreaterThan(2);
    expect(Math.abs(cosine)).toBeLessThan(0.2);
  });

  it('reflects from a cushion while losing normal and tangential speed', () => {
    const engine = Matter.Engine.create({ gravity: { x: 0, y: 0 } });
    const cue = makeBall(100, TABLE_HEIGHT / 2);
    const rightRail = Matter.Bodies.rectangle(
      TABLE_WIDTH - RAIL_THICKNESS / 2,
      TABLE_HEIGHT / 2,
      RAIL_THICKNESS,
      TABLE_HEIGHT,
      {
        isStatic: true,
        restitution: RAIL_RESTITUTION,
        friction: RAIL_SURFACE_FRICTION
      }
    );
    Matter.Composite.add(engine.world, [cue, rightRail]);
    Matter.Body.setVelocity(cue, { x: 12, y: 5 });
    let incoming = { ...cue.velocity };

    for (let frame = 0; frame < 40 && cue.velocity.x >= 0; frame += 1) {
      incoming = { ...cue.velocity };
      advance(engine, [cue]);
    }

    expect(cue.velocity.x).toBeLessThan(0);
    expect(Math.abs(cue.velocity.x)).toBeLessThan(Math.abs(incoming.x));
    expect(Math.abs(cue.velocity.x)).toBeGreaterThan(Math.abs(incoming.x) * 0.5);
    expect(Math.sign(cue.velocity.y)).toBe(Math.sign(incoming.y));
    expect(Math.abs(cue.velocity.y)).toBeLessThanOrEqual(Math.abs(incoming.y));
  });

  it('keeps cut-shot object-ball angles close to circular contact geometry', () => {
    const angleErrors: number[] = [];
    for (const offsetRatio of [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9]) {
      const offset = BALL_RADIUS * 2 * offsetRatio;
      const engine = Matter.Engine.create({ gravity: { x: 0, y: 0 } });
      const cue = makeBall(80, 280);
      const object = makeBall(200, 280 + offset);
      Matter.Composite.add(engine.world, [cue, object]);
      Matter.Body.setVelocity(cue, { x: 18, y: 0 });

      for (let frame = 0; frame < 20 && object.speed <= 0.1; frame += 1) {
        advance(engine, [cue, object]);
      }

      const actualAngle = Math.atan2(object.velocity.y, object.velocity.x);
      const idealAngle = Math.asin(offset / (BALL_RADIUS * 2));
      angleErrors.push(Math.abs(actualAngle - idealAngle));
    }

    const degrees = angleErrors.map((error) => (error * 180) / Math.PI);
    expect(Math.max(...degrees)).toBeLessThan(7);
    expect(degrees.reduce((sum, error) => sum + error, 0) / degrees.length).toBeLessThan(4);
  });
});
