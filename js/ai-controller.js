import {
  FIXED_DT, TURN_RATE,
  RUBBERBAND_AHEAD_DIST, RUBBERBAND_BEHIND_DIST,
  RUBBERBAND_AHEAD_MULT, RUBBERBAND_BEHIND_MULT,
} from './constants.js';

/**
 * AIController — one instance per AI car.
 *
 * Approach: "drive by feel" with ray-casting against the wall polylines.
 * No waypoint following, no racing line. Each tick:
 *
 *   1. Cast N rays forward from the car at evenly spaced angles.
 *   2. For each ray, find the closest intersection with any wall segment.
 *   3. Steer toward the ray with the longest clear distance, biased
 *      toward straight-ahead (prefer going forward over chasing gaps).
 *   4. Brake based on how close the FORWARD ray's hit is — the closer
 *      the wall straight ahead, the harder we slow down.
 *
 * The AI doesn't know about the "ideal racing line"; it just reliably
 * avoids the walls. Rubber-banding on top adjusts top-speed relative
 * to the player.
 */
export class AIController {
  /**
   * @param {Car} car — the AI's Car instance
   * @param {{left: Array, right: Array}} walls — wall polylines from track.buildWallPaths
   * @param {number} skill — [0..1] base speed multiplier
   * @param {Array} [allCars=null] — full cars array for car-vs-car avoidance
   */
  constructor(car, walls, skill, allCars = null) {
    this.car = car;
    this.walls = walls;
    this.skill = skill;
    this.allCars = allCars;
    // AI never takes the crash branch — only the graduated slowdown
    this.car.crashImpactThreshold = Infinity;

    // Pre-build a flat segment list: [{ax, ay, bx, by}, ...]
    // Much faster to iterate each tick than walking left+right polylines.
    this.segments = AIController._flattenWalls(walls);
  }

  static _flattenWalls(walls) {
    const out = [];
    const pushPath = (path) => {
      if (!path) return;
      for (let i = 0; i < path.length - 1; i++) {
        const a = path[i];
        const b = path[i + 1];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        if (dx * dx + dy * dy < 1) continue; // skip degenerate
        out.push({ ax: a.x, ay: a.y, bx: b.x, by: b.y });
      }
    };
    pushPath(walls.left);
    pushPath(walls.right);
    return out;
  }

  /**
   * Ray-segment intersection. Ray origin (ox,oy), direction (dx,dy)
   * assumed unit-length. Returns the distance along the ray to the
   * closest hit within [0, maxDist], or maxDist if no hit.
   */
  _castRay(ox, oy, dx, dy, maxDist) {
    let closest = maxDist;
    const segs = this.segments;
    for (let i = 0; i < segs.length; i++) {
      const s = segs[i];
      const sx = s.bx - s.ax;
      const sy = s.by - s.ay;
      // Solve: origin + t*d = segA + u*seg, for t >= 0 and 0 <= u <= 1
      // In matrix form: [dx  -sx] [t]   [segAx - ox]
      //                 [dy  -sy] [u] = [segAy - oy]
      const denom = dx * (-sy) - dy * (-sx); // = -dx*sy + dy*sx
      if (Math.abs(denom) < 1e-6) continue; // parallel
      const rhsX = s.ax - ox;
      const rhsY = s.ay - oy;
      const t = (rhsX * (-sy) - rhsY * (-sx)) / denom;
      const u = (dx * rhsY - dy * rhsX) / denom;
      if (t >= 0 && t < closest && u >= 0 && u <= 1) {
        closest = t;
      }
    }
    return closest;
  }

