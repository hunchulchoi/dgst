import Matter from 'matter-js';
import { describe, expect, it } from 'vitest';
import {
  BALL_RADIUS,
  MAX_SHOT_SPEED,
  PHYSICS_MAX_SUBSTEPS,
  RAIL_THICKNESS,
  TABLE_HEIGHT,
  TABLE_WIDTH,
  computeAngularVelocityScale,
  computeDynamicVelocityScale,
  computeMaxCollisionSpeed,
  computePhysicsFrameSlices,
  computePhysicsSubstepCount
} from '../src/routes/games/billiards/gameUtils';
import { createBilliardsBallBody } from '../src/routes/games/billiards/billiardsPhysics';

function makeBall(x: number, y: number) {
  return createBilliardsBallBody(x, y);
}

function step(engine: Matter.Engine, balls: Matter.Body[], deltaMs = 16.66) {
  let remainingDelta = deltaMs;
  for (let index = 0; remainingDelta > 0.0001 && index < PHYSICS_MAX_SUBSTEPS; index += 1) {
    const collisionSpeed = computeMaxCollisionSpeed(balls);
    const remainingSubsteps = computePhysicsSubstepCount(collisionSpeed, remainingDelta);
    const substepDelta =
      index === PHYSICS_MAX_SUBSTEPS - 1 ? remainingDelta : remainingDelta / remainingSubsteps;
    Matter.Engine.update(engine, substepDelta);
    for (const ball of balls) {
      const speed = Math.hypot(ball.velocity.x, ball.velocity.y);
      const scale = computeDynamicVelocityScale(speed, substepDelta);
      Matter.Body.setVelocity(ball, {
        x: ball.velocity.x * scale,
        y: ball.velocity.y * scale
      });
    }
    remainingDelta = Math.max(0, remainingDelta - substepDelta);
  }
}

function stepFrame(engine: Matter.Engine, balls: Matter.Body[], elapsedMs: number) {
  for (const slice of computePhysicsFrameSlices(elapsedMs)) step(engine, balls, slice);
}

