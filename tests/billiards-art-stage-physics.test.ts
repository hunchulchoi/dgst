import Matter from 'matter-js';
import { describe, it } from 'vitest';
import { ART_STAGES, evaluateArtShot } from '../src/routes/games/billiards/artStages';
import {
  ANGULAR_STOP_SPEED,
  CUE_SPIN_ANGULAR_SCALE,
  CUE_SPIN_STOP_VALUE,
  PHYSICS_BASE_STEP_MS,
  PHYSICS_MAX_SUBSTEPS,
  RAIL_RESTITUTION,
  RAIL_SURFACE_FRICTION,
  RAIL_THICKNESS,
  STOP_SPEED,
  TABLE_HEIGHT,
  TABLE_WIDTH,
  computeDynamicSpinDecay,
  computeDynamicVelocityScale,
  computeAngularVelocityScale,
  computeMaxCollisionSpeed,
  computePhysicsSubstepCount,
  computeRailReboundVelocity,
  computeShotVelocity,
  computeSpinAdjustedVelocity,
  computeVerticalSpinVelocityScale,
  containBallInTable,
  shouldSnapStoppedSpeed,
  stopped,
  type BilliardsRailSide
} from '../src/routes/games/billiards/gameUtils';
import { createBilliardsBallBody } from '../src/routes/games/billiards/billiardsPhysics';

type Ball = Matter.Body & { billiardsId?: string; railSide?: BilliardsRailSide };

