/**
 * HUD manager for the overlay UI elements (dials, input bars, shield health, etc.).
 */
import type { InputState } from '../core/InputManager';

export class HUD {
  private barThr: HTMLElement | null;
  private valThr: HTMLElement | null;
  private barPit: HTMLElement | null;
  private valPit: HTMLElement | null;
  private barRol: HTMLElement | null;
  private valRol: HTMLElement | null;
  private barYaw: HTMLElement | null;
  private valYaw: HTMLElement | null;

  private telemetryCards: HTMLElement[];
  private healthFill: HTMLElement | null;
  private healthPct: HTMLElement | null;

  constructor() {
    this.barThr = document.getElementById('bar-thr');
    this.valThr = document.getElementById('val-thr');
    this.barPit = document.getElementById('bar-pit');
    this.valPit = document.getElementById('val-pit');
    this.barRol = document.getElementById('bar-rol');
    this.valRol = document.getElementById('val-rol');
    this.barYaw = document.getElementById('bar-yaw');
    this.valYaw = document.getElementById('val-yaw');

    this.telemetryCards = Array.from(document.querySelectorAll('.telemetry-card'));
    this.healthFill = document.getElementById('health-fill');
    this.healthPct = document.getElementById('health-pct');
  }

  private setDialProgress(card: HTMLElement | undefined, value: number, maxValue: number): void {
    if (!card) return;

    const normalized = Math.max(0, Math.min(1, value / maxValue));
    const progress = value > 0 ? Math.max(0.08, normalized) : 0;
    card.style.setProperty('--dial-progress', `${progress * 100}%`);
  }

  private setBar(barEl: HTMLElement | null, valEl: HTMLElement | null, val: number): void {
    if (!barEl || !valEl) return;

    const pct = Math.abs(val) * 50;
    barEl.style.width = `${pct}%`;

    if (val >= 0) {
      barEl.style.left = '50%';
    } else {
      barEl.style.left = `${50 - pct}%`;
    }

    valEl.innerText = `${Math.round(val * 100)}%`;
  }

  /** Update input bars on the HUD. */
  public updateInputs(inputs: InputState): void {
    this.setBar(this.barThr, this.valThr, inputs.throttle);
    this.setBar(this.barPit, this.valPit, inputs.pitch);
    this.setBar(this.barRol, this.valRol, inputs.roll);
    this.setBar(this.barYaw, this.valYaw, inputs.yaw);
  }

  /** Update telemetry dial rings. */
  public updateTelemetry(speed: number, altitude: number, windForce: number): void {
    this.setDialProgress(this.telemetryCards[0], speed, 12);
    this.setDialProgress(this.telemetryCards[1], altitude, 30);
    this.setDialProgress(this.telemetryCards[2], windForce, 8);
  }

  /** Update the shield health bar. */
  public updateShieldHealth(shieldHealth: number): void {
    const health = Math.max(0, shieldHealth);
    if (this.healthFill) {
      this.healthFill.style.width = `${health}%`;
    }
    if (this.healthPct) {
      this.healthPct.innerText = `${Math.round(health)}%`;
    }
  }
}
