import { Vec2 } from './math.js';

const NO_COLLISION = Object.freeze({ hasCollision: false, normal: null, depth: 0, contactPoints: Object.freeze([]) });

function circleVsCircle(a, b) {
  const diff = b.position.sub(a.position);
  const distSq = diff.lengthSq();
  const radiusSum = a.shape.radius + b.shape.radius;

  const dist = Math.sqrt(distSq);

  if (dist === 0) {
    // Coincident — pick arbitrary normal
    return {
      hasCollision: true,
      normal: new Vec2(1, 0),
      depth: radiusSum,
      contactPoints: [new Vec2(a.position.x, a.position.y)]
    };
  }

  if (dist >= radiusSum) {
    return NO_COLLISION;
  }

  const normal = diff.scale(1 / dist);
  const depth = radiusSum - dist;
  const contactPoint = a.position.add(normal.scale(a.shape.radius - depth / 2));

  return {
    hasCollision: true,
    normal,
    depth,
    contactPoints: [contactPoint]
  };
}

function circleVsEdge(circleBody, edgeBody) {
  const edgeStart = edgeBody.shape.start.rotate(edgeBody.angle).add(edgeBody.position);
  const edgeEnd = edgeBody.shape.end.rotate(edgeBody.angle).add(edgeBody.position);
  const edgeVec = edgeEnd.sub(edgeStart);
  const edgeLenSq = edgeVec.lengthSq();

  const circleToStart = circleBody.position.sub(edgeStart);
  let t = circleToStart.dot(edgeVec) / edgeLenSq;
  t = Math.max(0, Math.min(1, t));

  const closest = edgeStart.add(edgeVec.scale(t));
  const diff = circleBody.position.sub(closest);
  const distSq = diff.lengthSq();
  const radius = circleBody.shape.radius;

  if (distSq >= radius * radius) {
    return NO_COLLISION;
  }

  const dist = Math.sqrt(distSq);
  // Normal points from circle (A) toward edge (B), i.e. from circle center toward closest point
  let normal;
  if (dist === 0) {
    normal = edgeVec.perp().normalize().negate();
  } else {
    normal = diff.scale(-1 / dist);
  }

  return {
    hasCollision: true,
    normal,
    depth: radius - dist,
    contactPoints: [closest]
  };
}

function circleVsRectangle(circleBody, rectBody) {
  // Transform circle center into rectangle's local space
  const localCircle = circleBody.position.sub(rectBody.position).rotate(-rectBody.angle);

  const hw = rectBody.shape.width / 2;
  const hh = rectBody.shape.height / 2;
  const radius = circleBody.shape.radius;

  // Find closest point on rectangle to circle center
  const closestX = Math.max(-hw, Math.min(hw, localCircle.x));
  const closestY = Math.max(-hh, Math.min(hh, localCircle.y));
  const closest = new Vec2(closestX, closestY);

  const diff = localCircle.sub(closest);
  const distSq = diff.lengthSq();

  // Check if circle center is inside the rectangle
  const inside = Math.abs(localCircle.x) < hw && Math.abs(localCircle.y) < hh;

  if (!inside && distSq >= radius * radius) {
    return NO_COLLISION;
  }

  let normal, depth;

  if (inside) {
    const dx = hw - Math.abs(localCircle.x);
    const dy = hh - Math.abs(localCircle.y);
    if (dx < dy) {
      normal = new Vec2(localCircle.x < 0 ? -1 : 1, 0);
      depth = dx + radius;
    } else {
      normal = new Vec2(0, localCircle.y < 0 ? -1 : 1);
      depth = dy + radius;
    }
  } else if (distSq === 0) {
    // Circle center is exactly on the rectangle boundary — push out via shortest axis
    const dx = hw - Math.abs(localCircle.x);
    const dy = hh - Math.abs(localCircle.y);
    if (dx < dy) {
      normal = new Vec2(localCircle.x < 0 ? -1 : 1, 0);
      depth = dx + radius;
    } else {
      normal = new Vec2(0, localCircle.y < 0 ? -1 : 1);
      depth = dy + radius;
    }
  } else {
    const dist = Math.sqrt(distSq);
    normal = diff.scale(1 / dist);
    depth = radius - dist;
  }

  // Rotate normal back to world space and flip to A→B convention (from circle toward rect)
  const worldNormal = normal.negate().rotate(rectBody.angle);
  const contactPoint = circleBody.position.add(worldNormal.scale(radius));

  return {
    hasCollision: true,
    normal: worldNormal,
    depth,
    contactPoints: [contactPoint]
  };
}

