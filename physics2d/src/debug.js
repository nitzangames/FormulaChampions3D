export function drawDebugBody(ctx, body) {
  ctx.save();
  ctx.translate(body.renderPosition.x, body.renderPosition.y);
  ctx.rotate(body.renderAngle);

  ctx.strokeStyle = body.isSensor ? '#0af' : body.isSleeping ? '#555' : body.isStatic ? '#888' : '#0f0';
  ctx.lineWidth = 3;
  if (body.isSensor) ctx.setLineDash([4, 4]);

  const shape = body.shape;

  if (shape.type === 'circle') {
    ctx.beginPath();
    ctx.arc(0, 0, shape.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(shape.radius, 0);
    ctx.stroke();
  } else if (shape.type === 'rectangle') {
    const hw = shape.width / 2;
    const hh = shape.height / 2;
    ctx.strokeRect(-hw, -hh, shape.width, shape.height);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(hw, 0);
    ctx.stroke();
  } else if (shape.type === 'triangle') {
    const v = shape.vertices;
    ctx.beginPath();
    ctx.moveTo(v[0].x, v[0].y);
    ctx.lineTo(v[1].x, v[1].y);
    ctx.lineTo(v[2].x, v[2].y);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(v[0].x, v[0].y);
    ctx.stroke();
  } else if (shape.type === 'capsule') {
    const hl = shape.length / 2;
    const r = shape.radius;
    ctx.beginPath();
    ctx.arc(-hl, 0, r, Math.PI / 2, -Math.PI / 2);
    ctx.lineTo(hl, -r);
    ctx.arc(hl, 0, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(-hl, r);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(hl + r, 0);
    ctx.stroke();
  } else if (shape.type === 'edge') {
    ctx.beginPath();
    ctx.moveTo(shape.start.x, shape.start.y);
    ctx.lineTo(shape.end.x, shape.end.y);
    ctx.stroke();
  }

  if (body.isSensor) ctx.setLineDash([]);
  ctx.restore();
}

export function drawDebugWorld(ctx, world) {
  const opts = world.debug;

  for (const body of world.bodies) {
    drawDebugBody(ctx, body);

    if (opts.drawAABBs) {
      const aabb = body.getAABB();
      ctx.strokeStyle = '#ff04';
      ctx.lineWidth = 3;
      ctx.strokeRect(aabb.min.x, aabb.min.y, aabb.max.x - aabb.min.x, aabb.max.y - aabb.min.y);
    }

    if (opts.drawVelocities && !body.isStatic && !body.isSleeping) {
      const s = 0.1; // scale factor
      ctx.strokeStyle = '#f80';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(body.renderPosition.x, body.renderPosition.y);
      ctx.lineTo(
        body.renderPosition.x + body.velocity.x * s,
        body.renderPosition.y + body.velocity.y * s
      );
      ctx.stroke();
    }
  }
}
