/**
 * Drone flight physics simulation.
 * Handles position/velocity, yaw/pitch/roll, gravity, drag, wind, and ground clamp.
 */
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import type { InputState } from '../core/InputManager';
import type { EnvironmentType } from '../core/GameStateManager';
import type { DroneModelData } from './DroneModel';
import { setDroneThrottle } from '../core/AudioManager';

// Physics constants
const GRAVITY = 9.8;
const DRAG_COEFF = 1.8;

export class DronePhysics {
  // Position and velocity
  public position = new Vector3(0, 5, 0);
  public velocity = new Vector3(0, 0, 0);

  // Orientation
  public heading = 0;
  public pitch = 0;
  public roll = 0;

  // Gimbal
  public targetGimbalPitch = 0;
  public currentGimbalPitch = 0;
  public smoothedCameraPitch = 0;

  // Wind
  public windDirection = Math.random() * Math.PI * 2;
  public windBaseSpeed = 1.2 + Math.random() * 2.0;

  private speedEl: HTMLElement | null = document.getElementById('hud-speed');
  private altEl: HTMLElement | null = document.getElementById('hud-alt');
  private windEl: HTMLElement | null = document.getElementById('hud-wind');
  private windDirEl: HTMLElement | null = document.getElementById('hud-wind-dir');

  /** Reset drone to starting position for the given environment. */
  reset(environment: EnvironmentType): void {
    if (environment === 'indoor') {
      this.position.set(0, 2, 40);
    } else {
      this.position.set(0, 5, 0);
    }
    this.velocity.set(0, 0, 0);
    this.heading = 0;
    this.pitch = 0;
    this.roll = 0;
    this.targetGimbalPitch = 0;
    this.currentGimbalPitch = 0;
    this.smoothedCameraPitch = 0;
  }

  /**
   * Update physics for one frame.
   * Returns shield damage amount from ground contact (0 if none).
   */
  update(
    dt: number,
    inputs: InputState,
    environment: EnvironmentType,
    gameActive: boolean,
    droneModel: DroneModelData
  ): number {
    let damage = 0;

    // Gimbal pitch (always updates, even on menu)
    const gimbalSpeed = 0.9;
    this.targetGimbalPitch += inputs.camera * gimbalSpeed * dt;
    this.targetGimbalPitch = Math.max(-Math.PI / 2, Math.min(0.0, this.targetGimbalPitch));
    this.currentGimbalPitch += (this.targetGimbalPitch - this.currentGimbalPitch) * 10.0 * dt;

    // Tilt gimbal visually
    if (droneModel.gimbal) {
      droneModel.gimbal.rotation.x = this.currentGimbalPitch;
    }

    if (!gameActive) return 0;

    // --- Yaw ---
    const yawRate = 2.0;
    this.heading -= inputs.yaw * yawRate * dt;

    // --- Tilting ---
    const targetPitch = -inputs.pitch * 0.4;
    const targetRoll = -inputs.roll * 0.4;
    this.pitch += (targetPitch - this.pitch) * 10.0 * dt;
    this.roll += (targetRoll - this.roll) * 10.0 * dt;

    // Apply rotation to drone mesh
    const root = droneModel.root;
    root.rotation.set(0, 0, 0);
    root.rotation.y = this.heading;
    root.rotation.x = this.pitch;
    root.rotation.z = this.roll;

    // Rotor speed
    const rotorSpeed = 40.0 + (inputs.throttle + 1.0) * 40.0;
    droneModel.rotors.forEach(r => {
      r.rotation.y += rotorSpeed * dt;
    });

    // Audio
    setDroneThrottle(inputs.throttle);

    // --- Acceleration ---
    const localAccX = inputs.roll * 15.0;
    const localAccZ = -inputs.pitch * 15.0;

    // Transform to global frame via Y-axis rotation
    const cosH = Math.cos(this.heading);
    const sinH = Math.sin(this.heading);
    const globalAccX = localAccX * cosH + localAccZ * sinH;
    const globalAccZ = -localAccX * sinH + localAccZ * cosH;

    const liftForce = (inputs.throttle + 1.0) * GRAVITY;
    const globalAccY = liftForce - GRAVITY;

    this.velocity.x += globalAccX * dt;
    this.velocity.y += globalAccY * dt;
    this.velocity.z += globalAccZ * dt;

    // Drag
    this.velocity.x -= this.velocity.x * DRAG_COEFF * dt;
    this.velocity.y -= this.velocity.y * DRAG_COEFF * dt;
    this.velocity.z -= this.velocity.z * DRAG_COEFF * dt;

    // Wind (outdoor only)
    const windTime = performance.now() * 0.001;
    const currentWindSpeed = environment === 'indoor' ? 0 : (this.windBaseSpeed + Math.sin(windTime * 0.5) * 0.4);
    const currentWindDir = this.windDirection + Math.cos(windTime * 0.3) * 0.15;

    if (environment !== 'indoor') {
      const windForceX = Math.sin(currentWindDir) * currentWindSpeed;
      const windForceZ = Math.cos(currentWindDir) * currentWindSpeed;
      this.velocity.x += windForceX * 0.28 * dt;
      this.velocity.z += windForceZ * 0.28 * dt;
    }

    // Integrate position
    this.position.x += this.velocity.x * dt;
    this.position.y += this.velocity.y * dt;
    this.position.z += this.velocity.z * dt;

    // Ground clamp
    if (this.position.y < 0.5) {
      this.position.y = 0.5;
      this.velocity.y = 0;

      const horizSpeed = Math.sqrt(this.velocity.x ** 2 + this.velocity.z ** 2);
      if (horizSpeed > 1.5) {
        damage = horizSpeed * 4.0;
      }
    }

    // Sync mesh position
    root.position.copyFrom(this.position);

    // Update HUD
    this.updateTelemetryHUD(currentWindSpeed, currentWindDir, environment);

    return damage;
  }

  /** Get the current wind state for HUD display. */
  private updateTelemetryHUD(windSpeed: number, windDir: number, environment: EnvironmentType): void {
    if (this.speedEl) this.speedEl.innerText = this.velocity.length().toFixed(1);
    if (this.altEl) this.altEl.innerText = Math.max(0, this.position.y).toFixed(1);

    if (environment === 'indoor') {
      if (this.windEl) this.windEl.innerText = '0.0';
      if (this.windDirEl) this.windDirEl.innerText = 'm/s Indoor';
    } else {
      const windDirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
      const windDirIndex = Math.round((windDir * 180 / Math.PI) / 45) % 8;
      const windDirStr = windDirs[(windDirIndex + 8) % 8];
      if (this.windEl) this.windEl.innerText = windSpeed.toFixed(1);
      if (this.windDirEl) this.windDirEl.innerText = `m/s ${windDirStr}`;
    }
  }
}
