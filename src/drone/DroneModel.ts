/**
 * 3D drone mesh model constructed from primitives.
 * Central body, arms, motors, propellers, nav LEDs, and camera gimbal.
 */
import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';

export interface DroneModelData {
  root: TransformNode;
  rotors: TransformNode[];
  gimbal: TransformNode;
}

/** Build a detailed drone 3D mesh and return references for animation. */
export function buildDroneModel(scene: Scene, shadowGenerator: ShadowGenerator): DroneModelData {
  const root = new TransformNode('drone', scene);
  const rotors: TransformNode[] = [];

  // --- Body ---
  const bodyMat = new PBRMaterial('bodyMat', scene);
  bodyMat.albedoColor = Color3.FromHexString('#2b3543');
  bodyMat.metallic = 0.8;
  bodyMat.roughness = 0.3;

  const body = MeshBuilder.CreateBox('droneBody', { width: 1.2, height: 0.3, depth: 1.8 }, scene);
  body.material = bodyMat;
  body.parent = root;
  shadowGenerator.addShadowCaster(body);

  // --- Trim accent ---
  const trimMat = new StandardMaterial('trimMat', scene);
  trimMat.emissiveColor = Color3.FromHexString('#64748b');
  trimMat.disableLighting = true;

  const trim = MeshBuilder.CreateBox('droneTrim', { width: 0.2, height: 0.35, depth: 1.9 }, scene);
  trim.material = trimMat;
  trim.parent = root;

  // --- Arms ---
  const armMat = new PBRMaterial('armMat', scene);
  armMat.albedoColor = Color3.FromHexString('#1b2029');
  armMat.metallic = 0.9;
  armMat.roughness = 0.2;

  const armPositions = [
    { x: -0.7, z: -0.7, rotY: Math.PI / 4 },
    { x: 0.7, z: -0.7, rotY: -Math.PI / 4 },
    { x: -0.7, z: 0.7, rotY: -Math.PI / 4 },
    { x: 0.7, z: 0.7, rotY: Math.PI / 4 },
  ];

  armPositions.forEach((pos, i) => {
    const arm = MeshBuilder.CreateCylinder(`arm${i}`, {
      diameter: 0.24, height: 1.3, tessellation: 8
    }, scene);
    arm.material = armMat;
    arm.position.set(pos.x, 0, pos.z);
    arm.rotation.set(Math.PI / 2, pos.rotY, 0);
    arm.parent = root;
  });

  // --- Motors, LEDs, and Propellers ---
  const motorMat = new PBRMaterial('motorMat', scene);
  motorMat.albedoColor = Color3.FromHexString('#4f5d73');
  motorMat.metallic = 0.8;
  motorMat.roughness = 0.3;

  const ledRedMat = new StandardMaterial('ledRedMat', scene);
  ledRedMat.emissiveColor = Color3.FromHexString('#dc2626');
  ledRedMat.disableLighting = true;

  const ledGreenMat = new StandardMaterial('ledGreenMat', scene);
  ledGreenMat.emissiveColor = Color3.FromHexString('#16a34a');
  ledGreenMat.disableLighting = true;

  const bladeMat = new PBRMaterial('bladeMat', scene);
  bladeMat.albedoColor = Color3.FromHexString('#111111');
  bladeMat.alpha = 0.8;
  bladeMat.metallic = 0.3;
  bladeMat.roughness = 0.5;

  const motorPositions = [
    { x: -1.16, z: -1.16, isFront: true },
    { x: 1.16, z: -1.16, isFront: true },
    { x: -1.16, z: 1.16, isFront: false },
    { x: 1.16, z: 1.16, isFront: false },
  ];

  motorPositions.forEach((pos, i) => {
    // Motor
    const motor = MeshBuilder.CreateCylinder(`motor${i}`, {
      diameter: 0.3, height: 0.3, tessellation: 8
    }, scene);
    motor.material = motorMat;
    motor.position.set(pos.x, 0.15, pos.z);
    motor.parent = root;

    // Nav LED
    const led = MeshBuilder.CreateSphere(`led${i}`, { diameter: 0.12, segments: 8 }, scene);
    led.material = pos.isFront ? ledRedMat : ledGreenMat;
    led.position.set(pos.x, 0.05, pos.z + (pos.isFront ? -0.15 : 0.15));
    led.parent = root;

    // Propeller
    const propGroup = new TransformNode(`prop${i}`, scene);
    propGroup.position.set(pos.x, 0.3, pos.z);
    propGroup.parent = root;

    const blade = MeshBuilder.CreateBox(`blade${i}`, { width: 1.2, height: 0.02, depth: 0.08 }, scene);
    blade.material = bladeMat;
    blade.parent = propGroup;

    rotors.push(propGroup);
  });

  // --- Camera Gimbal ---
  const gimbal = new TransformNode('gimbal', scene);
  gimbal.position.set(0, -0.2, -0.8);
  gimbal.parent = root;

  const lensMat = new PBRMaterial('lensMat', scene);
  lensMat.albedoColor = Color3.FromHexString('#111111');
  lensMat.metallic = 0.9;
  lensMat.roughness = 0.1;

  const lens = MeshBuilder.CreateSphere('lens', { diameter: 0.36, segments: 16 }, scene);
  lens.material = lensMat;
  lens.parent = gimbal;

  const gimbalRingMat = new StandardMaterial('gimbalRingMat', scene);
  gimbalRingMat.emissiveColor = Color3.FromHexString('#94a3b8');
  gimbalRingMat.disableLighting = true;

  const gimbalRing = MeshBuilder.CreateTorus('gimbalRing', {
    diameter: 0.4, thickness: 0.06, tessellation: 24
  }, scene);
  gimbalRing.material = gimbalRingMat;
  gimbalRing.rotation.y = Math.PI / 2;
  gimbalRing.parent = gimbal;

  return { root, rotors, gimbal };
}
