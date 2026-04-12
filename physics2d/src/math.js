export class Vec2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  add(v) {
    return new Vec2(this.x + v.x, this.y + v.y);
  }

  sub(v) {
    return new Vec2(this.x - v.x, this.y - v.y);
  }

  scale(s) {
    return new Vec2(this.x * s, this.y * s);
  }

  dot(v) {
    return this.x * v.x + this.y * v.y;
  }

  cross(v) {
    return this.x * v.y - this.y * v.x;
  }

  length() {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  lengthSq() {
    return this.x * this.x + this.y * this.y;
  }

  normalize() {
    const len = this.length();
    if (len === 0) return new Vec2(0, 0);
    return new Vec2(this.x / len, this.y / len);
  }

  negate() {
    return new Vec2(-this.x, -this.y);
  }

  perp() {
    return new Vec2(-this.y, this.x);
  }

  rotate(angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return new Vec2(
      this.x * cos - this.y * sin,
      this.x * sin + this.y * cos
    );
  }

  // --- Mutable operations (for internal hot paths, zero allocation) ---

  set(x, y) {
    this.x = x;
    this.y = y;
    return this;
  }

  copy(v) {
    this.x = v.x;
    this.y = v.y;
    return this;
  }

  addMut(v) {
    this.x += v.x;
    this.y += v.y;
    return this;
  }

  subMut(v) {
    this.x -= v.x;
    this.y -= v.y;
    return this;
  }

  scaleMut(s) {
    this.x *= s;
    this.y *= s;
    return this;
  }

  negateMut() {
    this.x = -this.x;
    this.y = -this.y;
    return this;
  }

  normalizeMut() {
    const len = this.length();
    if (len === 0) { this.x = 0; this.y = 0; return this; }
    this.x /= len;
    this.y /= len;
    return this;
  }

  perpMut() {
    const tx = this.x;
    this.x = -this.y;
    this.y = tx;
    return this;
  }

  rotateMut(angle) {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const tx = this.x * cos - this.y * sin;
    const ty = this.x * sin + this.y * cos;
    this.x = tx;
    this.y = ty;
    return this;
  }

  // Store result of add into `out` without allocating
  static addTo(out, a, b) {
    out.x = a.x + b.x;
    out.y = a.y + b.y;
    return out;
  }

  static subTo(out, a, b) {
    out.x = a.x - b.x;
    out.y = a.y - b.y;
    return out;
  }

  static scaleTo(out, v, s) {
    out.x = v.x * s;
    out.y = v.y * s;
    return out;
  }

  static lerpTo(out, a, b, t) {
    out.x = a.x + (b.x - a.x) * t;
    out.y = a.y + (b.y - a.y) * t;
    return out;
  }

  static lerp(a, b, t) {
    return new Vec2(
      a.x + (b.x - a.x) * t,
      a.y + (b.y - a.y) * t
    );
  }

  static distance(a, b) {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
