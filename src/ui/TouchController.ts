/**
 * Mobile Touch Controller — Dual Virtual Joysticks (Mode 2) & Action Buttons.
 * Left Stick: Throttle (Up/Down) & Yaw (Left/Right)
 * Right Stick: Pitch (Up/Down -> Forward/Backward) & Roll (Left/Right -> Strafe)
 */

export interface TouchInputState {
  throttle: number; // -1 to 1
  yaw: number;      // -1 to 1
  pitch: number;    // -1 to 1
  roll: number;     // -1 to 1
  camera: number;   // -1 to 1
}

type ButtonCallback = () => void;

export class TouchController {
  public inputs: TouchInputState = {
    throttle: 0,
    yaw: 0,
    pitch: 0,
    roll: 0,
    camera: 0,
  };

  public isEnabled = false;
  public activeTouchCount = 0;

  private container: HTMLElement | null = null;
  private leftRing: HTMLElement | null = null;
  private leftKnob: HTMLElement | null = null;
  private rightRing: HTMLElement | null = null;
  private rightKnob: HTMLElement | null = null;

  // Stick state
  private leftPointerId: number | null = null;
  private rightPointerId: number | null = null;

  private leftCenter = { x: 0, y: 0 };
  private rightCenter = { x: 0, y: 0 };
  private maxRadius = 55; // Pixels from ring center

  // Callbacks
  private onPhotoCallback: ButtonCallback | null = null;
  private onResetCallback: ButtonCallback | null = null;
  private onModeCallback: ButtonCallback | null = null;

  constructor() {
    this.createDomElements();
    this.checkAutoEnable();
    this.bindEvents();
  }

  public onPhoto(cb: ButtonCallback): void {
    this.onPhotoCallback = cb;
  }

  public onReset(cb: ButtonCallback): void {
    this.onResetCallback = cb;
  }

  public onMode(cb: ButtonCallback): void {
    this.onModeCallback = cb;
  }

  private checkAutoEnable(): void {
    // Auto enable touch controls if touch support detected or screen width < 900px
    const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
    const isMobileSize = window.innerWidth <= 900;
    if (hasTouch || isMobileSize) {
      this.enable();
    }
  }

  public enable(): void {
    this.isEnabled = true;
    if (this.container) {
      this.container.style.display = 'block';
    }
    const toggleBtn = document.getElementById('btn-toggle-touch');
    if (toggleBtn) {
      toggleBtn.classList.add('active');
    }
  }

  public disable(): void {
    this.isEnabled = false;
    if (this.container) {
      this.container.style.display = 'none';
    }
    const toggleBtn = document.getElementById('btn-toggle-touch');
    if (toggleBtn) {
      toggleBtn.classList.remove('active');
    }
    this.resetInputs();
  }

  public toggle(): void {
    if (this.isEnabled) this.disable();
    else this.enable();
  }