function projectVertices(vertices, axis) {
  let min = Infinity, max = -Infinity;
  for (const v of vertices) {
    const proj = v.dot(axis);
    if (proj < min) min = proj;
    if (proj > max) max = proj;
  }
  return { min, max };
}

function getRectAxes(body) {
  const angle = body.angle;
  return [
    new Vec2(Math.cos(angle), Math.sin(angle)),
    new Vec2(-Math.sin(angle), Math.cos(angle))
  ];
}

function getPolyAxes(vertices) {
  const axes = [];
  for (let i = 0; i < vertices.length; i++) {
    const next = (i + 1) % vertices.length;
    const edge = vertices[next].sub(vertices[i]);
    const normal = new Vec2(-edge.y, edge.x).normalize();
    axes.push(normal);
  }
  return axes;
}

function polyVsPoly(a, b) {
  const vertsA = a.shape.getVertices(a.position, a.angle);
  const vertsB = b.shape.getVertices(b.position, b.angle);
  // Use optimized 2-axis for rectangles, edge normals for triangles
  const axesA = a.shape.type === 'rectangle' ? getRectAxes(a) : getPolyAxes(vertsA);
  const axesB = b.shape.type === 'rectangle' ? getRectAxes(b) : getPolyAxes(vertsB);
  const axes = [...axesA, ...axesB];

  let minDepth = Infinity;
  let minAxis = null;

  for (const axis of axes) {
    const projA = projectVertices(vertsA, axis);
    const projB = projectVertices(vertsB, axis);

    const overlap = Math.min(projA.max - projB.min, projB.max - projA.min);
    if (overlap <= 0) {
      return NO_COLLISION;
    }

    if (overlap < minDepth) {
      minDepth = overlap;
      minAxis = axis;
    }
  }

  // Ensure normal points from A to B
  const ab = b.position.sub(a.position);
  if (ab.dot(minAxis) < 0) {
    minAxis = minAxis.negate();
  }

  // Contact point: find the vertex of B deepest into A
  let bestPoint = null;
  let bestProj = Infinity;
  for (const v of vertsB) {
    const proj = v.sub(a.position).dot(minAxis);
    if (proj < bestProj) {
      bestProj = proj;
      bestPoint = v;
    }
  }

  return {
    hasCollision: true,
    normal: minAxis,
    depth: minDepth,
    contactPoints: [bestPoint]
  };
}

// Closest point on line segment (p1,p2) to point p
function closestPointOnSegment(p, p1, p2) {
  const seg = p2.sub(p1);
  const lenSq = seg.lengthSq();
  if (lenSq === 0) return p1;
  let t = p.sub(p1).dot(seg) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return p1.add(seg.scale(t));
}

// Closest points between two line segments
function closestPointsSegments(a1, a2, b1, b2) {
  const d1 = a2.sub(a1);
  const d2 = b2.sub(b1);
  const r = a1.sub(b1);
  const a = d1.dot(d1);
  const e = d2.dot(d2);
  const f = d2.dot(r);

  if (a <= 1e-10 && e <= 1e-10) {
    return { pA: a1, pB: b1 };
  }
  if (a <= 1e-10) {
    const t = Math.max(0, Math.min(1, f / e));
    return { pA: a1, pB: b1.add(d2.scale(t)) };
  }
  const c = d1.dot(r);
  if (e <= 1e-10) {
    const s = Math.max(0, Math.min(1, -c / a));
    return { pA: a1.add(d1.scale(s)), pB: b1 };
  }

  const b = d1.dot(d2);
  const denom = a * e - b * b;
  let s = denom !== 0 ? Math.max(0, Math.min(1, (b * f - c * e) / denom)) : 0;
  let t = (b * s + f) / e;
  if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
  else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }

  return { pA: a1.add(d1.scale(s)), pB: b1.add(d2.scale(t)) };
}

