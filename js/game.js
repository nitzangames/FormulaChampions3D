import { FIXED_DT, COUNTDOWN_SECONDS } from './constants.js';

export class GameState {
  constructor() {
    this.state = 'title';
    this.raceTime = 0;
    this.countdownNumber = COUNTDOWN_SECONDS;
    this.finishDelta = null;
    this.isNewRecord = false;
    this._countdownAccumulator = 0;
    this._stateBeforePause = null;
  }

  /** Pause the current race. Saves the previous state so we can resume. */
  pause() {
    if (this.state === 'racing' || this.state === 'finishing') {
      this._stateBeforePause = this.state;
      this.state = 'paused';
    }
  }

  /** Resume from pause. */
  resume() {
    if (this.state === 'paused') {
      this.state = this._stateBeforePause || 'racing';
      this._stateBeforePause = null;
    }
  }

  /**
   * title -> countdown
   */
  startCountdown() {
    this.state = 'countdown';
    this.countdownNumber = COUNTDOWN_SECONDS;
    this._countdownAccumulator = 0;
    this.raceTime = 0;
    this.finishDelta = null;
    this.isNewRecord = false;
  }

  /**
   * Advance the countdown by one physics tick.
   * Returns true when the countdown finishes and state transitions to 'racing'.
   */
  tickCountdown() {
    this._countdownAccumulator += FIXED_DT;
    if (this._countdownAccumulator >= 1) {
      this._countdownAccumulator -= 1;
      this.countdownNumber--;
    }
    if (this.countdownNumber <= 0) {
      this.state = 'racing';
      this.countdownNumber = 0; // keep at 0 for "lights off" display
      return true;
    }
    return false;
  }

  /**
   * Increment raceTime by one fixed-dt tick (in ms).
   */
  tickRace() {
    this.raceTime += FIXED_DT * 1000;
  }

  /**
   * Transition to finished state and compute delta from previous best.
   * @param {number|null} previousBest - previous best time in ms, or null
   */
  finish(previousBest) {
    this.state = 'finished';
    if (previousBest !== null && previousBest !== undefined) {
      this.finishDelta = this.raceTime - previousBest;
    } else {
      this.finishDelta = null;
    }
  }

  /**
   * Reset back to title state.
   */
  reset() {
    this.state = 'title';
    this.raceTime = 0;
    this.countdownNumber = COUNTDOWN_SECONDS;
    this.finishDelta = null;
    this.isNewRecord = false;
    this._countdownAccumulator = 0;
  }
}