  private triggerHaptic(): void {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(12);
      } catch (_) {
        // Ignore if forbidden
      }
    }
  }

  private createDomElements(): void {
    this.container = document.createElement('div');
    this.container.id = 'touch-controls-container';
    this.container.className = 'touch-overlay-container';
    this.container.style.display = 'none';

    this.container.innerHTML = `
      <!-- Left Virtual Joystick (Mode 2: Throttle / Yaw) -->
      <div class="touch-stick-wrapper left-stick-wrapper" id="touch-left-wrapper">
        <div class="stick-ring" id="touch-left-ring">
          <div class="stick-axis-cross"></div>
          <div class="stick-knob" id="touch-left-knob"></div>
        </div>
        <div class="stick-label">THROTTLE / YAW</div>
      </div>

      <!-- Right Virtual Joystick (Mode 2: Pitch / Roll) -->
      <div class="touch-stick-wrapper right-stick-wrapper" id="touch-right-wrapper">
        <div class="stick-ring" id="touch-right-ring">
          <div class="stick-axis-cross"></div>
          <div class="stick-knob" id="touch-right-knob"></div>
        </div>
        <div class="stick-label">PITCH / ROLL</div>
      </div>

      <!-- Quick Mobile Action Buttons Bar -->
      <div class="touch-action-bar">
        <button class="touch-btn" id="touch-btn-cam-up" title="Gimbal Camera Up">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m18 15-6-6-6 6"/></svg>
        </button>
        <button class="touch-btn" id="touch-btn-cam-down" title="Gimbal Camera Down">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="m6 9 6 6 6-6"/></svg>
        </button>
        <button class="touch-btn touch-btn-primary" id="touch-btn-cam-cycle" title="Camera Mode (Photo/FPV)">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>
        </button>
        <button class="touch-btn touch-btn-warning" id="touch-btn-mode" title="Flight Mode (P/S/C)">
          <span id="touch-mode-label">P</span>
        </button>
        <button class="touch-btn touch-btn-danger" id="touch-btn-reset" title="Reset Drone">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67"/></svg>
        </button>
      </div>
    `;

    document.body.appendChild(this.container);

    this.leftRing = document.getElementById('touch-left-ring');
    this.leftKnob = document.getElementById('touch-left-knob');
    this.rightRing = document.getElementById('touch-right-ring');
    this.rightKnob = document.getElementById('touch-right-knob');
  }

  private bindEvents(): void {
    if (!this.leftRing || !this.rightRing) return;

    // Pointer events for Left Stick
    this.leftRing.addEventListener('pointerdown', (e) => this.handlePointerDown(e, 'left'));
    this.leftRing.addEventListener('pointermove', (e) => this.handlePointerMove(e, 'left'));
    this.leftRing.addEventListener('pointerup', (e) => this.handlePointerUp(e, 'left'));
    this.leftRing.addEventListener('pointercancel', (e) => this.handlePointerUp(e, 'left'));

    // Pointer events for Right Stick
    this.rightRing.addEventListener('pointerdown', (e) => this.handlePointerDown(e, 'right'));
    this.rightRing.addEventListener('pointermove', (e) => this.handlePointerMove(e, 'right'));
    this.rightRing.addEventListener('pointerup', (e) => this.handlePointerUp(e, 'right'));
    this.rightRing.addEventListener('pointercancel', (e) => this.handlePointerUp(e, 'right'));

    // Touch Action Buttons
    const btnCamUp = document.getElementById('touch-btn-cam-up');
    const btnCamDown = document.getElementById('touch-btn-cam-down');
    const btnCamCycle = document.getElementById('touch-btn-cam-cycle');
    const btnMode = document.getElementById('touch-btn-mode');
    const btnReset = document.getElementById('touch-btn-reset');

    btnCamUp?.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.inputs.camera = 0.6;
      this.triggerHaptic();
    });
    btnCamUp?.addEventListener('pointerup', () => { this.inputs.camera = 0; });
    btnCamUp?.addEventListener('pointerleave', () => { this.inputs.camera = 0; });

    btnCamDown?.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      this.inputs.camera = -0.6;
      this.triggerHaptic();
    });
    btnCamDown?.addEventListener('pointerup', () => { this.inputs.camera = 0; });
    btnCamDown?.addEventListener('pointerleave', () => { this.inputs.camera = 0; });

    btnCamCycle?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.triggerHaptic();
      this.onPhotoCallback?.();
    });

    btnMode?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.triggerHaptic();
      this.onModeCallback?.();
    });

    btnReset?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.triggerHaptic();
      this.onResetCallback?.();
    });
  }

  private handlePointerDown(e: PointerEvent, side: 'left' | 'right'): void {
    e.preventDefault();
    e.stopPropagation();

    const ring = side === 'left' ? this.leftRing : this.rightRing;
    if (!ring) return;

    ring.setPointerCapture(e.pointerId);

    const rect = ring.getBoundingClientRect();
    const center = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };

    if (side === 'left') {
      this.leftPointerId = e.pointerId;
      this.leftCenter = center;
    } else {
      this.rightPointerId = e.pointerId;
      this.rightCenter = center;
    }

    this.activeTouchCount++;
    this.updateStickPosition(e.clientX, e.clientY, side);
  }

  private handlePointerMove(e: PointerEvent, side: 'left' | 'right'): void {
    const pointerId = side === 'left' ? this.leftPointerId : this.rightPointerId;
    if (pointerId !== e.pointerId) return;

    e.preventDefault();
    e.stopPropagation();
    this.updateStickPosition(e.clientX, e.clientY, side);
  }

  private handlePointerUp(e: PointerEvent, side: 'left' | 'right'): void {
    const pointerId = side === 'left' ? this.leftPointerId : this.rightPointerId;
    if (pointerId !== e.pointerId) return;

    e.preventDefault();
    e.stopPropagation();

    const ring = side === 'left' ? this.leftRing : this.rightRing;
    if (ring && ring.hasPointerCapture(e.pointerId)) {
      ring.releasePointerCapture(e.pointerId);
    }

    if (side === 'left') {
      this.leftPointerId = null;
      this.inputs.throttle = 0;
      this.inputs.yaw = 0;
      if (this.leftKnob) this.leftKnob.style.transform = `translate(-50%, -50%) translate(0px, 0px)`;
    } else {
      this.rightPointerId = null;
      this.inputs.pitch = 0;
      this.inputs.roll = 0;
      if (this.rightKnob) this.rightKnob.style.transform = `translate(-50%, -50%) translate(0px, 0px)`;
    }

    this.activeTouchCount = Math.max(0, this.activeTouchCount - 1);
  }

  private updateStickPosition(clientX: number, clientY: number, side: 'left' | 'right'): void {
    const center = side === 'left' ? this.leftCenter : this.rightCenter;
    const knob = side === 'left' ? this.leftKnob : this.rightKnob;
    if (!knob) return;

    const deltaX = clientX - center.x;
    const deltaY = clientY - center.y;

    const distance = Math.hypot(deltaX, deltaY);
    const clampedDist = Math.min(distance, this.maxRadius);
    const angle = Math.atan2(deltaY, deltaX);

    const knobX = Math.cos(angle) * clampedDist;
    const knobY = Math.sin(angle) * clampedDist;

    // Visual Knob Translation
    knob.style.transform = `translate(-50%, -50%) translate(${knobX}px, ${knobY}px)`;

    // Calculate normalized -1 to 1 values with deadzone & exponential curve
    let normX = knobX / this.maxRadius;
    let normY = -knobY / this.maxRadius; // Up is positive in drone coordinate system

    normX = this.applyStickResponse(normX);
    normY = this.applyStickResponse(normY);

    if (side === 'left') {
      this.inputs.yaw = -normX;      // Right (+knobX) -> -yaw (turns Right)
      this.inputs.throttle = normY;  // Down (-knobY) / Up (+knobY)
    } else {
      this.inputs.roll = -normX;     // Right (+knobX) -> -roll (rolls Right)
      this.inputs.pitch = normY;     // Backward (-knobY) / Forward (+knobY)
    }
  }

  /**
   * Exponential RC stick curve & 5% deadzone for smooth, realistic drone pilot control.
   */
  private applyStickResponse(val: number): number {
    const deadzone = 0.05;
    const absVal = Math.abs(val);

    if (absVal < deadzone) return 0;

    // Rescale 0..1 outside deadzone
    const remapped = (absVal - deadzone) / (1 - deadzone);
    // Apply 1.5 exponential curve
    const expVal = Math.pow(remapped, 1.5);

    return Math.sign(val) * expVal;
  }

  public resetInputs(): void {
    this.inputs = {
      throttle: 0,
      yaw: 0,
      pitch: 0,
      roll: 0,
      camera: 0,
    };
    if (this.leftKnob) this.leftKnob.style.transform = `translate(-50%, -50%) translate(0px, 0px)`;
    if (this.rightKnob) this.rightKnob.style.transform = `translate(-50%, -50%) translate(0px, 0px)`;
  }
}
