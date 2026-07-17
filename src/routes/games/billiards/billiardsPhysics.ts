import Matter from 'matter-js';
import {
  BALL_FRICTION_AIR,
  BALL_RADIUS,
  BALL_RESTITUTION,
  BALL_STATIC_FRICTION,
  BALL_SURFACE_FRICTION
} from './gameUtils';

export const BALL_COLLISION_SIDES = 64;

export function createBilliardsBallBody(
  x: number,
  y: number,
  options: Matter.IChamferableBodyDefinition = {}
): Matter.Body {
  const body = Matter.Bodies.polygon(x, y, BALL_COLLISION_SIDES, BALL_RADIUS, {
    restitution: BALL_RESTITUTION,
    friction: BALL_SURFACE_FRICTION,
    frictionStatic: BALL_STATIC_FRICTION,
    frictionAir: BALL_FRICTION_AIR,
    ...options
  });
  body.circleRadius = BALL_RADIUS;
  return body;
}
