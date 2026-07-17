import Matter from 'matter-js';
import { describe, expect, it } from 'vitest';
import {
  BALL_RADIUS,
  PHYSICS_MAX_SUBSTEPS,
  RAIL_RESTITUTION,
  RAIL_SURFACE_FRICTION,
  containBallInTable,
  computeDynamicVelocityScale,
  computeMaxCollisionSpeed,
  computePhysicsSubstepCount,
  computeRailReboundVelocity
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

describe('billiards real-world collision invariants', () => {
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
    const cue = makeBall(310, 280);
    const rightRail = Matter.Bodies.rectangle(351, 280, 18, 560, {
      isStatic: true,
      restitution: RAIL_RESTITUTION,
      friction: RAIL_SURFACE_FRICTION
    });
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
    const cue = makeBall(100, 280);
    const rightRail = Matter.Bodies.rectangle(351, 280, 18, 560, {
      isStatic: true,
      restitution: RAIL_RESTITUTION,
      friction: RAIL_SURFACE_FRICTION
    });
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
    for (const offset of [2, 4, 6, 8, 10, 12, 14, 16, 18]) {
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