  tick(playerProgress, aiProgress) {
    const car = this.car;
    const ox = car.physX;
    const oy = car.physY;
    const angle = car.physAngle;

    // Ray angles relative to car forward: odd count so one is centered.
    // Spread covers roughly ±60°.
    const RAY_ANGLES = [-1.0, -0.6, -0.3, 0, 0.3, 0.6, 1.0];
    const MAX_RAY_DIST = 900;

    // Car forward = (sin A, -cos A). Rotate by each offset.
    let bestScore = -Infinity;
    let bestOffset = 0;
    let forwardHit = MAX_RAY_DIST;
    const hits = new Array(RAY_ANGLES.length);

    for (let i = 0; i < RAY_ANGLES.length; i++) {
      const theta = angle + RAY_ANGLES[i];
      const dx = Math.sin(theta);
      const dy = -Math.cos(theta);
      const hit = this._castRay(ox, oy, dx, dy, MAX_RAY_DIST);
      hits[i] = hit;
      if (RAY_ANGLES[i] === 0) forwardHit = hit;

      // Score favors clear distance, penalizes steering away from straight
      const centerBias = 1 - Math.abs(RAY_ANGLES[i]) / 1.2;
      const score = hit * (0.5 + 0.5 * centerBias);
      if (score > bestScore) {
        bestScore = score;
        bestOffset = RAY_ANGLES[i];
      }
    }

    // Map best-ray angular offset → steering value in [-1, +1].
    // The car can rotate at most TURN_RATE * FIXED_DT per tick, so we
    // scale by the ratio. Then clamp.
    const maxPerTick = TURN_RATE * FIXED_DT;
    let steering = bestOffset / maxPerTick;
    if (steering >  1) steering =  1;
    if (steering < -1) steering = -1;

    // Perpendicular wall probes — keep the car off the inside of corners.
    // Cast a short ray straight left and straight right from the car.
    // If one side is within SAFE_DIST of a wall, bias steering away from
    // that side. This directly fights the "hug the inside apex" behavior
    // the forward-ray scoring alone doesn't prevent.
    const leftAngle  = angle - Math.PI / 2;
    const rightAngle = angle + Math.PI / 2;
    const PROBE_MAX = 320;
    const SAFE_DIST = 110; // px — start pushing when wall is closer than this
    const SIDE_BIAS_STRENGTH = 1.6;
    const dL = this._castRay(ox, oy, Math.sin(leftAngle),  -Math.cos(leftAngle),  PROBE_MAX);
    const dR = this._castRay(ox, oy, Math.sin(rightAngle), -Math.cos(rightAngle), PROBE_MAX);
    let sideBias = 0;
    if (dL < SAFE_DIST) sideBias += ((SAFE_DIST - dL) / SAFE_DIST) * SIDE_BIAS_STRENGTH; // wall on left → steer right (+)
    if (dR < SAFE_DIST) sideBias -= ((SAFE_DIST - dR) / SAFE_DIST) * SIDE_BIAS_STRENGTH; // wall on right → steer left (-)
    steering += sideBias;
    if (steering >  1) steering =  1;
    if (steering < -1) steering = -1;

    // Car-vs-car avoidance (kept from previous version, simplified)
    if (this.allCars) {
      const fx = Math.sin(angle);
      const fy = -Math.cos(angle);
      const rx = Math.cos(angle);
      const ry = Math.sin(angle);
      const AVOID_RADIUS = 220;
      const AVOID_STRENGTH = 1.2;
      let avoidBias = 0;
      for (const other of this.allCars) {
        if (!other || other === car || !other.body) continue;
        const ddx = other.physX - ox;
        const ddy = other.physY - oy;
        const d2 = ddx * ddx + ddy * ddy;
        if (d2 > AVOID_RADIUS * AVOID_RADIUS) continue;
        const d = Math.sqrt(d2);
        const forward = ddx * fx + ddy * fy;
        if (forward < -30) continue;
        const side = ddx * rx + ddy * ry;
        const w = 1 - d / AVOID_RADIUS;
        const sign = side >= 0 ? 1 : -1;
        avoidBias += -sign * w * AVOID_STRENGTH;
      }
      steering += avoidBias;
      if (steering >  1) steering =  1;
      if (steering < -1) steering = -1;
    }

    // Speed: brake based on how close the FORWARD wall is.
    // forwardHit >= BRAKE_FAR  → full speed (skill)
    // forwardHit <= BRAKE_NEAR → minimum speed
    const BRAKE_FAR = 520;         // brake later (was 700)
    const BRAKE_NEAR = 150;        // brake harder only when very close (was 180)
    let brakeT;
    if (forwardHit >= BRAKE_FAR) brakeT = 0;
    else if (forwardHit <= BRAKE_NEAR) brakeT = 1;
    else brakeT = 1 - (forwardHit - BRAKE_NEAR) / (BRAKE_FAR - BRAKE_NEAR);
    const MIN_SPEED_MULT = 0.48;   // less slowdown in tight corners (was 0.30)
    this.car.maxSpeedMult = this.skill * (1 - brakeT) + MIN_SPEED_MULT * brakeT;

    // Rubber-banding
    if (playerProgress !== null && playerProgress !== undefined &&
        aiProgress !== null && aiProgress !== undefined) {
      const gap = aiProgress - playerProgress;
      if (gap > RUBBERBAND_AHEAD_DIST) {
        this.car.maxSpeedMult *= RUBBERBAND_AHEAD_MULT;
      } else if (gap < -RUBBERBAND_BEHIND_DIST) {
        this.car.maxSpeedMult *= RUBBERBAND_BEHIND_MULT;
      }
    }

    if (this.car.maxSpeedMult < 0.25) this.car.maxSpeedMult = 0.25;
    if (this.car.maxSpeedMult > 1.2)  this.car.maxSpeedMult = 1.2;

    return steering;
  }
}