// Circle-at-point collision helper (used by capsule pairs)
function circleAtPointVsCircleAtPoint(posA, radiusA, posB, radiusB) {
  const diff = posB.sub(posA);
  const dist = diff.length();
  const radiusSum = radiusA + radiusB;

  if (dist === 0) {
    return { hasCollision: true, normal: new Vec2(1, 0), depth: radiusSum, contactPoints: [posA] };
  }
  if (dist >= radiusSum) return NO_COLLISION;

  const normal = diff.scale(1 / dist);
  const depth = radiusSum - dist;
  const contactPoint = posA.add(normal.scale(radiusA - depth / 2));
  return { hasCollision: true, normal, depth, contactPoints: [contactPoint] };
}

function capsuleVsCircle(capsuleBody, circleBody) {
  const seg = capsuleBody.shape.getSegment(capsuleBody.position, capsuleBody.angle);
  const closest = closestPointOnSegment(circleBody.position, seg.start, seg.end);
  return circleAtPointVsCircleAtPoint(closest, capsuleBody.shape.radius, circleBody.position, circleBody.shape.radius);
}

function capsuleVsCapsule(a, b) {
  const segA = a.shape.getSegment(a.position, a.angle);
  const segB = b.shape.getSegment(b.position, b.angle);
  const { pA, pB } = closestPointsSegments(segA.start, segA.end, segB.start, segB.end);
  return circleAtPointVsCircleAtPoint(pA, a.shape.radius, pB, b.shape.radius);
}

function capsuleVsEdge(capsuleBody, edgeBody) {
  const seg = capsuleBody.shape.getSegment(capsuleBody.position, capsuleBody.angle);
  const edgeStart = edgeBody.shape.start.rotate(edgeBody.angle).add(edgeBody.position);
  const edgeEnd = edgeBody.shape.end.rotate(edgeBody.angle).add(edgeBody.position);
  const { pA, pB } = closestPointsSegments(seg.start, seg.end, edgeStart, edgeEnd);

  const diff = pA.sub(pB);
  const dist = diff.length();
  const radius = capsuleBody.shape.radius;

  if (dist >= radius) return NO_COLLISION;
  if (dist === 0) {
    const edgeVec = edgeEnd.sub(edgeStart);
    const normal = edgeVec.perp().normalize().negate();
    return { hasCollision: true, normal, depth: radius, contactPoints: [pB] };
  }

  const normal = diff.scale(-1 / dist);
  return { hasCollision: true, normal, depth: radius - dist, contactPoints: [pB] };
}

function capsuleVsPoly(capsuleBody, polyBody) {
  // Find closest point on capsule segment to polygon, then do circle-vs-polygon
  const seg = capsuleBody.shape.getSegment(capsuleBody.position, capsuleBody.angle);
  const verts = polyBody.shape.getVertices(polyBody.position, polyBody.angle);

  // Find capsule spine point closest to polygon
  let bestDist = Infinity;
  let bestCapsulePoint = seg.start;

  // Check capsule segment against each polygon edge
  for (let i = 0; i < verts.length; i++) {
    const next = (i + 1) % verts.length;
    const { pA } = closestPointsSegments(seg.start, seg.end, verts[i], verts[next]);
    const cp = closestPointOnSegment(pA, verts[i], verts[next]);
    const d = pA.sub(cp).lengthSq();
    if (d < bestDist) {
      bestDist = d;
      bestCapsulePoint = pA;
    }
  }

  // Now do circle-vs-polygon at bestCapsulePoint
  // Transform into poly local space
  const localCircle = bestCapsulePoint.sub(polyBody.position).rotate(-polyBody.angle);
  const localVerts = polyBody.shape.type === 'rectangle'
    ? (() => { const hw = polyBody.shape.width/2, hh = polyBody.shape.height/2;
        return [new Vec2(-hw,-hh), new Vec2(hw,-hh), new Vec2(hw,hh), new Vec2(-hw,hh)]; })()
    : polyBody.shape.vertices;

  const radius = capsuleBody.shape.radius;

  // Find closest point on polygon to circle center
  let minDistSq = Infinity;
  let closestPoint = null;
  for (let i = 0; i < localVerts.length; i++) {
    const next = (i + 1) % localVerts.length;
    const cp = closestPointOnSegment(localCircle, localVerts[i], localVerts[next]);
    const dSq = localCircle.sub(cp).lengthSq();
    if (dSq < minDistSq) {
      minDistSq = dSq;
      closestPoint = cp;
    }
  }

  // Check if inside polygon (use winding)
  let inside = true;
  for (let i = 0; i < localVerts.length; i++) {
    const next = (i + 1) % localVerts.length;
    const edge = localVerts[next].sub(localVerts[i]);
    const toPoint = localCircle.sub(localVerts[i]);
    if (edge.cross(toPoint) < 0) { inside = false; break; }
  }

  const diff = localCircle.sub(closestPoint);
  const distSq = diff.lengthSq();

  if (!inside && distSq >= radius * radius) return NO_COLLISION;

  let normal, depth;
  if (inside) {
    const dist = Math.sqrt(distSq);
    if (dist > 1e-10) {
      normal = diff.scale(1 / dist);
      depth = radius + dist;
    } else {
      // Find shortest axis push-out
      let minPush = Infinity;
      for (let i = 0; i < localVerts.length; i++) {
        const next = (i + 1) % localVerts.length;
        const edgeVec = localVerts[next].sub(localVerts[i]);
        const n = new Vec2(-edgeVec.y, edgeVec.x).normalize();
        const d = localCircle.sub(localVerts[i]).dot(n);
        if (Math.abs(d) < Math.abs(minPush)) { minPush = d; normal = n; }
      }
      depth = radius + Math.abs(minPush);
    }
  } else {
    const dist = Math.sqrt(distSq);
    normal = diff.scale(1 / dist);
    depth = radius - dist;
  }

  const worldNormal = normal.negate().rotate(polyBody.angle);
  const contactPoint = bestCapsulePoint.add(worldNormal.scale(radius));

  return { hasCollision: true, normal: worldNormal, depth, contactPoints: [contactPoint] };
}

