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

export const trainCheckpoints: CheckpointDef[] = [
  { x: 45, y: 3.5, z: 85 },     // Gate 1: S1 Departure swerve right
  { x: 95, y: 4.5, z: 45 },     // Gate 2: S1 Chicane cut left
  { x: 140, y: 6.5, z: 80 },    // Gate 3: S1 Canyon ramp right
  { x: 235, y: 18.0, z: -25 },  // Gate 4: Viaduct climb swerve left
  { x: 275, y: 24.5, z: -95 },  // Gate 5: Viaduct High Apex swerve right (24m!)
  { x: 240, y: 20.5, z: -165 }, // Gate 6: Viaduct descent onto cliff left
  { x: 210, y: 15.0, z: -280 }, // Gate 7: Mountain gorge hairpin left
  { x: 15, y: 10.0, z: -290 },  // Gate 8: Tunnel Entrance arch portal
  { x: -55, y: 9.0, z: -325 },  // Gate 9: Inside Mountain Tunnel curve
  { x: -125, y: 8.0, z: -285 }, // Gate 10: Tunnel Exit leap
  { x: -225, y: 5.0, z: -275 }, // Gate 11: Serpentine River hard right
  { x: -265, y: 4.0, z: -210 }, // Gate 12: Serpentine River cut left
  { x: -305, y: 3.5, z: -135 }, // Gate 13: Riverbank sweeping bend
  { x: -220, y: 6.0, z: 125 },  // Gate 14: Dense Pine Forest slalom
  { x: -200, y: 9.0, z: 225 },  // Gate 15: North Ridge climb
  { x: 50, y: 3.0, z: 130 }     // Gate 16: Final chicane to station
];

export type EnvironmentType = 'outdoor' | 'indoor' | 'train';

export class GameStateManager {
  public state: GameState = 'MENU';
  public shieldHealth = 100.0;
  public activeCheckpointIndex = 0;
  public timerStart = 0;
  public finalTime = 0;
  public activeEnvironment: EnvironmentType = 'outdoor';

  /** Get the checkpoint list for the current environment. */
  get courseCheckpoints(): CheckpointDef[] {
    if (this.activeEnvironment === 'outdoor') return outdoorCheckpoints;
    if (this.activeEnvironment === 'indoor') return indoorCheckpoints;
    return trainCheckpoints;
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
    document.getElementById('btn-env-train')?.classList.toggle('active', env === 'train');
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
