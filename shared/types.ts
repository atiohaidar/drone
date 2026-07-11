/** Shared controller state interface used by both the serial bridge server and the browser client. */
export interface ControllerState {
  throttle: number;    // -1.0 to 1.0
  yaw: number;         // -1.0 to 1.0
  pitch: number;       // -1.0 to 1.0
  roll: number;        // -1.0 to 1.0
  camera: number;      // -1.0 to 1.0
  btn_fn: number;      // 0 or 1
  btn_photo: number;   // 0 or 1
  btn_rtbh: number;    // 0 or 1
  btn_pause: number;   // 0 or 1
  dial_click: number;  // -1, 0, or 1
  rc_battery: number;  // 0-100
  rc_charging: number; // 0 or 1
  port: string;
  dji_connected: boolean;
  status: string;
}

/** Create a fresh default ControllerState. */
export function createDefaultState(): ControllerState {
  return {
    throttle: 0.0,
    yaw: 0.0,
    pitch: 0.0,
    roll: 0.0,
    camera: 0.0,
    btn_fn: 0,
    btn_photo: 0,
    btn_rtbh: 0,
    btn_pause: 0,
    dial_click: 0,
    rc_battery: 100,
    rc_charging: 0,
    port: 'None',
    dji_connected: false,
    status: 'Waiting for connection...'
  };
}