function circleVsTriangle(circleBody, triBody) {
  // Reuse circleVsRectangle approach but generalized for triangle
  const localCircle = circleBody.position.sub(triBody.position).rotate(-triBody.angle);
  const verts = triBody.shape.vertices;
  const radius = circleBody.shape.radius;

  // Find closest point on triangle to circle center
  let minDistSq = Infinity;
  let closestPoint = null;
  for (let i = 0; i < 3; i++) {
    const next = (i + 1) % 3;
    const cp = closestPointOnSegment(localCircle, verts[i], verts[next]);
    const dSq = localCircle.sub(cp).lengthSq();
    if (dSq < minDistSq) {
      minDistSq = dSq;
      closestPoint = cp;
    }
  }

  // Check if inside triangle (cross product winding test)
  let inside = true;
  for (let i = 0; i < 3; i++) {
    const next = (i + 1) % 3;
    const edge = verts[next].sub(verts[i]);
    const toPoint = localCircle.sub(verts[i]);
    if (edge.cross(toPoint) < 0) { inside = false; break; }
  }

  const diff = localCircle.sub(closestPoint);
  const distSq = diff.lengthSq();

  if (!inside && distSq >= radius * radius) return NO_COLLISION;

  let normal, depth;
  if (inside) {
    const dist = Math.sqrt(distSq);
    if (dist > 1e-10) {
      normal = diff.scale(1 / dist);
    } else {
      normal = new Vec2(0, -1); // fallback
    }
    depth = radius + dist;
  } else {
    const dist = Math.sqrt(distSq);
    normal = diff.scale(1 / dist);
    depth = radius - dist;
  }

  const worldNormal = normal.negate().rotate(triBody.angle);
  const contactPoint = circleBody.position.add(worldNormal.scale(radius));

  return { hasCollision: true, normal: worldNormal, depth, contactPoints: [contactPoint] };
}

