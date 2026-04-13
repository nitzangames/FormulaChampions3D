import { Vec2, Capsule, Body } from '../physics2d/index.js';
import {
  CAR_W, CAR_H, CAR_MASS, CAR_RESTITUTION, CAR_FRICTION,
  MAX_SPEED, ACCELERATION, TURN_RATE, TURN_SPEED_PENALTY,
  CRASH_IMPACT_THRESHOLD, WALL_SPEED_CURVE_EXPONENT, FIXED_DT,
} from './constants.js';

/**
 * Capsule angle convention:
 *
 * Physics2D's Capsule shape has its long axis along +X at angle=0
 * (dir = (cos A, sin A)). The game's visual convention is that a car at
 * "angle 0" points -Y (north, forward = (sin A, -cos A)).
 *
 * To reconcile: we store body.angle in the capsule's native convention
 * (90° offset from visual), and the Car class exposes angle/physAngle
 * as the visual angle by adding PI/2. All math inside Car.update and
 * onWallCollision works directly in capsule convention — the forward
 * direction is just (cos(body.angle), sin(body.angle)) — so it's
 * actually slightly simpler than the old circle-based code.
 */
const ANGLE_OFFSET = Math.PI / 2;

export class Car {
  constructor(world, { isKinematic = false } = {}) {
    this.world = world;
    this.isKinematic = isKinematic;
    this.body = null;
    this.speed = 0;       // current forward speed px/s
    this.crashed = false;
    this.finished = false;
    this.tickCount = 0;
    this.crashImpactThreshold = CRASH_IMPACT_THRESHOLD;
    this.maxSpeedMult = 1.0;
    // Wall-slide bounce state. On a glancing hit we snap the car
    // parallel to the wall and coast for a short lockout window
    // (ignoring input) so the slide plays out without the player
    // fighting it.
    this._bounceTimer = 0;
    this._bounceVelX = 0;
    this._bounceVelY = 0;
    this._targetAngle = undefined;
  }

  /**
   * Create the car's physics body and add it to the world.
   * @param angle — VISUAL angle (0 = pointing -Y / north). Converted to
   *   capsule convention internally.
   */
  spawn(x, y, angle) {
    // Capsule: total length along long axis = length + 2*radius. Using
    // radius = CAR_W/2 (matches car width) and length such that total
    // length equals CAR_H (matches car sprite length).
    const radius = CAR_W * 0.5;
    const length = CAR_H - 2 * radius;
    const shape = new Capsule(length, radius);
    this.body = new Body({
      shape,
      position: new Vec2(x, y),
      mass: this.isKinematic ? 0 : CAR_MASS,
      isStatic: this.isKinematic,
      restitution: CAR_RESTITUTION,
      friction: CAR_FRICTION,
      angle: angle - ANGLE_OFFSET, // convert visual → capsule
      userData: { type: 'car' },
    });
    this.world.addBody(this.body);
    this.speed = 0;
    this.crashed = false;
    this.finished = false;
    this.tickCount = 0;
    this._bounceTimer = 0;
    this._bounceVelX = 0;
    this._bounceVelY = 0;
    this._targetAngle = undefined;
  }

  /**
   * Called each physics tick BEFORE world.step().
   * Applies steering and sets velocity in the forward direction.
   */
  update(steering) {
    if (this.isKinematic) return;
    if (!this.body || this.crashed) return;

    // Bounce-coast lockout: after a glancing wall hit we slide along
    // the wall tangent for ~0.1s, ignoring player input. The physics
    // engine would otherwise rebound us off the wall every tick; we
    // pin velocity to the stored slide direction and early-return.
    if (this._bounceTimer > 0) {
      this._bounceTimer -= FIXED_DT;
      const decay = 0.985;
      this._bounceVelX *= decay;
      this._bounceVelY *= decay;
      this.body.velocity.set(this._bounceVelX, this._bounceVelY);
      this.body.angularVelocity = 0;
      this.speed = Math.hypot(this._bounceVelX, this._bounceVelY);
      // Smoothly rotate toward the slide direction instead of snapping
      if (this._targetAngle !== undefined) {
        let diff = this._targetAngle - this.body.angle;
        // Normalize to [-PI, PI]
        while (diff > Math.PI) diff -= 2 * Math.PI;
        while (diff < -Math.PI) diff += 2 * Math.PI;
        const lerpRate = 3; // rad/s — smooth enough for camera
        const maxStep = lerpRate * FIXED_DT;
        this.body.angle += Math.max(-maxStep, Math.min(maxStep, diff));
        this.body._aabbDirty = true;
      }
      return;
    }

    this.tickCount++;
    this._wallHitThisTick = false;

    // 1. Apply steering — directly modify body angle (delta is the same
    //    in both visual and capsule conventions, just a rotation).
    this.body.angle += steering * TURN_RATE * FIXED_DT;
    this.body._aabbDirty = true;

    // 2. Compute effective max speed (turning reduces top speed)
    const effectiveMax = MAX_SPEED * this.maxSpeedMult * (1 - Math.abs(steering) * (1 - TURN_SPEED_PENALTY));

    // 3. Accelerate or decelerate toward effectiveMax
    if (this.speed < effectiveMax) {
      this.speed += ACCELERATION * FIXED_DT;
      if (this.speed > effectiveMax) this.speed = effectiveMax;
    } else if (this.speed > effectiveMax) {
      this.speed -= ACCELERATION * 2 * FIXED_DT;
      if (this.speed < effectiveMax) this.speed = effectiveMax;
    }

    // 4. Set velocity in forward direction.
    //    With capsule convention, forward = (cos(body.angle), sin(body.angle)).
    const a = this.body.angle;
    const vx = Math.cos(a) * this.speed;
    const vy = Math.sin(a) * this.speed;
    this.body.velocity.set(vx, vy);

    // 5. Zero angular velocity — we control angle directly
    this.body.angularVelocity = 0;
  }

