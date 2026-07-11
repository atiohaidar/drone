/**
 * Checkpoint gate system — torus gates with support poles, highlighting, and trigger detection.
 */
import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { LinesMesh } from '@babylonjs/core/Meshes/linesMesh';
import type { CheckpointDef, EnvironmentType } from '../core/GameStateManager';
import type { CollisionStructure } from '../drone/CollisionSystem';

export interface CheckpointData {
  group: TransformNode;
  mesh: Mesh;
  material: StandardMaterial;
  coords: CheckpointDef;
  radius: number;
}

/** Build checkpoint gates for the given course. */
export function buildCheckpoints(
  scene: Scene,
  courseDefs: CheckpointDef[],
  environment: EnvironmentType
): { checkpoints: CheckpointData[]; pathLine: LinesMesh | null; structures: CollisionStructure[] } {
  const checkpoints: CheckpointData[] = [];
  const structures: CollisionStructure[] = [];

  const linePoints: Vector3[] = [];

  courseDefs.forEach((pt, index) => {
    const gateGroup = new TransformNode(`gate${index}`, scene);
    gateGroup.position.set(pt.x, pt.y, pt.z);

    // Point gate toward next checkpoint
    const nextPt = courseDefs[(index + 1) % courseDefs.length];
    const lookTarget = new Vector3(nextPt.x, nextPt.y, nextPt.z);
    // Manual lookAt for TransformNode
    const dir = lookTarget.subtract(gateGroup.position).normalize();
    const yaw = Math.atan2(dir.x, dir.z);
    gateGroup.rotation.y = yaw;

    // Gate torus
    const color = index === 0 ? '#0284c7' : '#60a5fa';
    const gateMat = new StandardMaterial(`gateMat${index}`, scene);
    gateMat.emissiveColor = Color3.FromHexString(color);
    gateMat.disableLighting = true;
    gateMat.alpha = 1.0;

    const gateMesh = MeshBuilder.CreateTorus(`torus${index}`, {
      diameter: 4.6,
      thickness: 0.4,
      tessellation: 32,
    }, scene);
    gateMesh.material = gateMat;
    gateMesh.rotation.x = Math.PI / 2;
    gateMesh.parent = gateGroup;

    // Support pole
    const supportColor = environment === 'indoor' ? '#94a3b8' : '#475569';
    const supportMat = new StandardMaterial(`supportMat${index}`, scene);
    supportMat.diffuseColor = Color3.FromHexString(supportColor);
    supportMat.specularColor = Color3.Black();

    const support = MeshBuilder.CreateCylinder(`support${index}`, {
      diameter: 0.2,
      height: pt.y,
      tessellation: 8,
    }, scene);
    support.material = supportMat;
    support.position.y = -pt.y / 2;
    support.parent = gateGroup;

    checkpoints.push({
      group: gateGroup,
      mesh: gateMesh,
      material: gateMat,
      coords: pt,
      radius: 2.6,
    });

    structures.push({
      x: pt.x,
      z: pt.z,
      radius: 0.2,
      height: pt.y,
      isTree: false,
    });

    linePoints.push(new Vector3(pt.x, pt.y, pt.z));
  });

  // Connecting path line
  linePoints.push(linePoints[0].clone());
  const pathLineColor = Color3.FromHexString('#60a5fa');

  const pathLine = MeshBuilder.CreateLines('pathLine', {
    points: linePoints,
    updatable: false,
  }, scene);
  pathLine.color = pathLineColor;
  pathLine.alpha = environment === 'indoor' ? 0.35 : 0.6;

  return { checkpoints, pathLine, structures };
}

/** Update checkpoint highlight colors based on active index. */
export function updateCheckpointHighlight(
  checkpoints: CheckpointData[],
  activeIndex: number,
  totalCount: number
): void {
  checkpoints.forEach((cp, idx) => {
    if (idx === activeIndex) {
      cp.material.emissiveColor = Color3.FromHexString('#22c55e');
    } else if (idx < activeIndex) {
      cp.material.emissiveColor = Color3.FromHexString('#9ca3af');
    } else {
      cp.material.emissiveColor = Color3.FromHexString('#ef4444');
    }

    cp.group.scaling.setAll(1.0);
  });

  // Update HUD
  const hud = document.getElementById('gate-hud');
  const header = document.getElementById('gate-header');
  if (activeIndex < totalCount) {
    if (hud) hud.innerText = `GATE ${activeIndex + 1} / ${totalCount}`;
    if (header) header.innerText = 'Target Checkpoint';
  } else {
    if (hud) hud.innerText = 'ALL GATES CLEARED';
    if (header) header.innerText = 'Course Clear';
  }
}

/** Check if the drone is close enough to trigger the active checkpoint. */
export function checkCheckpointTrigger(
  checkpoints: CheckpointData[],
  activeIndex: number,
  dronePos: Vector3
): boolean {
  if (activeIndex >= checkpoints.length) return false;

  const target = checkpoints[activeIndex];
  const dist = Vector3.Distance(dronePos, target.group.position);
  return dist < target.radius;
}
