/**
 * Camera controller for the three views: Third Person, First Person, and Gate Tracker.
 */
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { EnvironmentType, CheckpointDef } from '../core/GameStateManager';
import type { DroneModelData } from './DroneModel';
import type { CheckpointData } from '../world/Checkpoints';

export class CameraController {
  private mainCamera: FreeCamera;
  private pipCamera: FreeCamera;
  private cameraMode = 0; // 0: TPV, 1: FPV, 2: Gate Tracker
  private currentLookAt = new Vector3();
  private pipCurrentLookAt = new Vector3();
  private isFirstUpdate = true;

  constructor(mainCamera: FreeCamera, pipCamera: FreeCamera) {
    this.mainCamera = mainCamera;
    this.pipCamera = pipCamera;
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
    const tpvPos = new Vector3();
    const tpvTarget = new Vector3();
    
    // Calculate TPV
    const followDistance = 7.0;
    const followHeight = 2.2;
    tpvPos.set(
      dronePos.x + Math.sin(droneHeading) * followDistance,
      dronePos.y + followHeight,
      dronePos.z + Math.cos(droneHeading) * followDistance
    );
    tpvTarget.copyFrom(dronePos).addInPlace(new Vector3(0, 0.4, 0));

    // Calculate FPV
    const fpvOffset = new Vector3(0, 0.05, -0.9);
    const cosH = Math.cos(droneHeading);
    const sinH = Math.sin(droneHeading);
    const rotatedOffset = new Vector3(
      fpvOffset.x * cosH + fpvOffset.z * sinH,
      fpvOffset.y,
      -fpvOffset.x * sinH + fpvOffset.z * cosH
    );
    const fpvPos = dronePos.clone().addInPlace(rotatedOffset);
    const targetCameraPitch = dronePitch + currentGimbalPitch;
    smoothedCameraPitch.value += (targetCameraPitch - smoothedCameraPitch.value) * 12.0 * dt;
    const lookDirection = new Vector3(0, Math.sin(smoothedCameraPitch.value), -Math.cos(smoothedCameraPitch.value));
    const lookRotated = new Vector3(
      lookDirection.x * cosH + lookDirection.z * sinH,
      lookDirection.y,
      -lookDirection.x * sinH + lookDirection.z * cosH
    );
    const fpvTarget = fpvPos.clone().addInPlace(lookRotated);

    // Calculate Gate Tracker
    const time = performance.now() * 0.0003;
    const activeGate = courseCheckpoints[activeCheckpointIndex % courseCheckpoints.length];
    const gateTrackerPos = new Vector3(
      activeGate.x + Math.sin(time) * 20,
      activeGate.y + 12,
      activeGate.z + Math.cos(time) * 20
    );
    const gateTrackerTarget = dronePos.clone();

    // Assign based on mode
    let mainDesiredPos: Vector3, mainDesiredTarget: Vector3;
    let pipDesiredPos: Vector3, pipDesiredTarget: Vector3;
    let fpvCameraInst: FreeCamera | null = null;

    if (this.cameraMode === 0) {
      mainDesiredPos = tpvPos; mainDesiredTarget = tpvTarget;
      pipDesiredPos = gateTrackerPos; pipDesiredTarget = gateTrackerTarget;
    } else if (this.cameraMode === 1) {
      mainDesiredPos = fpvPos; mainDesiredTarget = fpvTarget;
      pipDesiredPos = gateTrackerPos; pipDesiredTarget = gateTrackerTarget;
      fpvCameraInst = this.mainCamera;
    } else {
      mainDesiredPos = gateTrackerPos; mainDesiredTarget = gateTrackerTarget;
      pipDesiredPos = fpvPos; pipDesiredTarget = fpvTarget;
      fpvCameraInst = this.pipCamera;
    }

    if (this.isFirstUpdate) {
      this.mainCamera.position.copyFrom(mainDesiredPos);
      this.currentLookAt.copyFrom(mainDesiredTarget);
      this.pipCamera.position.copyFrom(pipDesiredPos);
      this.pipCurrentLookAt.copyFrom(pipDesiredTarget);
      this.isFirstUpdate = false;
    } else {
      const lerpSpeed = this.cameraMode === 1 ? 15.0 : 8.0;
      this.mainCamera.position.addInPlace(mainDesiredPos.subtract(this.mainCamera.position).scale(lerpSpeed * dt));
      this.currentLookAt.addInPlace(mainDesiredTarget.subtract(this.currentLookAt).scale(lerpSpeed * dt));
      
      const pipLerpSpeed = this.cameraMode === 2 ? 15.0 : 8.0;
      this.pipCamera.position.addInPlace(pipDesiredPos.subtract(this.pipCamera.position).scale(pipLerpSpeed * dt));
      this.pipCurrentLookAt.addInPlace(pipDesiredTarget.subtract(this.pipCurrentLookAt).scale(pipLerpSpeed * dt));
    }

    this.mainCamera.setTarget(this.currentLookAt);
    this.pipCamera.setTarget(this.pipCurrentLookAt);

    // Apply Layer Masks for FPV Drone Hiding
    this.mainCamera.layerMask = (fpvCameraInst === this.mainCamera) ? 0x0FFFFFFE : 0x0FFFFFFF;
    this.pipCamera.layerMask = (fpvCameraInst === this.pipCamera) ? 0x0FFFFFFE : 0x0FFFFFFF;

    // Prevent camera from clipping through hangar walls and ceiling in indoor mode
    const cameras = [this.mainCamera, this.pipCamera];
    for (const cam of cameras) {
      if (environment === 'indoor') {
        cam.position.x = Math.max(-48.5, Math.min(48.5, cam.position.x));
        cam.position.z = Math.max(-48.5, Math.min(48.5, cam.position.z));
        cam.position.y = Math.max(1.0, Math.min(18.5, cam.position.y));
      }
    }

    // Fade out gates too close to the camera to prevent blocking view
    checkpoints.forEach(cp => {
      const dist = Vector3.Distance(this.mainCamera.position, cp.group.position);
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
