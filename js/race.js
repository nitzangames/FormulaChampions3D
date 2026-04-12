/**
 * Race module — pure functions over car + track data.
 *
 * No rendering, no audio, no DOM. All inputs are plain objects; all
 * outputs are numbers, arrays, or plain objects. Designed to be unit-
 * testable without a running game.
 */

/**
 * Given a centerLine (array of {x,y}), compute cumulative arc lengths
 * and the total closed-loop length.
 *
 * Returns { lengths, total } where:
 *   lengths[i] = distance from centerLine[0] to centerLine[i]
 *                (measured along the polyline, not Euclidean)
 *   total      = lengths[N-1] + distance(centerLine[N-1], centerLine[0])
 *
 * The "+ closing segment" in `total` is what makes this a closed loop.
 */
export function computeCenterLineLengths(centerLine) {
  const n = centerLine.length;
  const lengths = new Array(n);
  lengths[0] = 0;
  let running = 0;
  for (let i = 1; i < n; i++) {
    const dx = centerLine[i].x - centerLine[i - 1].x;
    const dy = centerLine[i].y - centerLine[i - 1].y;
    running += Math.sqrt(dx * dx + dy * dy);
    lengths[i] = running;
  }
  const lastDx = centerLine[0].x - centerLine[n - 1].x;
  const lastDy = centerLine[0].y - centerLine[n - 1].y;
  const total = running + Math.sqrt(lastDx * lastDx + lastDy * lastDy);
  return { lengths, total };
}

/**
 * Progress metric for a car: how far through the race, in pixels.
 *
 *   progress = lapsCompleted * trackLength
 *            + lengths[currentWaypointIdx]
 *            + fractional distance from that waypoint toward the next
 */
export function computeProgress(carPos, currentWaypointIdx, centerLine, cl, lapsCompleted) {
  const n = centerLine.length;
  const here = centerLine[currentWaypointIdx];
  const next = centerLine[(currentWaypointIdx + 1) % n];
  const segDx = next.x - here.x;
  const segDy = next.y - here.y;
  const segLen2 = segDx * segDx + segDy * segDy;
  const px = carPos.x - here.x;
  const py = carPos.y - here.y;
  let t = segLen2 > 0 ? (px * segDx + py * segDy) / segLen2 : 0;
  if (t < 0) t = 0;
  if (t > 1) t = 1;
  const segLen = Math.sqrt(segLen2);
  return lapsCompleted * cl.total + cl.lengths[currentWaypointIdx] + t * segLen;
}

/**
 * Race — mutable state over an array of cars and a centerLine.
 *
 * Call `race.update(nowMs)` once per physics tick. It:
 *   1. Detects waypoint advancement for each car (by caller-advanced
 *      currentWaypointIdx; we only react to changes).
 *   2. Sets halfwayReached once a car has reached idx >= N/2 on the
 *      current lap.
 *   3. Increments lapsCompleted when currentWaypointIdx wraps (prev
 *      was near end, new is near 0) AND halfwayReached is true.
 *   4. Tracks currentLapStartMs and updates bestLap on lap completion.
 *
 * The per-car fields read/written:
 *   physX, physY
 *   currentWaypointIdx          (set by caller — AI controller or main)
 *   lapsCompleted               (Race owns)
 *   halfwayReached              (Race owns)
 *   bestLap                     (Race owns)
 *   currentLapStartMs           (Race owns)
 */
export class Race {
  /**
   * @param {Array} cars
   * @param {Array<{x,y}>} centerLine
   * @param {number} [finishLineIdx=0] — waypoint index corresponding to the
   *   physical finish line. Lap completion is detected when a car's
   *   waypoint index wraps "through" this value. For the Mini GT track
   *   layout [grid, start, ...rest], pass 2 (exit of the start tile,
   *   just past the painted checkered line). Default 0 preserves the old
   *   "wrap at index 0" behaviour used by unit tests.
   */
  constructor(cars, centerLine, finishLineIdx = 0) {
    this.cars = cars;
    this.centerLine = centerLine;
    this.cl = computeCenterLineLengths(centerLine);
    this.finishLineIdx = finishLineIdx;
    // Stash the raw previous waypoint index per car; shift-to-"finish
    // line = 0" happens each tick inside update().
    this._prevRawIdx = cars.map(c => c.currentWaypointIdx ?? 0);
  }