describe('billiards adaptive physics substeps', () => {
  it('scales from one step at rest to several steps at maximum shot speed', () => {
    expect(computePhysicsSubstepCount(0, 16.66)).toBe(1);
    expect(computePhysicsSubstepCount(4, 16.66)).toBeGreaterThan(1);
    expect(computePhysicsSubstepCount(MAX_SHOT_SPEED, 16.66)).toBeGreaterThanOrEqual(4);
    expect(computePhysicsSubstepCount(MAX_SHOT_SPEED, 8.33)).toBeGreaterThan(1);
    expect(
      computeMaxCollisionSpeed([
        { velocity: { x: MAX_SHOT_SPEED, y: 0 } },
        { velocity: { x: -MAX_SHOT_SPEED, y: 0 } }
      ])
    ).toBe(MAX_SHOT_SPEED * 2);
    expect(computeAngularVelocityScale(8.33) ** 2).toBeCloseTo(
      computeAngularVelocityScale(16.66),
      8
    );
  });

  it('splits slow frames into bounded physics slices without changing elapsed time', () => {
    expect(computePhysicsFrameSlices(8.33)).toEqual([8.33]);
    expect(computePhysicsFrameSlices(16.67)).toEqual([16.66]);
    const slowFrame = computePhysicsFrameSlices(33.33);
    expect(slowFrame).toHaveLength(2);
    expect(slowFrame.reduce((sum, slice) => sum + slice, 0)).toBeCloseTo(33.32, 8);
    const cappedFrame = computePhysicsFrameSlices(1_000);
    expect(cappedFrame).toHaveLength(4);
    expect(cappedFrame.reduce((sum, slice) => sum + slice, 0)).toBeCloseTo(66.64, 8);
    expect(computePhysicsFrameSlices(Number.NaN)).toEqual([]);
  });

  it('transfers forward momentum at maximum speed across 2700 sub-pixel phases', () => {
    let missedForwardImpulses = 0;

    for (let phase = 0; phase < 2700; phase += 1) {
      const engine = Matter.Engine.create({ gravity: { x: 0, y: 0 } });
      const cue = makeBall(30 + phase / 100, 280);
      const target = makeBall(220, 280);
      Matter.Composite.add(engine.world, [cue, target]);
      Matter.Body.setVelocity(cue, { x: MAX_SHOT_SPEED, y: 0 });
      let forwardImpulse = false;

      for (let frame = 0; frame < 14; frame += 1) {
        step(engine, [cue, target]);
        if (target.velocity.x > 0.1) forwardImpulse = true;
      }

      if (!forwardImpulse) missedForwardImpulses += 1;
      Matter.Composite.clear(engine.world, false);
      Matter.Engine.clear(engine);
    }

    expect(missedForwardImpulses).toBe(0);
  });

  it('resolves two maximum-speed balls approaching head-on', () => {
    let missedReversals = 0;

    for (let phase = 0; phase < 2700; phase += 1) {
      const engine = Matter.Engine.create({ gravity: { x: 0, y: 0 } });
      const left = makeBall(30 + phase / 100, 280);
      const right = makeBall(330, 280);
      Matter.Composite.add(engine.world, [left, right]);
      Matter.Body.setVelocity(left, { x: MAX_SHOT_SPEED, y: 0 });
      Matter.Body.setVelocity(right, { x: -MAX_SHOT_SPEED, y: 0 });
      let reversed = false;

      for (let frame = 0; frame < 10; frame += 1) {
        step(engine, [left, right]);
        if (left.velocity.x < 0 && right.velocity.x > 0) reversed = true;
      }

      if (!reversed) missedReversals += 1;
      Matter.Composite.clear(engine.world, false);
      Matter.Engine.clear(engine);
    }

    expect(missedReversals).toBe(0);
  });

  it('does not skip maximum-speed thin cuts across sub-pixel phases', () => {
    const missesByOffset = new Map<number, number>();
    const offsets = [BALL_RADIUS * 2 - 0.2, BALL_RADIUS * 2 - 0.1, BALL_RADIUS * 2 - 0.05];

    for (const offset of offsets) {
      let misses = 0;
      for (let phase = 0; phase < 900; phase += 1) {
        const engine = Matter.Engine.create({ gravity: { x: 0, y: 0 } });
        const cue = makeBall(30 + phase / 100, 280);
        const target = makeBall(220, 280 + offset);
        Matter.Composite.add(engine.world, [cue, target]);
        Matter.Body.setVelocity(cue, { x: MAX_SHOT_SPEED, y: 0 });
        let contacted = false;
        Matter.Events.on(engine, 'collisionStart', () => {
          contacted = true;
        });

        for (let frame = 0; frame < 14; frame += 1) {
          step(engine, [cue, target]);
        }

        if (!contacted) misses += 1;
        Matter.Composite.clear(engine.world, false);
        Matter.Engine.clear(engine);
      }
      missesByOffset.set(offset, misses);
    }

    expect([...missesByOffset.values()]).toEqual([0, 0, 0]);
  });

  it('does not skip opposing maximum-speed thin cuts across sub-pixel phases', () => {
    const missesByOffset = new Map<number, number>();
    const offsets = [BALL_RADIUS * 2 - 0.2, BALL_RADIUS * 2 - 0.1, BALL_RADIUS * 2 - 0.05];

    for (const offset of offsets) {
      let misses = 0;
      for (let phase = 0; phase < 900; phase += 1) {
        const engine = Matter.Engine.create({ gravity: { x: 0, y: 0 } });
        const left = makeBall(30 + phase / 100, 280);
        const right = makeBall(330, 280 + offset);
        Matter.Composite.add(engine.world, [left, right]);
        Matter.Body.setVelocity(left, { x: MAX_SHOT_SPEED, y: 0 });
        Matter.Body.setVelocity(right, { x: -MAX_SHOT_SPEED, y: 0 });
        let contacted = false;
        Matter.Events.on(engine, 'collisionStart', () => {
          contacted = true;
        });

        for (let frame = 0; frame < 10; frame += 1) {
          step(engine, [left, right]);
        }

        if (!contacted) misses += 1;
        Matter.Composite.clear(engine.world, false);
        Matter.Engine.clear(engine);
      }
      missesByOffset.set(offset, misses);
    }

    expect([...missesByOffset.values()]).toEqual([0, 0, 0]);
  });

  it('adapts after a leading ball rebounds into a same-direction thin cut', () => {
    let misses = 0;

    for (let phase = 0; phase < 900; phase += 1) {
      const engine = Matter.Engine.create({ gravity: { x: 0, y: 0 } });
      const trailing = makeBall(
        TABLE_WIDTH - 60 + phase / 100,
        TABLE_HEIGHT / 2 + BALL_RADIUS * 2 - 0.1
      );
      const leading = makeBall(TABLE_WIDTH - RAIL_THICKNESS - BALL_RADIUS - 8, TABLE_HEIGHT / 2);
      const rightRail = Matter.Bodies.rectangle(
        TABLE_WIDTH - RAIL_THICKNESS / 2,
        TABLE_HEIGHT / 2,
        RAIL_THICKNESS,
        TABLE_HEIGHT,
        {
          isStatic: true,
          restitution: 0.88,
          friction: 0.016
        }
      );
      Matter.Composite.add(engine.world, [trailing, leading, rightRail]);
      Matter.Body.setVelocity(trailing, { x: MAX_SHOT_SPEED, y: 0 });
      Matter.Body.setVelocity(leading, { x: MAX_SHOT_SPEED, y: 0 });
      let contacted = false;
      Matter.Events.on(engine, 'collisionStart', (event) => {
        if (
          event.pairs.some(
            (pair) =>
              (pair.bodyA === trailing && pair.bodyB === leading) ||
              (pair.bodyA === leading && pair.bodyB === trailing)
          )
        ) {
          contacted = true;
        }
      });

      step(engine, [trailing, leading]);

      if (!contacted) misses += 1;
      Matter.Composite.clear(engine.world, false);
      Matter.Engine.clear(engine);
    }

    expect(misses).toBe(0);
  });

  it('keeps thin-cut collision coverage when rendering drops to 30 fps', () => {
    let misses = 0;

    for (let phase = 0; phase < 900; phase += 1) {
      const engine = Matter.Engine.create({ gravity: { x: 0, y: 0 } });
      const left = makeBall(30 + phase / 100, TABLE_HEIGHT / 2);
      const right = makeBall(330, TABLE_HEIGHT / 2 + BALL_RADIUS * 2 - 0.1);
      Matter.Composite.add(engine.world, [left, right]);
      Matter.Body.setVelocity(left, { x: MAX_SHOT_SPEED, y: 0 });
      Matter.Body.setVelocity(right, { x: -MAX_SHOT_SPEED, y: 0 });
      let contacted = false;
      Matter.Events.on(engine, 'collisionStart', () => {
        contacted = true;
      });

      for (let frame = 0; frame < 5; frame += 1) stepFrame(engine, [left, right], 33.33);

      if (!contacted) misses += 1;
      Matter.Composite.clear(engine.world, false);
      Matter.Engine.clear(engine);
    }

    expect(misses).toBe(0);
  });

  it('does not tunnel through a cushion at maximum speed', () => {
    let missedCushions = 0;

    for (let phase = 0; phase < 2700; phase += 1) {
      const engine = Matter.Engine.create({ gravity: { x: 0, y: 0 } });
      const cue = makeBall(30 + phase / 100, TABLE_HEIGHT / 2);
      const rightRail = Matter.Bodies.rectangle(
        TABLE_WIDTH - RAIL_THICKNESS / 2,
        TABLE_HEIGHT / 2,
        RAIL_THICKNESS,
        TABLE_HEIGHT,
        {
          isStatic: true,
          restitution: 0.88,
          friction: 0.016
        }
      );
      Matter.Composite.add(engine.world, [cue, rightRail]);
      Matter.Body.setVelocity(cue, { x: MAX_SHOT_SPEED, y: 0 });
      let rebounded = false;

      for (let frame = 0; frame < 14; frame += 1) {
        step(engine, [cue]);
        if (cue.velocity.x < 0) rebounded = true;
      }

      if (!rebounded) missedCushions += 1;
      Matter.Composite.clear(engine.world, false);
      Matter.Engine.clear(engine);
    }

    expect(missedCushions).toBe(0);
  });
});
