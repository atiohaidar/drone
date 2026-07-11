/**
 * Game state machine — manages game flow, checkpoint tracking, timer, and shield health.
 */
import { initAudio, resumeAudio, setDroneThrottle, playFanfare } from './AudioManager';

export type GameState = 'MENU' | 'PLAYING' | 'GAME_OVER' | 'VICTORY';

export interface CheckpointDef {
  x: number;
  y: number;
  z: number;
}

// Checkpoint course definitions
export const outdoorCheckpoints: CheckpointDef[] = [
  { x: 0, y: 8, z: -40 },
  { x: 25, y: 15, z: -80 },
  { x: 75, y: 12, z: -100 },
  { x: 110, y: 22, z: -60 },
  { x: 80, y: 28, z: -10 },
  { x: 30, y: 16, z: 25 },
  { x: -30, y: 12, z: 65 },
  { x: -90, y: 25, z: 40 },
  { x: -105, y: 18, z: -25 },
  { x: -45, y: 8, z: -35 }
];

export const indoorCheckpoints: CheckpointDef[] = [
  { x: 0, y: 5, z: 20 },
  { x: -20, y: 8, z: 0 },
  { x: -35, y: 12, z: -25 },
  { x: 0, y: 6, z: -35 },
  { x: 35, y: 14, z: -20 },
  { x: 25, y: 8, z: 15 },
  { x: -10, y: 4, z: 35 },
  { x: 0, y: 3, z: 0 }
];

export type EnvironmentType = 'outdoor' | 'indoor';

export class GameStateManager {
  public state: GameState = 'MENU';
  public shieldHealth = 100.0;
  public activeCheckpointIndex = 0;
  public timerStart = 0;
  public finalTime = 0;
  public activeEnvironment: EnvironmentType = 'outdoor';

  /** Get the checkpoint list for the current environment. */
  get courseCheckpoints(): CheckpointDef[] {
    return this.activeEnvironment === 'outdoor' ? outdoorCheckpoints : indoorCheckpoints;
  }

  /** Start or restart the game. */
  startGame(): void {
    initAudio();
    resumeAudio();

    this.shieldHealth = 100.0;
    this.activeCheckpointIndex = 0;
    this.timerStart = performance.now();
    this.state = 'PLAYING';

    // Hide all screens
    document.getElementById('screen-start')?.classList.add('hidden');
    document.getElementById('screen-gameover')?.classList.add('hidden');
    document.getElementById('screen-victory')?.classList.add('hidden');

    setDroneThrottle(0);
  }

  /** Handle drone crash (shield depleted). */
  handleCrash(): void {
    this.state = 'GAME_OVER';
    playFanfare(false);
    setDroneThrottle(-1.0);

    const goGates = document.getElementById('go-gates');
    if (goGates) goGates.innerText = `${this.activeCheckpointIndex} / ${this.courseCheckpoints.length}`;

    const clearTime = ((performance.now() - this.timerStart) / 1000).toFixed(2);
    const goTime = document.getElementById('go-time');
    if (goTime) goTime.innerText = formatTime(clearTime);

    document.getElementById('screen-gameover')?.classList.remove('hidden');
  }

  /** Handle victory (all gates cleared). */
  handleVictory(): void {
    this.state = 'VICTORY';
    playFanfare(true);
    setDroneThrottle(-1.0);

    this.finalTime = parseFloat(((performance.now() - this.timerStart) / 1000).toFixed(2));
    const vicTime = document.getElementById('vic-time');
    if (vicTime) vicTime.innerText = formatTime(this.finalTime.toFixed(2));

    const vicShield = document.getElementById('vic-shield');
    if (vicShield) vicShield.innerText = `${Math.round(this.shieldHealth)}%`;

    document.getElementById('screen-victory')?.classList.remove('hidden');
  }

  /** Apply shield damage and return whether the drone is destroyed. */
  applyDamage(amount: number): boolean {
    this.shieldHealth -= amount;
    if (this.shieldHealth <= 0) {
      this.handleCrash();
      return true;
    }
    return false;
  }

  /** Set the active environment. */
  setEnvironment(env: EnvironmentType): void {
    this.activeEnvironment = env;

    document.getElementById('btn-env-outdoor')?.classList.toggle('active', env === 'outdoor');
    document.getElementById('btn-env-indoor')?.classList.toggle('active', env === 'indoor');
  }

  /** Check if the game is currently playable. */
  get isPlaying(): boolean {
    return this.state === 'PLAYING';
  }
}

/** Format seconds as MM:SS.CC string. */
export function formatTime(secStr: string | number): string {
  const sec = typeof secStr === 'string' ? parseFloat(secStr) : secStr;
  const mins = Math.floor(sec / 60);
  const secs = Math.floor(sec % 60);
  const ms = Math.floor((sec % 1) * 100);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}
