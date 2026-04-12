import { Vec2 } from './math.js';

export class Circle {
  constructor(radius) {
    this.type = 'circle';
    this.radius = radius;
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

  computeAABB(position, angle) {
    const verts = this.getVertices(position, angle);
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    for (const v of verts) {
      if (v.x < minX) minX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.x > maxX) maxX = v.x;
      if (v.y > maxY) maxY = v.y;
    }
    return { min: new Vec2(minX, minY), max: new Vec2(maxX, maxY) };
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

  computeAABB(position, angle) {
    const verts = this.getVertices(position, angle);
    let minX = Infinity, minY = Infinity;
    let maxX = -Infinity, maxY = -Infinity;
    for (const v of verts) {
      if (v.x < minX) minX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.x > maxX) maxX = v.x;
      if (v.y > maxY) maxY = v.y;
    }
    return { min: new Vec2(minX, minY), max: new Vec2(maxX, maxY) };
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

  computeAABB(position, angle) {
    const seg = this.getSegment(position, angle);
    const r = this.radius;
    return {
      min: new Vec2(Math.min(seg.start.x, seg.end.x) - r, Math.min(seg.start.y, seg.end.y) - r),
      max: new Vec2(Math.max(seg.start.x, seg.end.x) + r, Math.max(seg.start.y, seg.end.y) + r)
    };
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

  computeAABB(position, angle) {
    const s = this.start.rotate(angle).add(position);
    const e = this.end.rotate(angle).add(position);
    return {
      min: new Vec2(Math.min(s.x, e.x), Math.min(s.y, e.y)),
      max: new Vec2(Math.max(s.x, e.x), Math.max(s.y, e.y))
    };
  }

  computeInertia(mass) {
    return Infinity;
  }
}
