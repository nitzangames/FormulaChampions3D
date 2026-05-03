import { Vec2 } from './math.js';

// All shapes expose two AABB entry points:
//
//   computeAABBInto(position, angle, outMin, outMax)
//     Writes the AABB into caller-owned Vec2s. Zero allocation on hot paths
//     (called every physics step via Body.updateAABB).
//
//   computeAABB(position, angle)
//     Legacy convenience that returns `{ min, max }` of fresh Vec2s. Kept
//     for tests and any external callers; allocates per call, so game code
//     should prefer `computeAABBInto`.

export class Circle {
  constructor(radius) {
    this.type = 'circle';
    this.radius = radius;
  }

  computeAABBInto(position, angle, outMin, outMax) {
    const r = this.radius;
    outMin.set(position.x - r, position.y - r);
    outMax.set(position.x + r, position.y + r);
  }

  computeAABB(position, angle) {
    return {
      min: new Vec2(position.x - this.radius, position.y - this.radius),
      max: new Vec2(position.x + this.radius, position.y + this.radius)
    };
  }

  computeInertia(mass) {
    return 0.5 * mass * this.radius * this.radius;
  }
}

export class Rectangle {
  constructor(width, height) {
    this.type = 'rectangle';
    this.width = width;
    this.height = height;
  }

  getVertices(position, angle) {
    const hw = this.width / 2;
    const hh = this.height / 2;
    const localVerts = [
      new Vec2(-hw, -hh),
      new Vec2(hw, -hh),
      new Vec2(hw, hh),
      new Vec2(-hw, hh)
    ];
    return localVerts.map(v => v.rotate(angle).add(position));
  }

  computeAABBInto(position, angle, outMin, outMax) {
    const hw = this.width / 2;
    const hh = this.height / 2;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    // The axis-aligned extents of a rotated rectangle reduce to:
    //   extentX = |c|*hw + |s|*hh
    //   extentY = |s|*hw + |c|*hh
    const ex = Math.abs(c) * hw + Math.abs(s) * hh;
    const ey = Math.abs(s) * hw + Math.abs(c) * hh;
    outMin.set(position.x - ex, position.y - ey);
    outMax.set(position.x + ex, position.y + ey);
  }

  computeAABB(position, angle) {
    const out = { min: new Vec2(0, 0), max: new Vec2(0, 0) };
    this.computeAABBInto(position, angle, out.min, out.max);
    return out;
  }

  computeInertia(mass) {
    return mass * (this.width * this.width + this.height * this.height) / 12;
  }
}

export class Triangle {
  constructor(v0, v1, v2) {
    this.type = 'triangle';
    this.vertices = [v0, v1, v2];
  }

  getVertices(position, angle) {
    return this.vertices.map(v => v.rotate(angle).add(position));
  }

  computeAABBInto(position, angle, outMin, outMax) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < 3; i++) {
      const v = this.vertices[i];
      const x = position.x + v.x * c - v.y * s;
      const y = position.y + v.x * s + v.y * c;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
    outMin.set(minX, minY);
    outMax.set(maxX, maxY);
  }

  computeAABB(position, angle) {
    const out = { min: new Vec2(0, 0), max: new Vec2(0, 0) };
    this.computeAABBInto(position, angle, out.min, out.max);
    return out;
  }

  computeInertia(mass) {
    // Inertia of a triangle about its centroid
    const [a, b, c] = this.vertices;
    const area = Math.abs(b.sub(a).cross(c.sub(a))) / 2;
    if (area === 0) return 0;
    const aa = a.dot(a), bb = b.dot(b), cc = c.dot(c);
    const ab = a.dot(b), bc = b.dot(c), ca = c.dot(a);
    return mass * (aa + bb + cc + ab + bc + ca) / 6;
  }
}

export class Capsule {
  constructor(length, radius) {
    this.type = 'capsule';
    this.length = length;
    this.radius = radius;
  }

  getSegment(position, angle) {
    const half = this.length / 2;
    const dir = new Vec2(Math.cos(angle), Math.sin(angle));
    return {
      start: position.sub(dir.scale(half)),
      end: position.add(dir.scale(half))
    };
  }

  computeAABBInto(position, angle, outMin, outMax) {
    const half = this.length / 2;
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const dx = c * half;
    const dy = s * half;
    const sx = position.x - dx;
    const sy = position.y - dy;
    const ex = position.x + dx;
    const ey = position.y + dy;
    const r = this.radius;
    const minX = (sx < ex ? sx : ex) - r;
    const minY = (sy < ey ? sy : ey) - r;
    const maxX = (sx > ex ? sx : ex) + r;
    const maxY = (sy > ey ? sy : ey) + r;
    outMin.set(minX, minY);
    outMax.set(maxX, maxY);
  }

  computeAABB(position, angle) {
    const out = { min: new Vec2(0, 0), max: new Vec2(0, 0) };
    this.computeAABBInto(position, angle, out.min, out.max);
    return out;
  }

  computeInertia(mass) {
    // Approximate as rectangle + two semicircles
    const r = this.radius;
    const l = this.length;
    const rectI = mass * (l * l + 4 * r * r) / 12;
    return rectI;
  }
}

export class Edge {
  constructor(start, end) {
    this.type = 'edge';
    this.start = start;
    this.end = end;
  }

  computeAABBInto(position, angle, outMin, outMax) {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const sx = position.x + this.start.x * c - this.start.y * s;
    const sy = position.y + this.start.x * s + this.start.y * c;
    const ex = position.x + this.end.x * c - this.end.y * s;
    const ey = position.y + this.end.x * s + this.end.y * c;
    outMin.set(sx < ex ? sx : ex, sy < ey ? sy : ey);
    outMax.set(sx > ex ? sx : ex, sy > ey ? sy : ey);
  }

  computeAABB(position, angle) {
    const out = { min: new Vec2(0, 0), max: new Vec2(0, 0) };
    this.computeAABBInto(position, angle, out.min, out.max);
    return out;
  }

  computeInertia(mass) {
    return Infinity;
  }
}
