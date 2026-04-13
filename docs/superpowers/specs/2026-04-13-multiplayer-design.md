# Multiplayer (v1) — Realtime Racing

## Goal

Up to 4 players race the same track in realtime using the existing PlaySDK
multiplayer relay. Players see each other's cars on track and can collide
with them (locally-authoritative collisions, no server arbitration).

## Out of scope (v1)

- AI filling empty human slots. Only humans in the room race.
- Reconnection of dropped players mid-race — if host drops, race ends.
- Rollback netcode / deterministic lockstep. Each client simulates its own
  car; remote cars are visual + kinematic ghosts driven by snapshots.

## UX flow

1. Main menu gains a **MULTIPLAYER** button (third option, below QUICK RACE).
2. Click → `PlaySDK.multiplayer.showLobby({ maxPlayers: 4, onStart, onCancel })`.
   This is the built-in SDK overlay — create/join/quick-match/list all handled.
3. **Host clicks Start in the SDK lobby** → `onStart` fires → SDK overlay hides.
4. New screen `#screen-mphostpick` appears (host only). Non-host sees
   `#screen-mpwaiting` ("Waiting for host to choose track...").
5. Host picks class (tier 0–4) and track (one of 10 seeds). Host clicks
   CONFIRM → broadcasts `race-config`, then 500ms later broadcasts `race-start`
   with a `startAt` timestamp ~1000ms in the future.
6. All clients show the countdown, then race normally.
7. On local finish, client sends `race-finish { finishTime, bestLap }`. Host
   (or any client) aggregates times and shows a shared `#screen-mpresults`
   once everyone has finished or after a 30s grace timeout.
8. Results screen shows final standings + two buttons:
   - **Host-only: NEXT RACE** → returns host to the track+class picker
     (`#screen-mphostpick`). Same room, same players. Host picks, broadcasts
     new `race-config` + `race-start`, everyone races again.
   - **All players: LEAVE** → leaves the room, returns to title.
   Non-host sees "Waiting for host to pick next track..." instead of
   NEXT RACE.

## Network protocol

All payloads sent via `room.send(payload)`. Types:

| type           | from       | payload                                                         |
| -------------- | ---------- | --------------------------------------------------------------- |
| `race-config`  | host       | `{ seed, tierIdx }`                                             |
| `race-start`   | host       | `{ startAt }` (wall-clock ms, Date.now())                       |
| `car-state`    | every      | `{ t, x, y, angle, speed, steering, lap, wp }` at **20 Hz**    |
| `race-finish`  | every      | `{ finishTime, bestLap }` once                                  |

**Clock offset** — each player computes `offset = serverNow - Date.now()` by
having the host also include `now` in `race-start`; the non-host sets
`offset = race-start.now - Date.now()` to align countdowns. For v1 we trust
the host's clock directly (no round-trip measurement); small drift is OK.

## Sync architecture

**Local car (yours)**
- Normal physics as today. No change in input handling.
- Broadcast `car-state` at 20 Hz from `fixedUpdate`.

**Remote cars (other humans)**
- Kinematic body in the local `physics2d` world. Teleported each render frame
  to an interpolated position (render-interpolation between the last two
  received snapshots, with ~100ms delay buffer so we always interpolate
  between known points, never extrapolate).
- Your car's dynamic body collides with their kinematic body → you bounce,
  they don't react in your world. Their own client independently decides if
  they bounced and sends new snapshots accordingly.
- Lap/waypoint fields in the snapshot are authoritative for the remote car's
  lap count on your screen (so HUD/results reflect what they see).

**Start synchronization**
- Host sets `startAt = Date.now() + 1000`, broadcasts `race-start`.
- All clients (including host) schedule the race's first physics tick at
  `startAt`. Late-arriving joiners are not a v1 concern (lobby closes first).

**Lap counting**
- Each client counts laps for its own car (existing logic).
- Remote lap count comes from `car-state.lap` — trust the sender.

**Finish**
- First time your own `laps >= NUM_LAPS`, send `race-finish` once.
- A finish-results aggregator on each client collects finishes from all
  `room.players`. When all players have a finish OR 30s after the first
  player finishes, show `#screen-mpresults`.

## File-level changes

| File               | Change                                                        |
| ------------------ | ------------------------------------------------------------- |
| `index.html`       | Add `<script src="https://cdn-play.nitzan.games/lib/play-sdk.js">` (loaded from CDN). Add `MULTIPLAYER` button to `#screen-title`. New screens: `#screen-mphostpick`, `#screen-mpwaiting`, `#screen-mpresults`. |
| `js/main.js`       | Wire MULTIPLAYER button. New `startMultiplayerRace({seed, tierIdx, startAt})` path alongside `startNextRace`/`startQuickRace`. New `raceMode = 'multiplayer'`. Hook into `fixedUpdate` to broadcast car-state, apply remote snapshots. |
| `js/multiplayer.js`| **New.** All MP glue: lobby flow, config broadcast, start sync, snapshot send/recv, remote car manager (creates kinematic bodies, interpolates), finish aggregator. Exposes `mp.init()`, `mp.start()`, `mp.tick()`, `mp.dispose()`. |
| `js/car.js`        | Add `kinematic` flag. Kinematic cars skip player physics integration — their body position is set directly each frame. |
| `js/renderer3d.js` | No change — it already renders from `car.x/y/angle`. |
| `css/ui.css`       | Minor: styles for new MP screens matching existing look. |

`js/main.js` stays the single game-loop owner. `js/multiplayer.js` is a
side-module it calls into from key lifecycle points (race start, fixed
update, race finish, dispose).

## Dev/test approach

- Two browser tabs pointing at `localhost:8084` with the `play_token` URL
  param can't easily be simulated. Use `play.nitzan.games` after deploy for
  end-to-end test — or add a dev-mode token bypass, out of scope for v1.
- Local smoke test: MULTIPLAYER button opens the SDK lobby overlay without
  errors; cancel returns to title cleanly.

## Post-race loop

- `mpresults` screen keeps the room connection alive. Nothing is disposed.
- When host clicks NEXT RACE: broadcasts nothing, navigates locally to
  `#screen-mphostpick`. Non-host clients receive *nothing new* yet — they
  stay on `mpresults` but the copy swaps to "Waiting for host to pick next
  track...". This is purely a client-side UI state based on receiving no
  `race-config` yet after the previous race ended.
- Host's next `race-config` + `race-start` restarts the race flow for
  everyone identically to the first race.
- Players who drop during results → they leave the room, their slot frees
  up. When the next race starts, they simply aren't in the `room.players`
  list so they don't race.

## Known v1 limitations

- Non-colliding visual mismatch for ~50-100ms after contact as snapshots catch up.
- Remote cars can briefly interpenetrate during mutual collisions (both sides'
  ghosts don't react in the other's local physics).
- Host-clock-only sync — ~small countdown drift if host clock is skewed.
- If host drops mid-race, race ends (SDK promotes new host but we don't
  migrate race state).
