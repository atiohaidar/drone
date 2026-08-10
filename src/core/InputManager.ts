/**
 * Unified input system — merges WebSocket DJI controller + Touch Screen Joystick + Keyboard fallback.
 */
import type { ControllerState } from '../../shared/types';
import type { TouchController } from '../ui/TouchController';

export interface InputState {
  throttle: number;
  yaw: number;
  pitch: number;
  roll: number;
  camera: number;
}

type ButtonCallback = () => void;

export class InputManager {
  public inputs: InputState = {
    throttle: 0, yaw: 0, pitch: 0, roll: 0, camera: 0
  };

  private socket: WebSocket | null = null;
  private isConnected = false;
  private isControllerActive = false;
  private keys: Record<string, boolean> = {};

  private touchController: TouchController | null = null;

  // Button edge detection
  private prevPhotoState = 0;
  private prevFnState = 0;
  private prevModeState = 0;
  private onPhotoCallback: ButtonCallback | null = null;
  private onFnCallback: ButtonCallback | null = null;
  private onModeCallback: ButtonCallback | null = null;

  // DOM references for status display
  private wsDot: HTMLElement | null = null;
  private wsText: HTMLElement | null = null;
  private controlDetected: HTMLElement | null = null;

  constructor() {
    this.wsDot = document.getElementById('ws-dot');
    this.wsText = document.getElementById('ws-text');
    this.controlDetected = document.getElementById('control-detected');
  }

  public setTouchController(tc: TouchController): void {
    this.touchController = tc;

    tc.onPhoto(() => this.onPhotoCallback?.());
    tc.onReset(() => this.onFnCallback?.());
    tc.onMode(() => this.onModeCallback?.());
  }

  /** Register callback for the photo/shutter button press. */
  onPhotoButton(cb: ButtonCallback): void {
    this.onPhotoCallback = cb;
  }

  /** Register callback for the Fn/C1 button press. */
  onFnButton(cb: ButtonCallback): void {
    this.onFnCallback = cb;
  }

  /** Register callback for the Mode button press. */
  onModeButton(cb: ButtonCallback): void {
    this.onModeCallback = cb;
  }

  /** Start WebSocket connection to the serial bridge. */
  connectWebSocket(): void {
    if (this.wsText) this.wsText.innerText = 'Connecting...';
    if (this.wsDot) this.wsDot.className = 'status-dot waiting';

    this.socket = new WebSocket('ws://127.0.0.1:8765');

    this.socket.onopen = () => {
      this.isConnected = true;
      if (this.wsText) this.wsText.innerText = 'Connected';
      if (this.wsDot) this.wsDot.className = 'status-dot connected';
      if (this.controlDetected) {
        this.controlDetected.innerHTML = 'DJI Controller connected. Ready to Fly!';
        this.controlDetected.style.color = 'var(--success)';
      }
    };

    this.socket.onmessage = (event) => {
      try {
        const data: ControllerState = JSON.parse(event.data);

        if (data.dji_connected) {
          this.isControllerActive = true;
          this.inputs.throttle = data.throttle;
          this.inputs.yaw = -data.yaw;
          this.inputs.pitch = data.pitch;
          this.inputs.roll = -data.roll;
          this.inputs.camera = data.camera;

          if (this.wsText) this.wsText.innerText = 'Active';
          if (this.wsDot) this.wsDot.className = 'status-dot connected';
          if (this.controlDetected) {
            this.controlDetected.innerHTML = 'DJI Controller Active. Ready!';
            this.controlDetected.style.color = 'var(--success)';
          }

          // Button edge detection
          if (data.btn_photo === 1 && this.prevPhotoState === 0) {
            this.onPhotoCallback?.();
          }
          this.prevPhotoState = data.btn_photo;

          if (data.btn_fn === 1 && this.prevFnState === 0) {
            this.onFnCallback?.();
          }
          this.prevFnState = data.btn_fn;
        } else {
          this.isControllerActive = false;
          if (this.wsText) this.wsText.innerText = 'Standalone Mode';
          if (this.wsDot) this.wsDot.className = 'status-dot waiting';
          this.updateFallbackStatusText();
        }
      } catch (e) {
        console.error('Error reading WebSocket payload', e);
      }
    };

    this.socket.onclose = () => {
      this.isConnected = false;
      this.isControllerActive = false;
      if (this.wsText) this.wsText.innerText = 'Standalone Mode';
      if (this.wsDot) this.wsDot.className = 'status-dot';
      this.updateFallbackStatusText();

      // Reconnect loop (every 4s)
      setTimeout(() => this.connectWebSocket(), 4000);
    };

    this.socket.onerror = () => {
      this.socket?.close();
    };
  }

