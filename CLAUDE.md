# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project

**Mini GT 3D** — a 3D arcade GT racing game. 4 cars (player + 3 AI), 3 laps, across 10 tracks grouped into 5 difficulty buckets. Built with Three.js for 3D rendering on top of a 2D physics simulation using the Physics2D engine. Forked from MiniGT (2D version). Target platform: play.nitzan.games.

## Development

- `node dev-server.js` — starts dev server on port 8084
- `node check-errors.js` — runs headless Chrome to check for JS errors
- No build step or package manager required. ES modules throughout.
- Three.js loaded from CDN via script tag.

## Architecture

2D game simulation is the source of truth. Three.js renderer is a pure view layer.

### Key Files
- `js/main.js` — entry point, game loop, state coordination
- `js/constants.js` — all tuning values including `VERSION`
- `js/renderer3d.js` — Three.js scene setup, lighting, per-frame render
- `js/camera3d.js` — chase cam behind player car
- `js/track-builder.js` — converts 2D tile data into 3D geometry
- `js/car-models.js` — 6 procedural low-poly 3D car builders
- `js/effects3d.js` — particles, skidmarks, sparks, speed lines
- `js/scenery.js` — trees and environment objects
- `js/car.js` — 2D car physics (from MiniGT)
- `js/ai-controller.js` — ray-cast AI (from MiniGT)
- `js/race.js` — lap counting, ranking (from MiniGT)
- `js/track.js` — tile-based track generation (from MiniGT)
- `js/input.js` — drag-to-steer pointer handling
- `js/audio.js` — procedural SFX + haptics
- `js/game.js` — state machine
- `js/currency.js` — gold/unlock system
- `physics2d/` — physics engine

### Race flow
title → carselect → trackselect → countdown → racing → finished

### Coordinate mapping
2D simulation uses pixel coordinates (TILE=512px grid). 3D world uses:
- x3d = x2d * PX_TO_WORLD
- z3d = y2d * PX_TO_WORLD (2D Y maps to 3D Z)
- y3d = 0 (flat ground)
- rotation: car3d.rotation.y = -(car2d.angle)
