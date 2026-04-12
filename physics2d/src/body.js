import { Vec2 } from './math.js';
import { drawDebugBody } from './debug.js';

export class Body {
  constructor({ shape, position, mass = 0, restitution = 0.2, friction = 0.3, isStatic = false, angle = 0, userData = null, collisionGroup = 0xFFFF, collisionMask = 0xFFFF, isSensor = false, linearDamping = 0, angularDamping = 0 }) {
    this.shape = shape;
    this.position = new Vec2(position.x, position.y);
    this.previousPosition = new Vec2(position.x, position.y);
    this.renderPosition = new Vec2(position.x, position.y);
    this.velocity = new Vec2(0, 0);
    this.angle = angle;
    this.previousAngle = angle;
    this.renderAngle = angle;
    this.angularVelocity = 0;
    this.restitution = restitution;
    this.friction = friction;
    this.isStatic = isStatic;
    this.force = new Vec2(0, 0);
    this.torque = 0;
    this.userData = userData;
    this.collisionGroup = collisionGroup;
    this.collisionMask = collisionMask;
    this.isSensor = isSensor;
    this.linearDamping = linearDamping;
    this.angularDamping = angularDamping;
    this.isSleeping = false;
    this.sleepTimer = 0;

    // Cached AABB — updated once per step via updateAABB()
    this._aabb = { min: new Vec2(0, 0), max: new Vec2(0, 0) };
    this._aabbDirty = true;

    if (isStatic) {
      this.mass = 0;
      this.inverseMass = 0;
      this.inertia = 0;
      this.inverseInertia = 0;
    } else {
      this.mass = mass;
      this.inverseMass = mass > 0 ? 1 / mass : 0;
      this.inertia = shape.computeInertia(mass);
      this.inverseInertia = this.inertia > 0 && this.inertia < Infinity ? 1 / this.inertia : 0;
    }
  }

  applyForce(force) {
    if (this.isStatic) return;
    this.force.addMut(force);
    if (this.isSleeping) this.wake();
  }

  applyImpulse(impulse, worldPoint) {
    if (this.isStatic) return;
    this.velocity.x += impulse.x * this.inverseMass;
    this.velocity.y += impulse.y * this.inverseMass;
    if (worldPoint) {
      const rx = worldPoint.x - this.position.x;
      const ry = worldPoint.y - this.position.y;
      this.angularVelocity += this.inverseInertia * (rx * impulse.y - ry * impulse.x);
    }
    if (this.isSleeping) this.wake();
  }

  sleep() {
    this.isSleeping = true;
    this.velocity.set(0, 0);
    this.angularVelocity = 0;
    this.sleepTimer = 0;
  }

  wake() {
    this.isSleeping = false;
    this.sleepTimer = 0;
  }

  setPosition(x, y) {
    this.position.set(x, y);
    this.previousPosition.set(x, y);
    this.renderPosition.set(x, y);
    this._aabbDirty = true;
    if (this.isSleeping) this.wake();
  }

  setVelocity(x, y) {
    this.velocity.set(x, y);
    if (this.isSleeping) this.wake();
  }

  updateAABB() {
    const fresh = this.shape.computeAABB(this.position, this.angle);
    this._aabb.min.set(fresh.min.x, fresh.min.y);
    this._aabb.max.set(fresh.max.x, fresh.max.y);
    this._aabbDirty = false;
  }

  getAABB() {
    if (this._aabbDirty) this.updateAABB();
    return this._aabb;
  }

  drawDebug(ctx) {
    drawDebugBody(ctx, this);
  }
}
