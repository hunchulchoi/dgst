import Matter from 'matter-js';
import {
  BALL_FRICTION_AIR,
  BALL_RADIUS,
  BALL_RESTITUTION,
  BALL_STATIC_FRICTION,
  BALL_SURFACE_FRICTION,
  RAIL_RESTITUTION,
  RAIL_SURFACE_FRICTION,
  getPocketRailGeometry,
  type BilliardsRailSide
} from './gameUtils';

export const BALL_COLLISION_SIDES = 64;

export type BilliardsRailBody = Matter.Body & {
  billiardsRail?: true;
  billiardsRailSide?: BilliardsRailSide;
};

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

function markRail(body: Matter.Body, side: BilliardsRailSide): BilliardsRailBody {
  const rail = body as BilliardsRailBody;
  rail.billiardsRail = true;
  rail.billiardsRailSide = side;
  return rail;
}

export function createBilliardsPocketRailBodies(): BilliardsRailBody[] {
  const geometry = getPocketRailGeometry();
  const options: Matter.IChamferableBodyDefinition = {
    label: 'rail',
    isStatic: true,
    restitution: RAIL_RESTITUTION,
    friction: RAIL_SURFACE_FRICTION,
    render: { fillStyle: '#31533b' }
  };
  const rails = geometry.rails.map((rail) =>
    markRail(Matter.Bodies.rectangle(rail.x, rail.y, rail.width, rail.height, options), rail.side)
  );
  const jaws = geometry.jaws.map((jaw) => {
    const center = jaw.vertices.reduce(
      (sum, vertex) => ({ x: sum.x + vertex.x / 3, y: sum.y + vertex.y / 3 }),
      { x: 0, y: 0 }
    );
    const localVertices = jaw.vertices.map((vertex) => ({
      x: vertex.x - center.x,
      y: vertex.y - center.y
    }));
    return markRail(
      Matter.Bodies.fromVertices(center.x, center.y, [localVertices], {
        ...options,
        label: 'rail-jaw'
      }),
      jaw.side
    );
  });
  return [...rails, ...jaws];
}
