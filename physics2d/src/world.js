import { Vec2 } from './math.js';
import { detectCollision, resolveCollision } from './collision.js';
import { raycast as raycastFn } from './raycast.js';

const AABB_EPSILON = 1;

// Pre-allocated scratch vectors for zero-alloc hot paths
const _tmp1 = new Vec2(0, 0);
const _tmp2 = new Vec2(0, 0);

function aabbOverlap(a, b) {
  const aabbA = a.getAABB();
  const aabbB = b.getAABB();
  return aabbA.max.x + AABB_EPSILON > aabbB.min.x - AABB_EPSILON
      && aabbA.min.x - AABB_EPSILON < aabbB.max.x + AABB_EPSILON
      && aabbA.max.y + AABB_EPSILON > aabbB.min.y - AABB_EPSILON
      && aabbA.min.y - AABB_EPSILON < aabbB.max.y + AABB_EPSILON;
}

function canCollide(a, b) {
  return (a.collisionGroup & b.collisionMask) !== 0
      && (b.collisionGroup & a.collisionMask) !== 0;
}

export class World {
  constructor({ gravity = new Vec2(0, 981), fixedDt = 1 / 60 } = {}) {
    this.gravity = gravity;
    this.fixedDt = fixedDt;
    this.bodies = [];
    this.accumulator = 0;
    this.onCollision = null;
    this._pendingRemovals = [];
    this._stepping = false;
    this.sleepVelocityThreshold = 0.5;
    this.sleepAngularThreshold = 0.05;
    this.sleepTimeThreshold = 0.5;

    // Performance stats (updated each step)
    this.stats = {
      bodyCount: 0,
      activeCount: 0,
      sleepingCount: 0,
      collisionPairs: 0,
      stepTimeMs: 0
    };

    // Debug draw options
    this.debug = {
      drawAABBs: false,
      drawVelocities: false,
      drawContacts: false,
      drawSleepState: true
    };
  }

  addBody(body) {
    this.bodies.push(body);
    body._aabbDirty = true;
    if (!body.isStatic) {
      for (let iter = 0; iter < 10; iter++) {
        let resolved = true;
        for (const other of this.bodies) {
          if (other === body) continue;
          if (!aabbOverlap(body, other)) continue;
          const contact = detectCollision(body, other);
          if (contact.hasCollision && !body.isSensor && !other.isSensor) {
            resolved = false;
            const invMassSum = body.inverseMass + other.inverseMass;
            if (invMassSum === 0) continue;
            const s = contact.depth / invMassSum;
            // Use mutable ops to avoid allocations
            body.position.x -= contact.normal.x * s * body.inverseMass;
            body.position.y -= contact.normal.y * s * body.inverseMass;
            body._aabbDirty = true;
            if (!other.isStatic) {
              other.position.x += contact.normal.x * s * other.inverseMass;
              other.position.y += contact.normal.y * s * other.inverseMass;
              other._aabbDirty = true;
              if (other.isSleeping) other.wake();
            }
          }
        }
        if (resolved) break;
      }
      body.previousPosition.copy(body.position);
      body.renderPosition.copy(body.position);
    }
  }

  removeBody(body) {
    if (this._stepping) {
      this._pendingRemovals.push(body);
    } else {
      const idx = this.bodies.indexOf(body);
      if (idx !== -1) this.bodies.splice(idx, 1);
    }
  }

  _flushRemovals() {
    if (this._pendingRemovals.length === 0) return;
    for (const body of this._pendingRemovals) {
      const idx = this.bodies.indexOf(body);
      if (idx !== -1) this.bodies.splice(idx, 1);
    }
    this._pendingRemovals.length = 0;
  }

  clear() {
    this.bodies.length = 0;
  }

  raycast(origin, direction, maxDist, mask = 0xFFFF) {
    return raycastFn(this.bodies, origin, direction, maxDist, mask);
  }

