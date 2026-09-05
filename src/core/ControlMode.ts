/**
 * Transmitter Flight Control Modes (Mode 1, Mode 2, Mode 3, Mode 4).
 * Handles configuration, mapping definitions, and localStorage persistence.
 */

export type StickMode = 1 | 2 | 3 | 4;

export interface StickModeConfig {
  mode: StickMode;
  name: string;
  leftVertical: 'throttle' | 'pitch';
  leftHorizontal: 'yaw' | 'roll';
  rightVertical: 'throttle' | 'pitch';
  rightHorizontal: 'yaw' | 'roll';
  leftLabel: string;
  rightLabel: string;
  summary: string;
  legend: {
    throttle: string;
    yaw: string;
    pitch: string;
    roll: string;
  };
}

export const STICK_MODE_CONFIGS: Record<StickMode, StickModeConfig> = {
  1: {
    mode: 1,
    name: 'Mode 1',
    leftVertical: 'pitch',
    leftHorizontal: 'yaw',
    rightVertical: 'throttle',
    rightHorizontal: 'roll',
    leftLabel: 'PITCH / YAW',
    rightLabel: 'THROTTLE / ROLL',
    summary: 'Left: Pitch/Yaw | Right: Throttle/Roll',
    legend: {
      pitch: 'W / S (Left Stick Y)',
      yaw: 'A / D (Left Stick X)',
      throttle: '↑ / ↓ (Right Stick Y)',
      roll: '← / → (Right Stick X)',
    },
  },
  2: {
    mode: 2,
    name: 'Mode 2',
    leftVertical: 'throttle',
    leftHorizontal: 'yaw',
    rightVertical: 'pitch',
    rightHorizontal: 'roll',
    leftLabel: 'THROTTLE / YAW',
    rightLabel: 'PITCH / ROLL',
    summary: 'Left: Throttle/Yaw | Right: Pitch/Roll',
    legend: {
      throttle: 'W / S (Left Stick Y)',
      yaw: 'A / D (Left Stick X)',
      pitch: '↑ / ↓ (Right Stick Y)',
      roll: '← / → (Right Stick X)',
    },
  },
  3: {
    mode: 3,
    name: 'Mode 3',
    leftVertical: 'pitch',
    leftHorizontal: 'roll',
    rightVertical: 'throttle',
    rightHorizontal: 'yaw',
    leftLabel: 'PITCH / ROLL',
    rightLabel: 'THROTTLE / YAW',
    summary: 'Left: Pitch/Roll | Right: Throttle/Yaw',
    legend: {
      pitch: 'W / S (Left Stick Y)',
      roll: 'A / D (Left Stick X)',
      throttle: '↑ / ↓ (Right Stick Y)',
      yaw: '← / → (Right Stick X)',
    },
  },
  4: {
    mode: 4,
    name: 'Mode 4',
    leftVertical: 'throttle',
    leftHorizontal: 'roll',
    rightVertical: 'pitch',
    rightHorizontal: 'yaw',
    leftLabel: 'THROTTLE / ROLL',
    rightLabel: 'PITCH / YAW',
    summary: 'Left: Throttle/Roll | Right: Pitch/Yaw',
    legend: {
      throttle: 'W / S (Left Stick Y)',
      roll: 'A / D (Left Stick X)',
      pitch: '↑ / ↓ (Right Stick Y)',
      yaw: '← / → (Right Stick X)',
    },
  },
};

const STORAGE_KEY = 'drone_stick_mode';

export function getSavedStickMode(): StickMode {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (parsed === 1 || parsed === 2 || parsed === 3 || parsed === 4) {
        return parsed as StickMode;
      }
    }
  } catch (_) {
    // localStorage not accessible
  }
  return 2;
}

export function saveStickMode(mode: StickMode): void {
  try {
    localStorage.setItem(STORAGE_KEY, mode.toString());
  } catch (_) {
    // localStorage not accessible
  }
}
