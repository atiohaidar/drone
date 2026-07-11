/**
 * Camera controller for the three views: Third Person, First Person, and Orbit Overview.
 */
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { EnvironmentType, CheckpointDef } from '../core/GameStateManager';
import type { DroneModelData } from './DroneModel';
import type { CheckpointData } from '../world/Checkpoints';

export class CameraController {
  private camera: FreeCamera;
  private cameraMode = 0; // 0: TPV, 1: FPV, 2: Orbit

  constructor(camera: FreeCamera) {
    this.camera = camera;
  }

  public getMode(): number {
    return this.cameraMode;
  }

  public setMode(mode: number): void {
    this.cameraMode = mode;
  }

  public cycleMode(): void {
    this.cameraMode = (this.cameraMode + 1) % 3;
    console.log(`Camera mode switched to: ${this.cameraMode}`);
  }

  public update(
    dt: number,
    dronePos: Vector3,
    droneHeading: number,
    dronePitch: number,
    currentGimbalPitch: number,
    smoothedCameraPitch: { value: number },
    environment: EnvironmentType,
    courseCheckpoints: CheckpointDef[],
    activeCheckpointIndex: number,
    droneModel: DroneModelData,
    checkpoints: CheckpointData[]
  ): void {
    if (this.cameraMode === 0) {
      // --- TPV (Third Person View) ---
      const followDistance = 7.0;
      const followHeight = 2.2;

      const targetCamPos = new Vector3(
        dronePos.x + Math.sin(droneHeading) * followDistance,
        dronePos.y + followHeight,
        dronePos.z + Math.cos(droneHeading) * followDistance
      );

      // Lerp camera position
      this.camera.position.addInPlace(targetCamPos.subtract(this.camera.position).scale(8.0 * dt));

      const lookAtTarget = dronePos.clone().add(new Vector3(0, 0.4, 0));
      this.camera.setTarget(lookAtTarget);

    } else if (this.cameraMode === 1) {
      // --- FPV (First Person View) ---
      const fpvOffset = new Vector3(0, 0.05, -0.9);
      // Rotate offset by drone heading
      const cosH = Math.cos(droneHeading);
      const sinH = Math.sin(droneHeading);
      const rotatedOffset = new Vector3(
        fpvOffset.x * cosH + fpvOffset.z * sinH,
        fpvOffset.y,
        -fpvOffset.x * sinH + fpvOffset.z * cosH
      );

      this.camera.position.copyFrom(dronePos).addInPlace(rotatedOffset);

      const targetCameraPitch = dronePitch + currentGimbalPitch;
      smoothedCameraPitch.value += (targetCameraPitch - smoothedCameraPitch.value) * 12.0 * dt;

      // Calculate look direction
      const lookDirection = new Vector3(0, Math.sin(smoothedCameraPitch.value), -Math.cos(smoothedCameraPitch.value));
      // Rotate by heading
      const lookRotated = new Vector3(
        lookDirection.x * cosH + lookDirection.z * sinH,
        lookDirection.y,
        -lookDirection.x * sinH + lookDirection.z * cosH
      );

      this.camera.setTarget(this.camera.position.add(lookRotated));

    } else {
      // --- Orbit Overview Mode ---
      const time = performance.now() * 0.0003;
      const activeGate = courseCheckpoints[activeCheckpointIndex % courseCheckpoints.length];

      this.camera.position.set(
        activeGate.x + Math.sin(time) * 20,
        activeGate.y + 12,
        activeGate.z + Math.cos(time) * 20
      );
      this.camera.setTarget(new Vector3(activeGate.x, activeGate.y, activeGate.z));
    }

    // Prevent camera from clipping through hangar walls and ceiling in indoor mode
    if (environment === 'indoor') {
      this.camera.position.x = Math.max(-48.5, Math.min(48.5, this.camera.position.x));
      this.camera.position.z = Math.max(-48.5, Math.min(48.5, this.camera.position.z));
      this.camera.position.y = Math.max(1.0, Math.min(18.5, this.camera.position.y));
    }

    // Hide drone mesh in FPV mode to prevent camera clipping inside it
    if (droneModel.root) {
      droneModel.root.setEnabled(this.cameraMode !== 1);
    }

    // Fade out gates too close to the camera to prevent blocking view
    checkpoints.forEach(cp => {
      const dist = Vector3.Distance(this.camera.position, cp.group.position);
      const fadeStart = 5.0;
      const fadeEnd = 1.2;
      if (dist < fadeStart) {
        const t = (dist - fadeEnd) / (fadeStart - fadeEnd);
        cp.material.alpha = Math.max(0.0, Math.min(1.0, t));
      } else {
        cp.material.alpha = 1.0;
      }
    });
  }
}
