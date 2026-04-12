# MiniGT 3D — Design Spec

## Overview

A 3D arcade GT racing game for play.nitzan.games. Fork of MiniGT with the same 2D physics, AI, and race logic, but rendered in 3D with a low chase camera. The 2D simulation is the source of truth; the 3D layer is a pure view.

- **Players:** 1 human + 3 AI
- **Race format:** 3 laps per race
- **Tracks:** New set of procedurally generated tile-based tracks (same generation system as MiniGT, new seeds tuned for 3D chase cam). Start with 10 tracks in 5 difficulty buckets of 2, expand later.
- **Visual style:** Low-poly / stylized — flat colors, geometric shapes, no external textures
- **Rendering:** Three.js (loaded from CDN, no build step)
- **UI:** HTML/CSS overlay on top of the Three.js canvas
- **Platform:** play.nitzan.games — 1080x1920 portrait, sandboxed iframe

## Architecture

The 2D game simulation is the source of truth. The 3D renderer is a pure view layer that reads state and draws.

### Kept from MiniGT (largely unchanged)
- `js/car.js` — 2D capsule-based car physics (acceleration, steering, wall collision)
- `js/ai-controller.js` — ray-cast wall-avoidance AI with rubber-banding
- `js/race.js` — lap counting, per-car progress, ranking, race-end detection
- `js/track.js` — tile-based closed-loop track generation + centerline
- `js/input.js` — drag-to-steer pointer handling (adapted for 3D context)
- `js/audio.js` — procedural SFX + haptics
- `js/game.js` — state machine (title → carselect → trackselect → countdown → racing → finished)
- `js/constants.js` — tuning values (new track seeds, wider roads, VERSION)
- `physics2d/` — physics engine as-is

### New modules
- `js/renderer3d.js` — Three.js scene setup, per-frame render, lighting
- `js/camera3d.js` — chase cam behind player car
- `js/track-builder.js` — converts 2D tile data + centerline into 3D geometry
- `js/car-models.js` — procedural low-poly 3D car geometry for all 6 styles
- `js/effects3d.js` — tire smoke, skidmarks, sparks, speed lines, screen shake
- `js/scenery.js` — trees and environment objects (extensible for future additions)

### Replaced
- `js/renderer.js` → `js/renderer3d.js` (2D canvas rendering replaced entirely)
- `js/camera.js` → `js/camera3d.js` (top-down rotating cam replaced with chase cam)
- `js/effects.js` → `js/effects3d.js` (2D effects replaced with 3D particles)
- `js/skidmarks.js` — folded into `js/effects3d.js`
- `js/car-styles.js` → `js/car-models.js` (2D sprite styles replaced with 3D geometry)

### Added
- `index.html` — restructured with Three.js canvas + HTML UI overlay
- `css/ui.css` — all menu and HUD styling

## 3D Track Building

The track builder takes the 2D tile grid and centerline from `track.js` and generates 3D geometry.

**Road surface:**
- Walk the centerline points; at each point generate a cross-section (flat quad perpendicular to the track direction)
- Stitch quads together into a continuous road mesh
- Road width wider than MiniGT 2D (tunable constant) to look good from chase cam
- Single dark grey `MeshLambertMaterial`
- White dashed center line as a thin strip slightly above the road surface

**Walls/barriers:**
- Red/white alternating box meshes along both track edges at each centerline point
- ~0.5 units tall, sitting on the road edge
- Spacing and size tuned for readability from chase cam

**Curbs:**
- On curves, red/white striped curb geometry along inside/outside of turns
- Simple extruded quads with alternating color

**Start/finish line:**
- Checkered pattern on the road surface at the start tile

**Ground plane:**
- Large flat green plane underneath everything
- Extends far enough that the camera never sees the edge

**Performance:**
- All track geometry built once on track load
- Merged into minimal mesh count (one for road, one for walls, one for curbs)
- No per-frame geometry updates

## Car Models

6 distinct low-poly car styles, all built procedurally from Three.js box/cylinder geometry — no external model files.

| Style | Distinguishing features |
|-------|------------------------|
| GT3 Classic | Smooth proportions, modest rear spoiler, round-ish fenders |
| Muscle GT | Wide body, aggressive hood scoop, low profile |
| Rally GT | Roof scoop, slightly taller ride height, wider wheel arches |
| LMP | Long and flat, large rear wing, closed cockpit |
| JDM Street | Compact body, subtle rear lip spoiler, lower stance |
| Retro GT | Rounded nose, elongated hood, classic proportions |