  /**
   * Called AFTER world.step() to read back velocity (physics may have changed it via collisions).
   */
  postPhysicsUpdate() {
    if (this.isKinematic) return;
    if (!this.body || this.crashed) return;

    const vx = this.body.velocity.x;
    const vy = this.body.velocity.y;
    this.speed = Math.sqrt(vx * vx + vy * vy);
  }

  /**
   * Called from the world collision callback when the car hits a wall.
   *
   * Three paths:
   *   1. Already in a bounce-slide lockout: the physics engine is still
   *      firing contact callbacks as the car separates from the wall,
   *      and its restitution impulse would fight our stored slide
   *      velocity (producing ping-pong). Pin velocity to the stored
   *      slide and bail.
   *   2. Head-on hit (impact angle ≥ crashImpactThreshold): crash.
   *   3. Glancing hit: project forward onto the wall tangent, snap the
   *      body to face along that tangent, multiply speed by DAMPEN,
   *      and start the 0.1s lockout window.
   */
  onWallCollision(contact) {
    if (!this.body || this.crashed) return;

    // Path 1: lockout active — pin velocity so the engine's impulse
    // cannot flip us back into the wall.
    if (this._bounceTimer > 0) {
      this.body.velocity.set(this._bounceVelX, this._bounceVelY);
      this._wallHitThisTick = true;
      return;
    }

    if (this._wallHitThisTick) return;
    this._wallHitThisTick = true;

    const a = this.body.angle;
    // Capsule-convention forward direction:
    const fx = Math.cos(a);
    const fy = Math.sin(a);

    const nx = contact.normal.x;
    const ny = contact.normal.y;

    // impact: 0 = perfectly parallel scrape, 1 = perfectly head-on
    const fDotN = fx * nx + fy * ny;
    const impact = Math.abs(fDotN);

    // Path 2: head-on crash
    if (impact >= this.crashImpactThreshold) {
      this.crashed = true;
      this.speed = 0;
      this.body.velocity.set(0, 0);
      return;
    }

    // Path 3: glancing slide — align the car parallel to the wall.
    // Wall tangent from the contact normal, oriented in the car's
    // forward direction so it slides rather than reverses.
    let tx = -ny;
    let ty = nx;
    if (fx * tx + fy * ty < 0) { tx = -tx; ty = -ty; }

    // Smoothly rotate toward wall-parallel during the bounce timer.
    this._targetAngle = Math.atan2(ty, tx);
    this.body._aabbDirty = true;

    const DAMPEN = 0.75;
    const speed = this.speed * DAMPEN;
    const rx = tx * speed;
    const ry = ty * speed;
    this.body.velocity.set(rx, ry);
    this._bounceVelX = rx;
    this._bounceVelY = ry;
    this._bounceTimer = 0.3;
    this.speed = speed;
  }

  // ── Render getters (use interpolated positions) ──

  get x() {
    return this.body ? this.body.renderPosition.x : 0;
  }

  get y() {
    return this.body ? this.body.renderPosition.y : 0;
  }

  // VISUAL angle (for rendering the car sprite, which is drawn with
  // nose at -Y at its "native" angle 0). Add back the ANGLE_OFFSET.
  get angle() {
    return this.body ? this.body.renderAngle + ANGLE_OFFSET : 0;
  }

  // ── Physics position getters ──

  get physX() {
    return this.body ? this.body.position.x : 0;
  }

  get physY() {
    return this.body ? this.body.position.y : 0;
  }

  // VISUAL angle for external consumers (AI steering math uses
  // sin/-cos assuming visual convention, so we add the offset back).
  get physAngle() {
    return this.body ? this.body.angle + ANGLE_OFFSET : 0;
  }
}
