import { Vec2 } from './math.js';

// Ray-AABB intersection test
function rayVsAABB(origin, dirInv, aabb, maxDist) {
  const tx1 = (aabb.min.x - origin.x) * dirInv.x;
  const tx2 = (aabb.max.x - origin.x) * dirInv.x;
  const ty1 = (aabb.min.y - origin.y) * dirInv.y;
  const ty2 = (aabb.max.y - origin.y) * dirInv.y;
  const tmin = Math.max(Math.min(tx1, tx2), Math.min(ty1, ty2));
  const tmax = Math.min(Math.max(tx1, tx2), Math.max(ty1, ty2));
  return tmax >= 0 && tmin <= tmax && tmin <= maxDist;
}

// Ray vs line segment, returns t parameter or -1
function rayVsSegment(origin, dir, p1, p2) {
  const edge = p2.sub(p1);
  const dxe = dir.cross(edge);
  if (Math.abs(dxe) < 1e-10) return -1; // parallel
  const diff = p1.sub(origin);
  const t = diff.cross(edge) / dxe;
  const u = diff.cross(dir) / dxe;
  if (t >= 0 && u >= 0 && u <= 1) return t;
  return -1;
}

function rayVsCircle(origin, dir, center, radius) {
  const oc = origin.sub(center);
  const a = dir.dot(dir);
  const b = 2 * oc.dot(dir);
  const c = oc.dot(oc) - radius * radius;
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) return null;
  const sqrtD = Math.sqrt(discriminant);
  const t1 = (-b - sqrtD) / (2 * a);
  const t2 = (-b + sqrtD) / (2 * a);
  const t = t1 >= 0 ? t1 : (t2 >= 0 ? t2 : -1);
  if (t < 0) return null;
  const point = origin.add(dir.scale(t));
  const normal = point.sub(center).normalize();
  return { t, point, normal };
}

function rayVsBody(origin, dir, body) {
  const shape = body.shape;
  const type = shape.type;

  if (type === 'circle') {
    return rayVsCircle(origin, dir, body.position, shape.radius);
  }

  if (type === 'rectangle' || type === 'triangle') {
    const verts = shape.getVertices(body.position, body.angle);
    let bestT = Infinity;
    let bestNormal = null;
    for (let i = 0; i < verts.length; i++) {
      const next = (i + 1) % verts.length;
      const t = rayVsSegment(origin, dir, verts[i], verts[next]);
      if (t >= 0 && t < bestT) {
        bestT = t;
        const edge = verts[next].sub(verts[i]);
        bestNormal = new Vec2(-edge.y, edge.x).normalize();
        // Ensure normal faces toward ray origin
        if (bestNormal.dot(dir) > 0) bestNormal = bestNormal.negate();
      }
    }
    if (bestT === Infinity) return null;
    return { t: bestT, point: origin.add(dir.scale(bestT)), normal: bestNormal };
  }

  if (type === 'capsule') {
    const seg = shape.getSegment(body.position, body.angle);
    // Test the two semicircle caps
    const hit1 = rayVsCircle(origin, dir, seg.start, shape.radius);
    const hit2 = rayVsCircle(origin, dir, seg.end, shape.radius);
    // Test the two parallel edges
    const capsuleDir = seg.end.sub(seg.start).normalize();
    const perpendicular = capsuleDir.perp().scale(shape.radius);
    const hit3t = rayVsSegment(origin, dir, seg.start.add(perpendicular), seg.end.add(perpendicular));
    const hit4t = rayVsSegment(origin, dir, seg.start.sub(perpendicular), seg.end.sub(perpendicular));

    let best = null;
    if (hit1 && (!best || hit1.t < best.t)) best = hit1;
    if (hit2 && (!best || hit2.t < best.t)) best = hit2;
    if (hit3t >= 0 && (!best || hit3t < best.t)) {
      const point = origin.add(dir.scale(hit3t));
      const normal = perpendicular.normalize();
      if (normal.dot(dir) > 0) best = { t: hit3t, point, normal: normal.negate() };
      else best = { t: hit3t, point, normal };
    }
    if (hit4t >= 0 && (!best || hit4t < best.t)) {
      const point = origin.add(dir.scale(hit4t));
      const normal = perpendicular.negate().normalize();
      if (normal.dot(dir) > 0) best = { t: hit4t, point, normal: normal.negate() };
      else best = { t: hit4t, point, normal };
    }
    return best;
  }

  if (type === 'edge') {
    const p1 = shape.start.rotate(body.angle).add(body.position);
    const p2 = shape.end.rotate(body.angle).add(body.position);
    const t = rayVsSegment(origin, dir, p1, p2);
    if (t < 0) return null;
    const edge = p2.sub(p1);
    let normal = new Vec2(-edge.y, edge.x).normalize();
    if (normal.dot(dir) > 0) normal = normal.negate();
    return { t, point: origin.add(dir.scale(t)), normal };
  }

  return null;
}

export function raycast(bodies, origin, direction, maxDist, mask = 0xFFFF) {
  const dir = direction.normalize();
  const dirInv = new Vec2(
    dir.x !== 0 ? 1 / dir.x : 1e10,
    dir.y !== 0 ? 1 / dir.y : 1e10
  );

  const hits = [];

  for (const body of bodies) {
    // Layer filtering
    if ((body.collisionGroup & mask) === 0) continue;

    // AABB pre-check
    const aabb = body.getAABB();
    if (!rayVsAABB(origin, dirInv, aabb, maxDist)) continue;

    const hit = rayVsBody(origin, dir, body);
    if (hit && hit.t >= 0 && hit.t <= maxDist) {
      hits.push({
        body,
        point: hit.point,
        normal: hit.normal,
        distance: hit.t
      });
    }
  }

  hits.sort((a, b) => a.distance - b.distance);
  return hits;
}