**Construction:**
- Each style is a function returning a `THREE.Group` with ~15-25 meshes
- Body color passed as parameter; each of the 4 cars gets a distinct color
- Built once at car-select time, reused during race
- Wheels are separate child objects for spin animation

**Per-frame updates:**
- Map 2D position/rotation to 3D: `car3d.position.x = car2d.x`, `car3d.position.z = car2d.y`, `car3d.rotation.y = -car2d.angle`
- All cars stay at y = 0 (no suspension)
- Wheel spin speed based on car velocity
- Slight cosmetic body roll on turns (~2-3 degrees based on steering)

## Chase Camera

- Positioned ~5 units behind, ~3 units above the player car
- FOV ~60 degrees (good for portrait aspect ratio)
- Rotation follows car heading with smooth lerp (~0.05-0.08 per frame)
- Look-at target slightly ahead of car in forward direction
- Speed effect: FOV widens slightly at high speed
- Crash shake: camera position offset that decays over ~0.3 seconds
- Single chase cam mode only, no switching

## Effects

**Tire smoke:** White/grey billboard particles behind rear wheels on hard braking/turns. Pool of ~20-30 particles, fade + scale over ~0.5s.

**Skidmarks:** Flat dark quads on road surface behind wheels during hard cornering. Capped at ~200 segments, oldest fade out.

**Crash sparks:** Orange particles at collision point on wall impact. Pool of ~10, short lifetime.

**Speed lines:** Faint white streaks flying past camera edges at high speed. Thin stretched quads.

**Screen shake:** Camera offset on crash, decays over ~0.3s.

**Not included (keep minimal):**
- No dynamic car shadows (sun shadow on ground plane only)
- No weather effects
- No headlights/taillights (can be added later)

## UI / HUD

All HTML/CSS overlaid on the Three.js canvas. State machine flow unchanged.

**Title screen:** Game title "MiniGT 3D", "RACE" button, 3D scene visible behind, version string bottom-center, audio/haptics toggle.

**Car select:** 6 car styles as clickable cards, selected car rotates in 3D scene behind UI.

**Track select:** Grid of track thumbnails (minimap-style), difficulty indicators, gold reward display.

**Racing HUD:**
- Top-left: Lap counter (LAP 1/3)
- Top-center: Race timer + best lap
- Top-right: Pause button
- Below top: Position (POS 1/4)
- Bottom-right: Speedometer (km/h) + minimap
- Semi-transparent backgrounds for readability

**Countdown:** 3-2-1-GO, large centered text with CSS animations.

**Finished:** Results overlay with position, time, best lap, gold earned, Next Race / Menu buttons.

**Pause:** Semi-transparent overlay, Resume / Quit buttons.

**Steering input:** Same drag-to-steer as MiniGT — horizontal pointer drag controls steering. Works identically regardless of 2D vs 3D rendering.

## Project Structure

```
MiniGT3D/
├── index.html
├── css/
│   └── ui.css
├── js/
│   ├── main.js          (forked from MiniGT)
│   ├── constants.js     (forked, new seeds + VERSION)
│   ├── game.js          (forked)
│   ├── car.js           (from MiniGT)
│   ├── ai-controller.js (from MiniGT)
│   ├── race.js          (from MiniGT)
│   ├── track.js         (from MiniGT)
│   ├── input.js         (adapted)
│   ├── audio.js         (from MiniGT)
│   ├── renderer3d.js    (new)
│   ├── camera3d.js      (new)
│   ├── track-builder.js (new)
│   ├── car-models.js    (new)
│   ├── effects3d.js     (new)
│   └── scenery.js       (new)
├── physics2d/           (from MiniGT)
├── meta.json
├── thumbnail.png
├── dev-server.js
├── check-errors.js
├── screenshot.js
├── .zipignore
└── CLAUDE.md
```

## Platform Integration

- Three.js loaded from CDN via `<script>` tag — no bundler
- 1080x1920 portrait canvas, CSS `object-fit: contain`
- `meta.json`: slug `"mini-gt-3d"`, title, description, tags
- `thumbnail.png`: 1024x1024 with "MiniGT 3D" text rendered in
- `.zipignore` for clean deploys
- Dev server on port 8084
- ES modules throughout
