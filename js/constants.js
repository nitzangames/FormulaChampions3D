// Identity
export const VERSION = 'v0.1.0';

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

// Track generation
export const MIN_TRACK_TILES = 28;
export const MAX_TRACK_TILES = 34;
export const WALL_THICKNESS = 8;     // visual wall thickness in px
export const WALL_SEGMENTS_PER_CURVE = 8; // edge segments to approximate curve arcs

// Timing
export const FIXED_DT = 1 / 60;
export const COUNTDOWN_SECONDS = 3;

// Race
export const NUM_CARS = 4;
export const NUM_LAPS = 3;

// AI
export const AI_SKILLS = [0.95, 0.98, 1.00]; // top AI matches player MAX_SPEED
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
export const WALL_HEIGHT = 0.5;
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