function polyVsEdge(polyBody, edgeBody) {
  const edgeStart = edgeBody.shape.start.rotate(edgeBody.angle).add(edgeBody.position);
  const edgeEnd = edgeBody.shape.end.rotate(edgeBody.angle).add(edgeBody.position);
  const edgeVec = edgeEnd.sub(edgeStart);
  const edgeLen = edgeVec.length();
  const edgeDir = edgeVec.scale(1 / edgeLen);
  const edgeNormal = edgeDir.perp();

  const verts = polyBody.shape.getVertices(polyBody.position, polyBody.angle);

  let maxBelowDist = -Infinity;
  let penetratingVert = null;
  let hasVertexAbove = false;
  let hasVertexBelow = false;

  for (const v of verts) {
    const toVert = v.sub(edgeStart);
    const along = toVert.dot(edgeDir);

    if (along < 0 || along > edgeLen) continue;

    const dist = toVert.dot(edgeNormal);

    if (dist < 0) {
      hasVertexAbove = true;
    } else {
      hasVertexBelow = true;
      if (dist >= maxBelowDist) {
        maxBelowDist = dist;
        penetratingVert = v;
      }
    }
  }

  if (!hasVertexAbove && !hasVertexBelow) {
    // Fallback: check edge endpoints inside polygon using winding test
    const localVerts = polyBody.shape.type === 'rectangle'
      ? (() => { const hw = polyBody.shape.width/2, hh = polyBody.shape.height/2;
          return [new Vec2(-hw,-hh), new Vec2(hw,-hh), new Vec2(hw,hh), new Vec2(-hw,hh)]; })()
      : polyBody.shape.vertices;

    for (const endpoint of [edgeStart, edgeEnd]) {
      const local = endpoint.sub(polyBody.position).rotate(-polyBody.angle);
      // Check if point is inside polygon
      let insidePoly = true;
      for (let i = 0; i < localVerts.length; i++) {
        const next = (i + 1) % localVerts.length;
        const edge = localVerts[next].sub(localVerts[i]);
        const toPoint = local.sub(localVerts[i]);
        if (edge.cross(toPoint) < 0) { insidePoly = false; break; }
      }
      if (insidePoly) {
        // Find shortest push-out distance
        let minPush = Infinity;
        let bestNormal = null;
        for (let i = 0; i < localVerts.length; i++) {
          const next = (i + 1) % localVerts.length;
          const edgeV = localVerts[next].sub(localVerts[i]);
          const n = new Vec2(-edgeV.y, edgeV.x).normalize();
          const d = local.sub(localVerts[i]).dot(n);
          if (d < minPush) { minPush = d; bestNormal = n; }
        }
        const normal = bestNormal.rotate(polyBody.angle);
        return { hasCollision: true, normal, depth: minPush, contactPoints: [endpoint] };
      }
    }
    return NO_COLLISION;
  }

  if (!hasVertexBelow) return NO_COLLISION;

  return {
    hasCollision: true,
    normal: edgeNormal,
    depth: maxBelowDist,
    contactPoints: [penetratingVert]
  };
}

// Zero-allocation collision resolution using inline math
export function resolveCollision(a, b, contact) {
  if (!contact.hasCollision) return;

  const nx = contact.normal.x;
  const ny = contact.normal.y;

  for (const cp of contact.contactPoints) {
    // r vectors (contact point - body position)
    const rAx = cp.x - a.position.x;
    const rAy = cp.y - a.position.y;
    const rBx = cp.x - b.position.x;
    const rBy = cp.y - b.position.y;

    // Relative velocity at contact point
    const relVelX = (a.velocity.x + -a.angularVelocity * rAy) - (b.velocity.x + -b.angularVelocity * rBy);
    const relVelY = (a.velocity.y + a.angularVelocity * rAx) - (b.velocity.y + b.angularVelocity * rBx);

    const relVelAlongNormal = relVelX * nx + relVelY * ny;

    if (relVelAlongNormal < 0) return;

    const restitutionThreshold = 1.0;
    const e = relVelAlongNormal > restitutionThreshold
      ? Math.max(a.restitution, b.restitution)
      : 0;

    const rACrossN = rAx * ny - rAy * nx;
    const rBCrossN = rBx * ny - rBy * nx;
    const invMassSum = a.inverseMass + b.inverseMass
      + rACrossN * rACrossN * a.inverseInertia
      + rBCrossN * rBCrossN * b.inverseInertia;

    const j = -(1 + e) * relVelAlongNormal / invMassSum;

    // Apply normal impulse (inline, no Vec2 allocation)
    const impX = nx * j;
    const impY = ny * j;
    a.velocity.x += impX * a.inverseMass;
    a.velocity.y += impY * a.inverseMass;
    b.velocity.x -= impX * b.inverseMass;
    b.velocity.y -= impY * b.inverseMass;
    a.angularVelocity += a.inverseInertia * (rAx * impY - rAy * impX);
    b.angularVelocity -= b.inverseInertia * (rBx * impY - rBy * impX);

    // Friction impulse
    const tanX = relVelX - nx * relVelAlongNormal;
    const tanY = relVelY - ny * relVelAlongNormal;
    const tanLen = Math.sqrt(tanX * tanX + tanY * tanY);
    if (tanLen > 1e-10) {
      const tx = tanX / tanLen;
      const ty = tanY / tanLen;
      const rACrossT = rAx * ty - rAy * tx;
      const rBCrossT = rBx * ty - rBy * tx;
      const tanInvMassSum = a.inverseMass + b.inverseMass
        + rACrossT * rACrossT * a.inverseInertia
        + rBCrossT * rBCrossT * b.inverseInertia;

      let jt = -(relVelX * tx + relVelY * ty) / tanInvMassSum;

      const mu = Math.sqrt(a.friction * b.friction);
      const maxFriction = Math.abs(j) * mu;
      if (jt > maxFriction) jt = maxFriction;
      else if (jt < -maxFriction) jt = -maxFriction;

      const fImpX = tx * jt;
      const fImpY = ty * jt;
      a.velocity.x += fImpX * a.inverseMass;
      a.velocity.y += fImpY * a.inverseMass;
      b.velocity.x -= fImpX * b.inverseMass;
      b.velocity.y -= fImpY * b.inverseMass;
      a.angularVelocity += a.inverseInertia * (rAx * fImpY - rAy * fImpX);
      b.angularVelocity -= b.inverseInertia * (rBx * fImpY - rBy * fImpX);
    }
  }

  // Positional correction (Baumgarte stabilization, inline)
  const correctionMag = Math.max(contact.depth - 0.01, 0) / (a.inverseMass + b.inverseMass) * 0.4;
  const cx = nx * correctionMag;
  const cy = ny * correctionMag;
  if (!a.isStatic) {
    a.position.x -= cx * a.inverseMass;
    a.position.y -= cy * a.inverseMass;
  }
  if (!b.isStatic) {
    b.position.x += cx * b.inverseMass;
    b.position.y += cy * b.inverseMass;
  }
}