  private updateFallbackStatusText(): void {
    if (!this.controlDetected) return;

    if (this.touchController && this.touchController.isEnabled) {
      this.controlDetected.innerHTML = 'Touch Controls Active (Screen Joysticks)';
      this.controlDetected.style.color = 'var(--primary)';
    } else {
      this.controlDetected.innerHTML = 'Using Keyboard Controls (WSAD + Arrows)';
      this.controlDetected.style.color = 'var(--text-muted)';
    }
  }

  /** Initialize keyboard event listeners. */
  initKeyboard(): void {
    window.addEventListener('keydown', (e) => {
      this.keys[e.code] = true;
      if (e.code === 'KeyC') this.onPhotoCallback?.();
      if (e.code === 'KeyR') this.onFnCallback?.();
      if (e.code === 'KeyM') this.onModeCallback?.();
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });
  }

  /** Update inputs from Touch or Keyboard — only when DJI hardware controller is NOT active. */
  updateFromKeyboard(): void {
    if (this.isControllerActive) return;

    this.inputs.throttle = 0;
    this.inputs.yaw = 0;
    this.inputs.pitch = 0;
    this.inputs.roll = 0;
    this.inputs.camera = 0;

    // Check Touch Controller input first
    let hasTouchInput = false;
    if (this.touchController && this.touchController.isEnabled) {
      const tcState = this.touchController.inputs;
      if (
        Math.abs(tcState.throttle) > 0.001 ||
        Math.abs(tcState.yaw) > 0.001 ||
        Math.abs(tcState.pitch) > 0.001 ||
        Math.abs(tcState.roll) > 0.001 ||
        Math.abs(tcState.camera) > 0.001
      ) {
        hasTouchInput = true;
        this.inputs.throttle = tcState.throttle;
        this.inputs.yaw = tcState.yaw;
        this.inputs.pitch = tcState.pitch;
        this.inputs.roll = tcState.roll;
        this.inputs.camera = tcState.camera;
      }
    }

    if (hasTouchInput) return;

    // Keyboard Fallback
    // Q / E: Camera gimbal tilt
    if (this.keys['KeyQ']) this.inputs.camera = -0.5;
    if (this.keys['KeyE']) this.inputs.camera = 0.5;

    // W / S: Throttle
    if (this.keys['KeyW']) this.inputs.throttle = 0.7;
    if (this.keys['KeyS']) this.inputs.throttle = -0.7;

    // A / D: Yaw
    if (this.keys['KeyA']) this.inputs.yaw = 0.6;    // Left -> turns Left
    if (this.keys['KeyD']) this.inputs.yaw = -0.6;   // Right -> turns Right

    // Up / Down arrows: Pitch
    if (this.keys['ArrowUp']) this.inputs.pitch = 0.7;
    if (this.keys['ArrowDown']) this.inputs.pitch = -0.7;

    // Left / Right arrows: Roll
    if (this.keys['ArrowLeft']) this.inputs.roll = 0.7;   // Left -> rolls Left
    if (this.keys['ArrowRight']) this.inputs.roll = -0.7; // Right -> rolls Right
  }
}