  step(dt) {
    if (dt <= 0) return;
    if (dt > 0.1) dt = 0.1;

    const stepStart = performance.now();

    this.accumulator += dt;

    this._stepping = true;
    while (this.accumulator >= this.fixedDt) {
      this.fixedStep(this.fixedDt);
      this.accumulator -= this.fixedDt;
    }
    this._stepping = false;
    this._flushRemovals();

    // Interpolate render positions (use mutable ops)
    const alpha = this.accumulator / this.fixedDt;
    for (const body of this.bodies) {
      Vec2.lerpTo(body.renderPosition, body.previousPosition, body.position, alpha);
      body.renderAngle = body.previousAngle + (body.angle - body.previousAngle) * alpha;
    }

    // Update stats
    let sleeping = 0;
    let active = 0;
    for (const body of this.bodies) {
      if (body.isSleeping) sleeping++;
      else if (!body.isStatic) active++;
    }
    this.stats.bodyCount = this.bodies.length;
    this.stats.activeCount = active;
    this.stats.sleepingCount = sleeping;
    this.stats.stepTimeMs = performance.now() - stepStart;
  }

  fixedStep(dt) {
    // Save previous positions (mutable copy, no allocation)
    for (const body of this.bodies) {
      body.previousPosition.copy(body.position);
      body.previousAngle = body.angle;
    }

    // Integration
    const gx = this.gravity.x * dt;
    const gy = this.gravity.y * dt;
    for (const body of this.bodies) {
      if (body.isStatic || body.isSleeping) continue;
      // Apply accumulated forces (mutable)
      body.velocity.x += body.force.x * body.inverseMass * dt;
      body.velocity.y += body.force.y * body.inverseMass * dt;
      body.angularVelocity += body.torque * body.inverseInertia * dt;
      // Apply gravity
      body.velocity.x += gx;
      body.velocity.y += gy;
      // Clear forces (mutable)
      body.force.set(0, 0);
      body.torque = 0;
      // Apply damping
      if (body.linearDamping > 0) {
        const d = 1 - body.linearDamping * dt;
        body.velocity.x *= d;
        body.velocity.y *= d;
      }
      if (body.angularDamping > 0) {
        body.angularVelocity *= 1 - body.angularDamping * dt;
      }
      // Integrate position (mutable)
      body.position.x += body.velocity.x * dt;
      body.position.y += body.velocity.y * dt;
      body.angle += body.angularVelocity * dt;
      body._aabbDirty = true;
    }

    // Collision detection and resolution
    let collisionPairs = 0;
    const solverIterations = 3;
    for (let iter = 0; iter < solverIterations; iter++) {
      for (let pass = 0; pass < 2; pass++) {
        for (let i = 0; i < this.bodies.length; i++) {
          for (let j = i + 1; j < this.bodies.length; j++) {
            const a = this.bodies[i];
            const b = this.bodies[j];

            if (a.isStatic && b.isStatic) continue;
            if (a.isSleeping && b.isSleeping) continue;
            if (!canCollide(a, b)) continue;

            const hasStatic = a.isStatic || b.isStatic;
            if (pass === 0 && hasStatic) continue;
            if (pass === 1 && !hasStatic) continue;

            if (!aabbOverlap(a, b)) continue;

            const contact = detectCollision(a, b);
            if (contact.hasCollision) {
              if (iter === 0) collisionPairs++;

              if (this.onCollision) this.onCollision(a, b, contact);

              if (a.isSensor || b.isSensor) continue;

              resolveCollision(a, b, contact);
              a._aabbDirty = true;
              b._aabbDirty = true;

              if (a.isSleeping) a.wake();
              if (b.isSleeping) b.wake();
            }
          }
        }
      }
    }
    this.stats.collisionPairs = collisionPairs;

    // Sleep logic
    for (const body of this.bodies) {
      if (body.isStatic || body.isSleeping) continue;
      const speed = Math.sqrt(body.velocity.x * body.velocity.x + body.velocity.y * body.velocity.y);
      const angSpeed = Math.abs(body.angularVelocity);
      if (speed < this.sleepVelocityThreshold && angSpeed < this.sleepAngularThreshold) {
        body.sleepTimer += dt;
        if (body.sleepTimer >= this.sleepTimeThreshold) {
          body.sleep();
        }
      } else {
        body.sleepTimer = 0;
      }
    }
  }
}