function isPolyType(type) {
  return type === 'rectangle' || type === 'triangle';
}

function swapped(fn, a, b) {
  const result = fn(b, a);
  if (result.hasCollision) result.normal = result.normal.negate();
  return result;
}

export function detectCollision(a, b) {
  const tA = a.shape.type;
  const tB = b.shape.type;

  // Circle vs Circle
  if (tA === 'circle' && tB === 'circle') return circleVsCircle(a, b);

  // Circle vs Edge
  if (tA === 'circle' && tB === 'edge') return circleVsEdge(a, b);
  if (tA === 'edge' && tB === 'circle') return swapped(circleVsEdge, a, b);

  // Circle vs Polygon (Rectangle or Triangle)
  if (tA === 'circle' && tB === 'rectangle') return circleVsRectangle(a, b);
  if (tA === 'rectangle' && tB === 'circle') return swapped(circleVsRectangle, a, b);
  if (tA === 'circle' && tB === 'triangle') return circleVsTriangle(a, b);
  if (tA === 'triangle' && tB === 'circle') return swapped(circleVsTriangle, a, b);

  // Polygon vs Polygon (Rectangle/Triangle in any combination)
  if (isPolyType(tA) && isPolyType(tB)) return polyVsPoly(a, b);

  // Polygon vs Edge
  if (isPolyType(tA) && tB === 'edge') return polyVsEdge(a, b);
  if (tA === 'edge' && isPolyType(tB)) return swapped(polyVsEdge, a, b);

  // Capsule vs Circle
  if (tA === 'capsule' && tB === 'circle') return capsuleVsCircle(a, b);
  if (tA === 'circle' && tB === 'capsule') return swapped(capsuleVsCircle, a, b);

  // Capsule vs Capsule
  if (tA === 'capsule' && tB === 'capsule') return capsuleVsCapsule(a, b);

  // Capsule vs Edge
  if (tA === 'capsule' && tB === 'edge') return capsuleVsEdge(a, b);
  if (tA === 'edge' && tB === 'capsule') return swapped(capsuleVsEdge, a, b);

  // Capsule vs Polygon
  if (tA === 'capsule' && isPolyType(tB)) return capsuleVsPoly(a, b);
  if (isPolyType(tA) && tB === 'capsule') return swapped(capsuleVsPoly, a, b);

  // Edge vs Edge — no-op
  if (tA === 'edge' && tB === 'edge') return NO_COLLISION;

  return NO_COLLISION;
}