function simulate(stage: (typeof ART_STAGES)[number], angle: number, power: number) {
  const engine = Matter.Engine.create({ gravity: { x: 0, y: 0 } });
  const ball = (x: number, y: number, id: string) => {
    const body = createBilliardsBallBody(x, y) as Ball;
    body.billiardsId = id;
    return body;
  };
  const cue = ball(stage.cue.x, stage.cue.y, 'cue');
  const targets = stage.targets.map((item) => ball(item.x, item.y, item.id));
  const obstacles = stage.obstacles.map((item) => {
    const body = ball(item.x, item.y, item.id);
    if (item.static) Matter.Body.setStatic(body, true);
    return body;
  });
  const rail = (x: number, y: number, width: number, height: number, side: BilliardsRailSide) => {
    const body = Matter.Bodies.rectangle(x, y, width, height, {
      isStatic: true,
      restitution: RAIL_RESTITUTION,
      friction: RAIL_SURFACE_FRICTION
    }) as Ball;
    body.railSide = side;
    return body;
  };
  const rails = [
    rail(TABLE_WIDTH / 2, RAIL_THICKNESS / 2, TABLE_WIDTH, RAIL_THICKNESS, 'top'),
    rail(TABLE_WIDTH / 2, TABLE_HEIGHT - RAIL_THICKNESS / 2, TABLE_WIDTH, RAIL_THICKNESS, 'bottom'),
    rail(RAIL_THICKNESS / 2, TABLE_HEIGHT / 2, RAIL_THICKNESS, TABLE_HEIGHT, 'left'),
    rail(TABLE_WIDTH - RAIL_THICKNESS / 2, TABLE_HEIGHT / 2, RAIL_THICKNESS, TABLE_HEIGHT, 'right')
  ];
  Matter.Composite.add(engine.world, [cue, ...targets, ...obstacles, ...rails]);
  const cueContacts: string[] = [];
  const cushionHits: string[] = [];
  let pendingRailContacts: Array<{
    ball: Ball;
    side: BilliardsRailSide;
    normal: { x: number; y: number };
  }> = [];
  let blackHit = false;
  Matter.Events.on(engine, 'collisionStart', (event) => {
    for (const pair of event.pairs) {
      const a = pair.bodyA as Ball;
      const b = pair.bodyB as Ball;
      const other = a === cue ? b : b === cue ? a : null;
      const railBody = a.railSide ? a : b.railSide ? b : null;
      const movingBody = railBody === a ? b : railBody === b ? a : null;
      if (railBody?.railSide && movingBody?.billiardsId) {
        pendingRailContacts.push({
          ball: movingBody,
          side: railBody.railSide,
          normal: { x: pair.collision.normal.x, y: pair.collision.normal.y }
        });
      }
      if (other?.railSide) cushionHits.push(other.railSide);
      if (other?.billiardsId) {
        cueContacts.push(other.billiardsId);
        if (other.billiardsId.startsWith('black-')) blackHit = true;
      }
    }
  });
  Matter.Body.setVelocity(cue, computeShotVelocity(angle, power));
  Matter.Body.setAngularVelocity(cue, stage.solution.sideSpin / CUE_SPIN_ANGULAR_SCALE);
  let sideSpin = stage.solution.sideSpin;
  let verticalSpin = stage.solution.verticalSpin;
  const moving = [cue, ...targets, ...obstacles];
  const visited = new Set<number>();
  for (let step = 0; step < 720; step += 1) {
    let remainingDelta = PHYSICS_BASE_STEP_MS;
    for (let substep = 0; remainingDelta > 0.0001 && substep < PHYSICS_MAX_SUBSTEPS; substep += 1) {
      const collisionSpeed = computeMaxCollisionSpeed(moving);
      const remainingSubsteps = computePhysicsSubstepCount(collisionSpeed, remainingDelta);
      const substepDelta =
        substep === PHYSICS_MAX_SUBSTEPS - 1 ? remainingDelta : remainingDelta / remainingSubsteps;
      Matter.Engine.update(engine, substepDelta);
      for (const contact of pendingRailContacts) {
        Matter.Body.setVelocity(
          contact.ball,
          computeRailReboundVelocity(contact.ball.velocity, contact.side, contact.normal)
        );
      }
      pendingRailContacts = [];
      for (const [index, point] of stage.waypoints.entries()) {
        if (Math.hypot(cue.position.x - point.x, cue.position.y - point.y) <= 16)
          visited.add(index);
      }
      for (const body of moving) {
        const next = containBallInTable({ position: body.position, velocity: body.velocity });
        if (next.corrected) {
          Matter.Body.setPosition(body, next.position);
          Matter.Body.setVelocity(body, next.velocity);
        }
        const speed = Math.hypot(body.velocity.x, body.velocity.y);
        if (Math.abs(body.angularVelocity) <= ANGULAR_STOP_SPEED)
          Matter.Body.setAngularVelocity(body, 0);
        else
          Matter.Body.setAngularVelocity(
            body,
            body.angularVelocity * computeAngularVelocityScale(substepDelta)
          );
        if (shouldSnapStoppedSpeed(speed)) Matter.Body.setVelocity(body, { x: 0, y: 0 });
        else {
          const scale =
            body === cue && verticalSpin !== 0
              ? computeVerticalSpinVelocityScale(speed, substepDelta, verticalSpin)
              : computeDynamicVelocityScale(speed, substepDelta);
          Matter.Body.setVelocity(body, { x: body.velocity.x * scale, y: body.velocity.y * scale });
        }
        if (body === cue && verticalSpin !== 0) {
          verticalSpin *= computeDynamicSpinDecay(speed, substepDelta);
          if (Math.abs(verticalSpin) < CUE_SPIN_STOP_VALUE) verticalSpin = 0;
        }
      }
      remainingDelta = Math.max(0, remainingDelta - substepDelta);
    }
    if (sideSpin !== 0) {
      const speed = Math.hypot(cue.velocity.x, cue.velocity.y);
      const adjusted = computeSpinAdjustedVelocity(cue.velocity, sideSpin, verticalSpin, 16.66);
      Matter.Body.setVelocity(cue, adjusted);
      sideSpin *= computeDynamicSpinDecay(speed, 16.66);
      if (Math.abs(sideSpin) < CUE_SPIN_STOP_VALUE) sideSpin = 0;
    }
    if (step > 20 && stopped(moving, STOP_SPEED)) break;
  }
  return evaluateArtShot(stage, {
    cueContacts,
    cushionHits,
    blackHit,
    waypointCount: visited.size,
    ballCollisions: 0,
    sideSpin: stage.solution.sideSpin,
    verticalSpin: stage.solution.verticalSpin
  });
}

describe('billiards art stage physics', () => {
  it('completes every stage with its authored help shot', () => {
    const failures: string[] = [];
    for (const stage of ART_STAGES) {
      const result = simulate(stage, stage.solution.angle, stage.solution.power);
      if (!result.success) failures.push(`stage ${stage.stage}: ${result.message}`);
    }
    if (failures.length > 0) throw new Error(failures.join('\n'));
  }, 120_000);
});
