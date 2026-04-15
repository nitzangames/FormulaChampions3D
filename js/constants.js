// Identity
export const VERSION = 'v0.4.2';

// Display
export const GAME_W = 1080;
export const GAME_H = 1920;

// Tile grid
export const TILE = 512; // pixels per tile

// Car dimensions
export const CAR_W = 64;
export const CAR_H = 141; // ~2.2:1 ratio

// Car physics
export const MAX_SPEED = 1350;       // px/s at full speed

// Display conversion: speed (px/s) × SPEED_TO_KMH = km/h on HUD/wheel.
// Tuned so F1 (top tier, speedMult = 1.50) reads exactly 350 km/h at
// full throttle: 1350 × 1.50 × SPEED_TO_KMH = 350
export const SPEED_TO_KMH = 350 / (1350 * 1.50);
export const ACCELERATION = 600;     // px/s² forward force
export const TURN_RATE = 2.5;        // rad/s at full steering input
export const TURN_SPEED_PENALTY = 0.35; // speed multiplier at max turn (0-1, lower = more penalty)
export const LINEAR_DAMPING = 0.3;   // natural speed decay
export const CAR_MASS = 1;
export const CAR_RESTITUTION = 0.3;  // wall bounce
export const CAR_FRICTION = 0.5;

// Wall collision curve
export const WALL_SPEED_CURVE_EXPONENT = 2;
export const CRASH_IMPACT_THRESHOLD = 0.85;

// Track generation — longer tracks for Formula racing
export const MIN_TRACK_TILES = 38;
export const MAX_TRACK_TILES = 44;
export const WALL_THICKNESS = 8;     // visual wall thickness in px
export const WALL_SEGMENTS_PER_CURVE = 8; // edge segments to approximate curve arcs

// Timing
export const FIXED_DT = 1 / 60;
export const COUNTDOWN_SECONDS = 3;

// Race — 8 cars (1 player + 7 AI)
export const NUM_CARS = 8;
export const NUM_LAPS = 3;

// Championship points by finishing position (index 0 = 1st place)
export const POINTS = [25, 18, 15, 12, 10, 8, 6, 4];

// Season length options (number of races per season)
export const SEASON_LENGTHS = { short: 5, medium: 10, long: 20 };

// Formula tiers — progressively faster cars
// speedMult scales MAX_SPEED and ACCELERATION
export const TIERS = [
  { id: 'F4', name: 'Formula 4', speedMult: 1.00 },
  { id: 'F3', name: 'Formula 3', speedMult: 1.15 },
  { id: 'F2', name: 'Formula 2', speedMult: 1.30 },
  { id: 'F1', name: 'Formula 1', speedMult: 1.50 },
];

// Colors for the 8 cars on the grid (player = index 0, AI = 1-7)
export const CAR_COLORS = [
  0x2266dd, // blue (player)
  0xdd2222, // red
  0x22aa22, // green
  0xddaa22, // yellow
  0xaa44cc, // purple
  0xff6611, // orange
  0xffffff, // white
  0x22ccbb, // teal
];

// AI — 7 AI cars with varying skill
export const AI_SKILLS = [0.90, 0.93, 0.95, 0.97, 0.98, 0.99, 1.00];
export const AI_LOOKAHEAD_WAYPOINTS = 3;     // unused by ray-cast AI, kept for API
export const AI_CURVE_BRAKE_FACTOR = 0.6;    // unused by ray-cast AI

// Rubber-banding
export const RUBBERBAND_AHEAD_DIST  = 800;
export const RUBBERBAND_BEHIND_DIST = 800;
export const RUBBERBAND_AHEAD_MULT  = 0.92;
export const RUBBERBAND_BEHIND_MULT = 1.18;

// Respawn
export const RESPAWN_DELAY_SEC = 1.2;

// 3D Camera
export const CHASE_CAM_DISTANCE = 5;
export const CHASE_CAM_HEIGHT = 3;
export const CHASE_CAM_LOOK_AHEAD = 2;
export const CHASE_CAM_LERP = 0.06;
export const CHASE_CAM_FOV = 60;
export const CHASE_CAM_FOV_SPEED_BONUS = 5;

// 3D Scale
export const PX_TO_WORLD = 1 / 100;
export const ROAD_HALF_WIDTH = 3;
export const WALL_HEIGHT = 0.25;
export const WALL_BLOCK_LENGTH = 0.6;

// Fixed roster of 10 track seeds, grouped into 5 difficulty buckets of
// 2 tracks each.
export const TRACK_SEEDS = [
  3239390802, 1985302798,
  987654321, 123456789,
  555888111, 777222333,
  444999666, 111333555,
  888111444, 222666999,
];

export const MP_SNAPSHOT_HZ = 20;
export const MP_SNAPSHOT_INTERVAL_MS = 1000 / MP_SNAPSHOT_HZ;
export const MP_BUFFER_MS = 150;
export const MP_MAX_PLAYERS = 4;
export const MP_FINISH_GRACE_MS = 30000;
