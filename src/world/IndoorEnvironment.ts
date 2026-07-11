/**
 * Indoor cyber hangar arena environment.
 * Room box, subtle stripes, spotlights, pillars, crates, and laser beams.
 */
import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { PointLight } from '@babylonjs/core/Lights/pointLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type { CollisionStructure, BeamData, CrateCollider } from '../drone/CollisionSystem';

/** Build the indoor arena. Returns collision data arrays. */
export function buildIndoorEnvironment(
  scene: Scene,
  parent: TransformNode,
  shadowGenerator: ShadowGenerator
): { structures: CollisionStructure[]; beams: BeamData[]; crates: CrateCollider[] } {
  const structures: CollisionStructure[] = [];
  const beams: BeamData[] = [];
  const crates: CrateCollider[] = [];

  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.015;
  scene.fogColor = Color3.FromHexString('#0f172a');
  scene.clearColor.set(0.059, 0.086, 0.137, 1.0);

  const roomMat = new StandardMaterial('roomMat', scene);
  roomMat.diffuseColor = Color3.FromHexString('#1f2937');
  roomMat.specularColor = Color3.Black();
  roomMat.backFaceCulling = false;

  const room = MeshBuilder.CreateBox('room', { width: 100, height: 20, depth: 100 }, scene);
  room.material = roomMat;
  room.position.y = 10;
  room.receiveShadows = true;
  room.parent = parent;

  const floorMat = new StandardMaterial('floorMat', scene);
  floorMat.diffuseColor = Color3.FromHexString('#111827');
  floorMat.specularColor = Color3.Black();
  floorMat.roughness = 0.3;

  const floor = MeshBuilder.CreateGround('indoorFloor', { width: 100, height: 100 }, scene);
  floor.material = floorMat;
  floor.receiveShadows = true;
  floor.parent = parent;

  const gridLines = MeshBuilder.CreateGround('indoorGrid', { width: 100, height: 100, subdivisions: 20 }, scene);
  const gridMat = new StandardMaterial('indoorGridMat', scene);
  gridMat.wireframe = true;
  gridMat.emissiveColor = Color3.FromHexString('#94a3b8');
  gridMat.alpha = 0.16;
  gridLines.material = gridMat;
  gridLines.position.y = 0.08;
  gridLines.parent = parent;

  const stripeColors = [Color3.FromHexString('#94a3b8'), Color3.FromHexString('#cbd5e1')];
  const stripeHeights = [5, 15];

  stripeHeights.forEach((h, idx) => {
    const stripeMat = new StandardMaterial(`stripeMat${idx}`, scene);
    stripeMat.emissiveColor = stripeColors[idx];
    stripeMat.disableLighting = true;

    const sN = MeshBuilder.CreateBox(`stripeN${idx}`, { width: 100, height: 0.15, depth: 0.15 }, scene);
    sN.material = stripeMat;
    sN.position.set(0, h, -49.9);
    sN.parent = parent;

    const sS = MeshBuilder.CreateBox(`stripeS${idx}`, { width: 100, height: 0.15, depth: 0.15 }, scene);
    sS.material = stripeMat;
    sS.position.set(0, h, 49.9);
    sS.parent = parent;

    const sE = MeshBuilder.CreateBox(`stripeE${idx}`, { width: 0.15, height: 0.15, depth: 100 }, scene);
    sE.material = stripeMat;
    sE.position.set(49.9, h, 0);
    sE.parent = parent;

    const sW = MeshBuilder.CreateBox(`stripeW${idx}`, { width: 0.15, height: 0.15, depth: 100 }, scene);
    sW.material = stripeMat;
    sW.position.set(-49.9, h, 0);
    sW.parent = parent;
  });

  const spotPositions = [
    { x: -30, z: -30, color: '#e2e8f0' },
    { x: 30, z: -30, color: '#ffffff' },
    { x: -30, z: 30, color: '#f8fafc' },
    { x: 30, z: 30, color: '#cbd5e1' },
  ];

  spotPositions.forEach((pos, i) => {
    const fixture = MeshBuilder.CreateCylinder(`fixture${i}`, { diameter: 1.2, height: 0.8, tessellation: 12 }, scene);
    const fixtureMat = new StandardMaterial(`fixtureMat${i}`, scene);
    fixtureMat.diffuseColor = Color3.FromHexString('#374151');
    fixture.material = fixtureMat;
    fixture.position.set(pos.x, 19.6, pos.z);
    fixture.parent = parent;

    const cap = MeshBuilder.CreateCylinder(`cap${i}`, { diameter: 1.0, height: 0.1, tessellation: 12 }, scene);
    const capMat = new StandardMaterial(`capMat${i}`, scene);
    capMat.emissiveColor = Color3.FromHexString(pos.color);
    capMat.disableLighting = true;
    cap.material = capMat;
    cap.position.set(pos.x, 19.15, pos.z);
    cap.parent = parent;

    const light = new PointLight(`spotLight${i}`, new Vector3(pos.x, 18, pos.z), scene);
    light.diffuse = Color3.FromHexString(pos.color);
    light.specular = Color3.Black();
    light.intensity = 0.85;
    light.range = 50;
  });

  const pillarPositions = [
    { x: -35, z: -35 }, { x: 35, z: -35 }, { x: -35, z: 35 }, { x: 35, z: 35 },
    { x: -18, z: -18 }, { x: 18, z: -18 }, { x: -18, z: 18 }, { x: 18, z: 18 },
    { x: 0, z: -28 }, { x: 0, z: 28 },
    { x: -25, z: 0 }, { x: 25, z: 0 }, { x: 0, z: 15 }, { x: 0, z: -15 },
    { x: -15, z: -30 }, { x: 15, z: -30 }
  ];

  const pillarMat = new StandardMaterial('pillarMat', scene);
  pillarMat.diffuseColor = Color3.FromHexString('#64748b');
  pillarMat.specularColor = new Color3(0.5, 0.5, 0.5);

  const hazardMat = new StandardMaterial('hazardMat', scene);
  hazardMat.diffuseColor = Color3.FromHexString('#eab308');
  hazardMat.specularColor = Color3.Black();

  const ringMat = new StandardMaterial('ringMat', scene);
  ringMat.emissiveColor = Color3.FromHexString('#94a3b8');
  ringMat.disableLighting = true;

  pillarPositions.forEach((pos, i) => {
    const pillarNode = new TransformNode(`pillar${i}`, scene);
    pillarNode.position.set(pos.x, 10, pos.z);
    pillarNode.parent = parent;

    const pillar = MeshBuilder.CreateCylinder(`pillarMesh${i}`, { diameter: 2.4, height: 20, tessellation: 16 }, scene);
    pillar.material = pillarMat;
    pillar.parent = pillarNode;
    shadowGenerator.addShadowCaster(pillar);
    pillar.receiveShadows = true;

    const wrap = MeshBuilder.CreateCylinder(`wrap${i}`, { diameter: 2.5, height: 4, tessellation: 16 }, scene);
    wrap.material = hazardMat;
    wrap.position.y = -8;
    wrap.parent = pillarNode;

    const ring1 = MeshBuilder.CreateTorus(`ring1_${i}`, { diameter: 2.2, thickness: 0.16, tessellation: 24 }, scene);
    ring1.material = ringMat;
    ring1.position.y = -2;
    ring1.parent = pillarNode;

    const ring2 = MeshBuilder.CreateTorus(`ring2_${i}`, { diameter: 2.6, thickness: 0.16, tessellation: 24 }, scene);
    ring2.material = ringMat;
    ring2.parent = pillarNode;

    structures.push({
      x: pos.x,
      z: pos.z,
      radius: 1.3,
      height: 20,
      isTree: false,
    });
  });

  const cratesData = [
    { x: -20, y: 8, z: 12, w: 4, h: 4, d: 4, rotY: 0.3 },
    { x: 30, y: 2.5, z: -15, w: 5, h: 5, d: 5, rotY: 0 },
    { x: 25, y: 2.5, z: -17, w: 5, h: 5, d: 5, rotY: 0.1 },
    { x: 27, y: 7, z: -16, w: 4, h: 4, d: 4, rotY: -0.4 },
    { x: 22, y: 3.5, z: 0, w: 7, h: 7, d: 7, rotY: 0.25 },
    { x: 0, y: 1.5, z: -15, w: 10, h: 3, d: 4, rotY: -0.2 },
    { x: -30, y: 7.5, z: -30, w: 3, h: 3, d: 3, rotY: 0.5 },
    { x: -28, y: 2.5, z: -5, w: 5, h: 5, d: 5, rotY: 0 },
    { x: -28, y: 6.5, z: -5, w: 3, h: 3, d: 3, rotY: 0.2 },
    { x: -5, y: 2.5, z: -25, w: 5, h: 5, d: 5, rotY: 0.1 },
    { x: -35, y: 4, z: 0, w: 8, h: 8, d: 8, rotY: 0 },
    { x: 35, y: 4, z: 0, w: 8, h: 8, d: 8, rotY: 0 },
    { x: -12, y: 9, z: -22, w: 8, h: 2, d: 8, rotY: 0.1 },
    { x: 0, y: 14, z: 0, w: 12, h: 2, d: 12, rotY: 0.25 },
    { x: -20, y: 7, z: 5, w: 10, h: 1, d: 10, rotY: 0.1 },
    { x: 20, y: 12, z: -5, w: 10, h: 1, d: 10, rotY: -0.1 },
    { x: -10, y: 5, z: -10, w: 6, h: 1, d: 6, rotY: 0.2 },
    { x: 10, y: 13, z: -10, w: 6, h: 1, d: 6, rotY: -0.2 }
  ];

  const crateMat = new StandardMaterial('crateMat', scene);
  crateMat.diffuseColor = Color3.FromHexString('#e65c00');
  crateMat.specularColor = new Color3(0.3, 0.3, 0.3);

  cratesData.forEach((c, i) => {
    const crate = MeshBuilder.CreateBox(`crate${i}`, { width: c.w, height: c.h, depth: c.d }, scene);
    crate.material = crateMat;
    crate.position.set(c.x, c.y, c.z);
    crate.rotation.y = c.rotY;
    crate.parent = parent;
    shadowGenerator.addShadowCaster(crate);
    crate.receiveShadows = true;

    const wireframe = crate.clone(`crateWire${i}`);
    const wireMat = new StandardMaterial(`wireMat${i}`, scene);
    wireMat.emissiveColor = Color3.FromHexString('#fef08a');
    wireMat.wireframe = true;
    wireMat.disableLighting = true;
    wireframe.material = wireMat;
    wireframe.parent = parent;

    const halfW = c.w / 2;
    const halfH = c.h / 2;
    const halfD = c.d / 2;
    crates.push({
      minX: c.x - halfW, minY: c.y - halfH, minZ: c.z - halfD,
      maxX: c.x + halfW, maxY: c.y + halfH, maxZ: c.z + halfD
    });
  });

  const laserMat = new StandardMaterial('laserMat', scene);
  laserMat.diffuseColor = Color3.FromHexString('#b45309');
  laserMat.emissiveColor = Color3.FromHexString('#b45309');
  laserMat.disableLighting = true;
  laserMat.alpha = 0.65;

  const laserBeams: BeamData[] = [
    { x1: -35, z1: -35, x2: 35, z2: -35, y: 12, thickness: 0.3 },
    { x1: -35, z1: 35, x2: -35, z2: -35, y: 6, thickness: 0.3 },
    { x1: 35, z1: 35, x2: 35, z2: -35, y: 15, thickness: 0.3 },
    { x1: -20, z1: -10, x2: 20, z2: -10, y: 8, thickness: 0.3 },
    { x1: -35, z1: -10, x2: 35, z2: 10, y: 14, thickness: 0.25 },
    { x1: -20, z1: 20, x2: 20, z2: -20, y: 5, thickness: 0.25 },
    { x1: -35, z1: -25, x2: -35, z2: 25, y: 8, thickness: 0.2 },
    { x1: 35, z1: -25, x2: 35, z2: 25, y: 12, thickness: 0.2 },
    { x1: -20, z1: 16, x2: 20, z2: 16, y: 16, thickness: 0.2 },
    { x1: 0, z1: -35, x2: 0, z2: 35, y: 7, thickness: 0.2 }
  ];

  laserBeams.forEach((b, i) => {
    const p1 = new Vector3(b.x1, b.y, b.z1);
    const p2 = new Vector3(b.x2, b.y, b.z2);
    const direction = p2.subtract(p1);
    const length = direction.length();
    const midpoint = p1.add(p2).scale(0.5);

    const beam = MeshBuilder.CreateCylinder(`indoorBeam${i}`, {
      diameter: b.thickness * 2,
      height: length,
      tessellation: 8
    }, scene);
    beam.material = laserMat;
    beam.position.copyFrom(midpoint);

    const dx = direction.x;
    const dz = direction.z;
    beam.rotation.x = Math.PI / 2;
    beam.rotation.y = Math.atan2(dx, dz);

    beam.parent = parent;
    beams.push(b);
  });

  const vertLaserPositions = [
    { x: -8, z: -8 }, { x: 8, z: 8 }, { x: -18, z: 25 }, { x: 18, z: -25 },
    { x: -15, z: -25 }, { x: 15, z: 25 }, { x: -25, z: 10 }, { x: 25, z: -10 },
    { x: -5, z: 18 }, { x: 5, z: -18 }
  ];

  const vLaserMat = new StandardMaterial('vLaserMat', scene);
  vLaserMat.diffuseColor = Color3.FromHexString('#b45309');
  vLaserMat.emissiveColor = Color3.FromHexString('#b45309');
  vLaserMat.disableLighting = true;
  vLaserMat.alpha = 0.65;

  vertLaserPositions.forEach((v, i) => {
    const laser = MeshBuilder.CreateCylinder(`vLaser${i}`, {
      diameter: 0.24,
      height: 20,
      tessellation: 8
    }, scene);
    laser.material = vLaserMat;
    laser.position.set(v.x, 10, v.z);
    laser.parent = parent;

    structures.push({
      x: v.x,
      z: v.z,
      radius: 0.15,
      height: 20,
      isTree: false
    });
  });

  return { structures, beams, crates };
}