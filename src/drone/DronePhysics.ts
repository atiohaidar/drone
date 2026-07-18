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

  // Flight Mode
  public flightMode: 'C' | 'P' | 'S' = 'P';

  // Drone Battery
  public droneBattery = 100.0;

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

    // Tilt gimbal visually (Horizon Lock)
    // Counter-tilt the gimbal by the drone's current pitch to keep the horizon level.
    if (droneModel.gimbal) {
      droneModel.gimbal.rotation.x = this.currentGimbalPitch - this.pitch;
    }

    if (!gameActive) return 0;

    // Battery Drain (5 minutes from 100 to 0)
    this.droneBattery -= (100.0 / 300.0) * dt;
    if (this.droneBattery < 0) this.droneBattery = 0;

    // DJI Mavic Mini 1 Specs mapped to Force/Drag engine
    let yawRate = 2.27; // ~130 deg/s (P Mode)
    let maxAccelXY = 14.4; // 8 m/s max horiz * 1.8 drag
    let maxClimbAccel = 5.4; // 3 m/s * 1.8 drag
    let maxDescAccel = 5.4; // 3 m/s * 1.8 drag
    
    if (this.flightMode === 'S') {
        yawRate = 2.62; // ~150 deg/s
        maxAccelXY = 23.4; // 13 m/s max horiz * 1.8
        maxClimbAccel = 7.2; // 4 m/s * 1.8
        maxDescAccel = 5.4; 
    } else if (this.flightMode === 'C') {
        yawRate = 0.52; // ~30 deg/s
        maxAccelXY = 7.2; // 4 m/s max horiz * 1.8
        maxClimbAccel = 2.7; // 1.5 m/s * 1.8
        maxDescAccel = 2.7;
    }

    // Battery Voltage Sag
    if (this.droneBattery < 30.0) {
        const sagFactor = Math.max(0.2, this.droneBattery / 30.0);
        maxAccelXY *= sagFactor;
        maxClimbAccel *= sagFactor;
    }

    // --- Yaw ---
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
    const localAccX = inputs.roll * maxAccelXY;
    const localAccZ = -inputs.pitch * maxAccelXY;

    // Transform to global frame via Y-axis rotation
    const cosH = Math.cos(this.heading);
    const sinH = Math.sin(this.heading);
    const globalAccX = localAccX * cosH + localAccZ * sinH;
    const globalAccZ = -localAccX * sinH + localAccZ * cosH;

    const globalAccY = inputs.throttle > 0 ? maxClimbAccel * inputs.throttle : maxDescAccel * inputs.throttle;

    this.velocity.x += globalAccX * dt;
    this.velocity.y += globalAccY * dt;
    this.velocity.z += globalAccZ * dt;

    // Drag and Active Braking
    if (inputs.pitch === 0 && inputs.roll === 0) {
        // Active Braking: apply strong counter force
        const horizontalVel = new Vector3(this.velocity.x, 0, this.velocity.z);
        if (horizontalVel.length() > 0.1) {
            const brakeForce = horizontalVel.clone().normalize().scale(-15.0 * dt);
            
            // Do not over-brake (which would cause reversing)
            if (brakeForce.length() > horizontalVel.length()) {
                this.velocity.x = 0;
                this.velocity.z = 0;
            } else {
                this.velocity.x += brakeForce.x;
                this.velocity.z += brakeForce.z;
            }
        } else {
            this.velocity.x = 0;
            this.velocity.z = 0;
        }
    } else {
        // Normal Drag
        this.velocity.x -= this.velocity.x * DRAG_COEFF * dt;
        this.velocity.z -= this.velocity.z * DRAG_COEFF * dt;
    }
    this.velocity.y -= this.velocity.y * DRAG_COEFF * dt;

    // Wind (outdoor only) - Auto Compensation if sticks are neutral
    const windTime = performance.now() * 0.001;
    const currentWindSpeed = environment === 'indoor' ? 0 : (this.windBaseSpeed + Math.sin(windTime * 0.5) * 0.4);
    const currentWindDir = this.windDirection + Math.cos(windTime * 0.3) * 0.15;

    if (environment !== 'indoor') {
      const windForceX = Math.sin(currentWindDir) * currentWindSpeed;
      const windForceZ = Math.cos(currentWindDir) * currentWindSpeed;
      
      if (inputs.pitch === 0 && inputs.roll === 0) {
          // Auto wind compensation (drone fights wind to stay still)
          // Drone visually tilts into the wind
          this.pitch += (windForceZ * 0.05 - this.pitch) * 2.0 * dt;
          this.roll -= (windForceX * 0.05 + this.roll) * 2.0 * dt;
      } else {
          // Wind pushes drone
          this.velocity.x += windForceX * 0.28 * dt;
          this.velocity.z += windForceZ * 0.28 * dt;
      }
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
    
    const batEl = document.getElementById('hud-battery');
    if (batEl) {
        batEl.innerText = Math.round(this.droneBattery) + '%';
        if (this.droneBattery < 20) batEl.style.color = '#ff4d4d';
        else batEl.style.color = '#00ffcc';
    }

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