  update(nowMs) {
    const n = this.centerLine.length;
    const finishIdx = this.finishLineIdx;
    const halfwayThreshold     = Math.floor(n / 2);
    const quarterThreshold     = Math.floor(n / 4);
    const threeQuarterThreshold = Math.floor(3 * n / 4);

    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i];
      const rawIdx = car.currentWaypointIdx ?? 0;
      const prevRaw = this._prevRawIdx[i];

      // Shifted idx: 0 = finish line, n-1 = just before finish line.
      const shifted    = ((rawIdx   - finishIdx) % n + n) % n;
      const prevShifted = ((prevRaw  - finishIdx) % n + n) % n;

      // Track "has the car been in the lower quarter of the current lap
      // (just past the finish line)". Necessary because the spawn
      // position is BEFORE the finish line, which in shifted coords
      // falls in the upper portion — without this gate, halfwayReached
      // would be set immediately on tick 1 and the first finish-line
      // crossing (which is the car leaving the grid, NOT completing a
      // lap) would count as lap 1.
      if (shifted < quarterThreshold) {
        car.seenLowerQuarter = true;
      }

      // Only set halfwayReached once the car has ACTUALLY been in the
      // lower quarter this lap AND is now past the halfway point.
      if (car.seenLowerQuarter && shifted >= halfwayThreshold) {
        car.halfwayReached = true;
      }

      // Forward crossing of the finish line: shifted idx transitions
      // from the upper quarter (just before the finish line) to the
      // lower quarter (just past it).
      const crossedForward = prevShifted >= threeQuarterThreshold && shifted < quarterThreshold;
      if (crossedForward && car.halfwayReached) {
        const lapTime = nowMs - (car.currentLapStartMs ?? 0);
        if (car.bestLap === null || car.bestLap === undefined || lapTime < car.bestLap) {
          car.bestLap = lapTime;
        }
        car.lapsCompleted = (car.lapsCompleted ?? 0) + 1;
        car.halfwayReached = false;
        // Do NOT reset seenLowerQuarter — it's a one-time "this car has
        // at least crossed the finish line once" latch. Resetting would
        // break lap 2+ if the car's idx jumps past the lower quarter
        // between ticks (as happens in the unit tests).
        car.currentLapStartMs = nowMs;
      }

      this._prevRawIdx[i] = rawIdx;
    }
  }
}

/**
 * Advance a car's currentWaypointIdx if the car is closer to the next
 * waypoint than the current one. O(1) per call. Returns the new index.
 *
 * For severely off-line cars, callers should fall back to a bounded
 * scan. This helper intentionally stays O(1) for the common case.
 */
export function advanceWaypoint(car, currentIdx, centerLine) {
  const n = centerLine.length;
  const here = centerLine[currentIdx];
  const next = centerLine[(currentIdx + 1) % n];
  const dxH = car.physX - here.x;
  const dyH = car.physY - here.y;
  const dxN = car.physX - next.x;
  const dyN = car.physY - next.y;
  const dH2 = dxH * dxH + dyH * dyH;
  const dN2 = dxN * dxN + dyN * dyN;
  return dN2 < dH2 ? (currentIdx + 1) % n : currentIdx;
}

/**
 * Rank an array of cars by progress (highest first). Returns an array
 * of { idx, position, progress } objects, where position is 1..N.
 */
export function rankStandings(cars, progressFn) {
  const rows = cars.map((c, i) => ({ idx: i, progress: progressFn(c) }));
  rows.sort((a, b) => b.progress - a.progress);
  return rows.map((r, pos) => ({ idx: r.idx, position: pos + 1, progress: r.progress }));
}
