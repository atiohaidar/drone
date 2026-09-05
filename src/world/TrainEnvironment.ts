/**
 * Train Chase Environment — Grand 2-Kilometer Alpine Railway Expedition.
 * Features a massive winding 3D railway loop across a deep canyon with a 24-meter-high
 * trestle viaduct, high mountain cliff ridges, a long mountain tunnel, an alpine river basin,
 * dense pine forest switchbacks, and a moving 5-car vintage steam train with carriages.
 * Designed for cinematic high-speed FPV drone chasing.
 */
import { Scene } from '@babylonjs/core/scene';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { ShaderMaterial } from '@babylonjs/core/Materials/shaderMaterial';
import { Effect } from '@babylonjs/core/Materials/effect';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Curve3, Path3D } from '@babylonjs/core/Maths/math.path';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type { CollisionStructure, BeamData, CrateCollider } from '../drone/CollisionSystem';

// Track control points forming a grand 2.3-kilometer serpentine railway with thrilling S-curves and chicanes
export const trainTrackWaypoints: Vector3[] = [
  // 1. Station & Departure Slalom (S-Curve 1)
  new Vector3(0, 2.0, 60),        // Station start
  new Vector3(45, 2.5, 85),       // S1: Swerve right
  new Vector3(95, 3.5, 45),       // S1: Swerve left
  new Vector3(140, 6.0, 80),      // S1: Cut right

  // 2. Canyon Ascent & Viaduct S-Curve (S-Curve 2)
  new Vector3(190, 11.0, 35),     // Approach canyon
  new Vector3(235, 17.0, -25),    // S2: Viaduct climb swerve left
  new Vector3(275, 24.0, -95),    // S2: Viaduct apex swerve right (24m high!)
  new Vector3(240, 20.0, -165),   // S2: Viaduct descent swerve left onto cliff
  new Vector3(270, 17.0, -225),   // S2: Mountain crag swerve right

  // 3. Mountain Ridge Chicane (S-Curve 3)
  new Vector3(210, 14.5, -280),   // S3: Hairpin left into gorge
  new Vector3(150, 12.5, -255),   // S3: Hard right cliff hug
  new Vector3(85, 11.0, -315),    // S3: Swoop left pre-tunnel
  new Vector3(15, 9.5, -290),     // Tunnel entrance arch portal
  new Vector3(-55, 8.5, -325),    // Curved path inside mountain tunnel
  new Vector3(-125, 7.5, -285),   // Tunnel exit portal

  // 4. River Valley Serpentine (Triple S-Curve 4)
  new Vector3(-175, 6.0, -235),   // S4: Swerve left out of tunnel over river
  new Vector3(-225, 4.5, -275),   // S4: Hard right across water
  new Vector3(-265, 3.5, -210),   // S4: Cut left between rock pillars
  new Vector3(-305, 3.0, -135),   // S4: Curve right along riverbank
  new Vector3(-265, 3.5, -60),    // S4: Swerve left into canyon cut
  new Vector3(-310, 4.0, 15),     // S4: Bend right entering forest

  // 5. Pine Forest Slalom (S-Curve 5)
  new Vector3(-270, 4.5, 75),     // S5: Swerve right through trees
  new Vector3(-220, 5.5, 125),    // S5: Weave left
  new Vector3(-260, 6.5, 175),    // S5: Swerve right
  new Vector3(-200, 8.5, 225),    // S5: Weave left climbing North Ridge

  // 6. Ridge Crest S-Turn & Home Straight (S-Curve 6)
  new Vector3(-130, 10.0, 265),   // S6: Hairpin right along ridge crest
  new Vector3(-60, 8.0, 225),     // S6: S-curve dive
  new Vector3(15, 6.0, 255),      // S6: Swerve right
  new Vector3(75, 4.0, 195),      // S6: Swerve left into meadow
  new Vector3(50, 2.5, 130),      // S6: Final chicane back to station
];

export interface TrainEnvironmentData {
  structures: CollisionStructure[];
  beams: BeamData[];
  crates: CrateCollider[];
  update: (dt: number) => CrateCollider[];
  dispose: () => void;
}

interface TrainCar {
  root: TransformNode;
  length: number;
  width: number;
  height: number;
  offsetFromEngine: number; // distance behind locomotive in meters
}

interface SmokePuff {
  mesh: Mesh;
  velocity: Vector3;
  life: number;
  maxLife: number;
}

export function buildTrainEnvironment(
  scene: Scene,
  parent: TransformNode,
  shadowGenerator: ShadowGenerator
): TrainEnvironmentData {
  const structures: CollisionStructure[] = [];
  const beams: BeamData[] = [];
  let dynamicTrainColliders: CrateCollider[] = [];

  // --- Atmospheric Lighting & Mountain Fog ---
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.0022; // Extended visibility for the grand 2km vista
  scene.fogColor = Color3.FromHexString('#fed7aa'); // Warm golden alpine haze
  scene.clearColor.set(0.98, 0.88, 0.72, 1.0);

  // --- Golden Hour Sky Dome ---
  if (!Effect.ShadersStore['trainSkyVertexShader']) {
    Effect.ShadersStore['trainSkyVertexShader'] = `
      precision highp float;
      attribute vec3 position;
      uniform mat4 worldViewProjection;
      uniform mat4 world;
      varying vec3 vWorldPosition;
      void main() {
        vec4 wp = world * vec4(position, 1.0);
        vWorldPosition = wp.xyz;
        gl_Position = worldViewProjection * vec4(position, 1.0);
      }
    `;
    Effect.ShadersStore['trainSkyFragmentShader'] = `
      precision highp float;
      uniform vec3 topColor;
      uniform vec3 bottomColor;
      uniform float offset;
      uniform float exponent;
      varying vec3 vWorldPosition;
      void main() {
        float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
        gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
      }
    `;
    Effect.ShadersStore['trainSkyPixelShader'] = Effect.ShadersStore['trainSkyFragmentShader'];
  }

  const skyMat = new ShaderMaterial('trainSkyMat', scene, {
    vertex: 'trainSky',
    fragment: 'trainSky',
  }, {
    attributes: ['position'],
    uniforms: ['worldViewProjection', 'world', 'topColor', 'bottomColor', 'offset', 'exponent'],
  });
  skyMat.setVector3('topColor', new Vector3(0.18, 0.35, 0.65)); // Alpine Blue
  skyMat.setVector3('bottomColor', new Vector3(0.98, 0.75, 0.50)); // Sunrise Gold
  skyMat.setFloat('offset', 40);
  skyMat.setFloat('exponent', 0.52);
  skyMat.backFaceCulling = false;

  const sky = MeshBuilder.CreateSphere('skyTrain', { diameter: 2200, segments: 32 }, scene);
  sky.material = skyMat;
  sky.parent = parent;

  // --- Expansive Ground & Canyon River Terrain ---
  const groundSize = 1800;
  const ground = MeshBuilder.CreateGround('trainGround', { width: groundSize, height: groundSize }, scene);
  const groundMat = new StandardMaterial('trainGroundMat', scene);
  groundMat.diffuseColor = Color3.FromHexString('#425733'); // Lush alpine terrain
  groundMat.specularColor = Color3.Black();
  groundMat.roughness = 0.95;
  ground.material = groundMat;
  ground.receiveShadows = true;
  ground.parent = parent;

  // Canyon river running beneath the High Trestle Viaduct
  const river = MeshBuilder.CreateGround('canyonRiver', { width: 75, height: 480 }, scene);
  const riverMat = new StandardMaterial('riverMat', scene);
  riverMat.diffuseColor = Color3.FromHexString('#0284c7');
  riverMat.specularColor = new Color3(0.8, 0.9, 1.0);
  riverMat.roughness = 0.15;
  riverMat.alpha = 0.88;
  river.material = riverMat;
  river.position.set(250, 0.05, -120);
  river.rotation.y = 0.25;
  river.parent = parent;

  // Second valley lake / river crossing
  const riverValley = MeshBuilder.CreateGround('riverValley', { width: 65, height: 350 }, scene);
  riverValley.material = riverMat;
  riverValley.position.set(-310, 0.05, -100);
  riverValley.rotation.y = -0.15;
  riverValley.parent = parent;

  // --- Massive Mountain Range along Tunnel & North Ridge ---
  const mountainGroup = new TransformNode('mountainGroup', scene);
  mountainGroup.parent = parent;

  const mountainMat = new StandardMaterial('mountainRockMat', scene);
  mountainMat.diffuseColor = Color3.FromHexString('#4b5563');
  mountainMat.specularColor = Color3.Black();

  const cliffCoords = [
    // Tunnel mountain massif
    { x: -30, z: -355, r: 48, h: 75 },
    { x: -90, z: -340, r: 52, h: 85 },
    { x: -150, z: -315, r: 46, h: 70 },
    { x: -210, z: -275, r: 40, h: 60 },
    { x: 20, z: -370, r: 45, h: 65 },
    { x: -115, z: -390, r: 55, h: 90 },

    // Viaduct Canyon Cliffs
    { x: 310, z: -80, r: 42, h: 55 },
    { x: 325, z: -160, r: 45, h: 65 },
    { x: 280, z: -230, r: 40, h: 50 },

    // North Ridge Mountains
    { x: -90, z: 290, r: 45, h: 60 },
    { x: -25, z: 320, r: 48, h: 65 },
    { x: 40, z: 300, r: 40, h: 55 }
  ];

  cliffCoords.forEach((c, idx) => {
    const cliff = MeshBuilder.CreateCylinder(`cliff_${idx}`, {
      diameterTop: c.r * 0.35,
      diameterBottom: c.r * 2,
      height: c.h,
      tessellation: 7
    }, scene);
    cliff.material = mountainMat;
    cliff.position.set(c.x, c.h / 2, c.z);
    cliff.parent = mountainGroup;
    shadowGenerator.addShadowCaster(cliff);
    cliff.receiveShadows = true;

    structures.push({
      x: c.x,
      z: c.z,
      radius: c.r * 0.85,
      height: c.h,
      isTree: false
    });
  });

  // --- Stone Tunnel Arch Portals ---
  const portalMat = new StandardMaterial('portalMat', scene);
  portalMat.diffuseColor = Color3.FromHexString('#334155');
  portalMat.specularColor = Color3.Black();

  function buildTunnelPortal(name: string, pos: Vector3, yaw: number) {
    const portalRoot = new TransformNode(name, scene);
    portalRoot.position.copyFrom(pos);
    portalRoot.rotation.y = yaw;
    portalRoot.parent = parent;

    // Left Arch Pillar
    const pLeft = MeshBuilder.CreateBox(`${name}_pLeft`, { width: 2.2, height: 8.5, depth: 5.0 }, scene);
    pLeft.material = portalMat;
    pLeft.position.set(-3.2, 4.25, 0);
    pLeft.parent = portalRoot;
    shadowGenerator.addShadowCaster(pLeft);

    // Right Arch Pillar
    const pRight = MeshBuilder.CreateBox(`${name}_pRight`, { width: 2.2, height: 8.5, depth: 5.0 }, scene);
    pRight.material = portalMat;
    pRight.position.set(3.2, 4.25, 0);
    pRight.parent = portalRoot;
    shadowGenerator.addShadowCaster(pRight);

    // Top Arch Lintel
    const pTop = MeshBuilder.CreateBox(`${name}_pTop`, { width: 8.6, height: 2.6, depth: 5.2 }, scene);
    pTop.material = portalMat;
    pTop.position.set(0, 9.2, 0);
    pTop.parent = portalRoot;
    shadowGenerator.addShadowCaster(pTop);

    structures.push({ x: pos.x - 3.2, z: pos.z, radius: 1.8, height: 10.5, isTree: false });
    structures.push({ x: pos.x + 3.2, z: pos.z, radius: 1.8, height: 10.5, isTree: false });
  }

  // Tunnel Entrance (East) and Exit (West)
  buildTunnelPortal('portalEast', new Vector3(15, 9.5, -290), Math.PI * 0.42);
  buildTunnelPortal('portalWest', new Vector3(-125, 7.5, -285), -Math.PI * 0.35);

  // --- 3D Railway Track Generation ---
  const spline = Curve3.CreateCatmullRomSpline(trainTrackWaypoints, 35, true);
  const pathPoints = spline.getPoints();
  const path3d = new Path3D(pathPoints);
  const totalTrackLength = path3d.getDistances()[path3d.getDistances().length - 1];

  const binormals = path3d.getBinormals();

  // Rails materials
  const railMat = new StandardMaterial('railMat', scene);
  railMat.diffuseColor = Color3.FromHexString('#94a3b8');
  railMat.specularColor = new Color3(0.9, 0.9, 0.9);
  railMat.roughness = 0.2;

  const sleeperMat = new StandardMaterial('sleeperMat', scene);
  sleeperMat.diffuseColor = Color3.FromHexString('#451a03'); // Dark creosote wood
  sleeperMat.specularColor = Color3.Black();

  const ballastMat = new StandardMaterial('ballastMat', scene);
  ballastMat.diffuseColor = Color3.FromHexString('#475569'); // Crushed stone ballast
  ballastMat.roughness = 0.9;

  // Extrude left and right steel rails (gauge width = 1.6m -> ±0.8m offset)
  const leftRailPoints: Vector3[] = [];
  const rightRailPoints: Vector3[] = [];
  const ballastPoints: Vector3[] = [];

  for (let i = 0; i < pathPoints.length; i++) {
    const pt = pathPoints[i];
    const b = binormals[i];
    leftRailPoints.push(pt.add(b.scale(0.8)));
    rightRailPoints.push(pt.add(b.scale(-0.8)));
    ballastPoints.push(new Vector3(pt.x, Math.max(0.1, pt.y - 0.2), pt.z));
  }

  const leftRail = MeshBuilder.CreateTube('leftRail', {
    path: leftRailPoints,
    radius: 0.07,
    tessellation: 6,
    sideOrientation: Mesh.DOUBLESIDE
  }, scene);
  leftRail.material = railMat;
  leftRail.parent = parent;
  shadowGenerator.addShadowCaster(leftRail);

  const rightRail = MeshBuilder.CreateTube('rightRail', {
    path: rightRailPoints,
    radius: 0.07,
    tessellation: 6,
    sideOrientation: Mesh.DOUBLESIDE
  }, scene);
  rightRail.material = railMat;
  rightRail.parent = parent;
  shadowGenerator.addShadowCaster(rightRail);

  // Gravel ballast bed
  const ballastBed = MeshBuilder.CreateTube('ballastBed', {
    path: ballastPoints,
    radius: 1.3,
    tessellation: 6,
    sideOrientation: Mesh.DOUBLESIDE
  }, scene);
  ballastBed.material = ballastMat;
  ballastBed.parent = parent;
  ballastBed.receiveShadows = true;

  // Wooden Railroad Ties (Sleepers) & High Trestle Viaduct Framework
  const sleeperMeshes: Mesh[] = [];
  const bridgePillarMeshes: Mesh[] = [];
  const bridgeMat = new StandardMaterial('trestleBridgeMat', scene);
  bridgeMat.diffuseColor = Color3.FromHexString('#5c3a21'); // Weathered heavy timber
  bridgeMat.specularColor = Color3.Black();

  const sleeperSpacing = 1.8;
  const numSleepers = Math.floor(totalTrackLength / sleeperSpacing);

  for (let s = 0; s < numSleepers; s++) {
    const normDist = (s * sleeperSpacing) / totalTrackLength;
    const pt = path3d.getPointAt(normDist);
    const tan = path3d.getTangentAt(normDist);

    const yaw = Math.atan2(tan.x, tan.z);
    const pitch = -Math.asin(tan.y);

    // Tie box (2.6m wide across the rails)
    const tie = MeshBuilder.CreateBox(`sleeper_${s}`, { width: 2.6, height: 0.18, depth: 0.35 }, scene);
    tie.position.set(pt.x, pt.y - 0.1, pt.z);
    tie.rotation.y = yaw + Math.PI / 2;
    tie.rotation.x = pitch;
    sleeperMeshes.push(tie);

    // Trestle Viaduct Support Towers where track is high above ground (up to 24m!)
    if (pt.y > 4.5 && s % 3 === 0) {
      const pillarHeight = pt.y;
      const pillarLeft = MeshBuilder.CreateCylinder(`bPilL_${s}`, {
        diameter: 0.65,
        height: pillarHeight,
        tessellation: 6
      }, scene);
      pillarLeft.position.set(pt.x + Math.cos(yaw) * 1.6, pillarHeight / 2, pt.z - Math.sin(yaw) * 1.6);
      bridgePillarMeshes.push(pillarLeft);

      const pillarRight = MeshBuilder.CreateCylinder(`bPilR_${s}`, {
        diameter: 0.65,
        height: pillarHeight,
        tessellation: 6
      }, scene);
      pillarRight.position.set(pt.x - Math.cos(yaw) * 1.6, pillarHeight / 2, pt.z + Math.sin(yaw) * 1.6);
      bridgePillarMeshes.push(pillarRight);

      // Horizontal beam collider
      beams.push({
        x1: pillarLeft.position.x,
        z1: pillarLeft.position.z,
        x2: pillarRight.position.x,
        z2: pillarRight.position.z,
        y: pt.y - 0.5,
        thickness: 0.6
      });

      structures.push({
        x: pt.x,
        z: pt.z,
        radius: 2.0,
        height: pillarHeight,
        isTree: false
      });
    }
  }

  // Merge sleepers
  if (sleeperMeshes.length > 0) {
    const mergedSleepers = Mesh.MergeMeshes(sleeperMeshes, true, true, undefined, false, true);
    if (mergedSleepers) {
      mergedSleepers.material = sleeperMat;
      mergedSleepers.parent = parent;
      mergedSleepers.receiveShadows = true;
    }
  }

  // Merge bridge pillars
  if (bridgePillarMeshes.length > 0) {
    const mergedBridge = Mesh.MergeMeshes(bridgePillarMeshes, true, true, undefined, false, true);
    if (mergedBridge) {
      mergedBridge.material = bridgeMat;
      mergedBridge.parent = parent;
      shadowGenerator.addShadowCaster(mergedBridge);
      mergedBridge.receiveShadows = true;
    }
  }

  // --- Train Station & Platform ---
  const stationRoot = new TransformNode('stationRoot', scene);
  stationRoot.position.set(-6.0, 0, 56);
  stationRoot.parent = parent;

  const woodMat = new StandardMaterial('stationWoodMat', scene);
  woodMat.diffuseColor = Color3.FromHexString('#78350f');
  woodMat.specularColor = Color3.Black();

  const roofMat = new StandardMaterial('stationRoofMat', scene);
  roofMat.diffuseColor = Color3.FromHexString('#991b1b'); // Dark rustic red roof
  roofMat.specularColor = Color3.Black();

  // Platform
  const platform = MeshBuilder.CreateBox('platform', { width: 5.0, height: 1.8, depth: 36.0 }, scene);
  platform.material = woodMat;
  platform.position.set(2.5, 0.9, 0);
  platform.parent = stationRoot;
  platform.receiveShadows = true;

  // Station Building
  const stationHouse = MeshBuilder.CreateBox('stationHouse', { width: 7.0, height: 5.5, depth: 16.0 }, scene);
  stationHouse.material = woodMat;
  stationHouse.position.set(-3.0, 2.75, 0);
  stationHouse.parent = stationRoot;
  shadowGenerator.addShadowCaster(stationHouse);
  stationHouse.receiveShadows = true;

  // Pitched Roof
  const stationRoof = MeshBuilder.CreateCylinder('stationRoof', {
    diameterTop: 0.2,
    diameterBottom: 10.0,
    height: 18.0,
    tessellation: 3
  }, scene);
  stationRoof.material = roofMat;
  stationRoof.position.set(-3.0, 6.2, 0);
  stationRoof.rotation.z = Math.PI / 2;
  stationRoof.rotation.y = Math.PI / 2;
  stationRoof.parent = stationRoot;
  shadowGenerator.addShadowCaster(stationRoof);

  // Drone Launch Pad on Station Roof
  const launchPad = MeshBuilder.CreateCylinder('stationLaunchPad', {
    diameter: 3.5,
    height: 0.2,
    tessellation: 16
  }, scene);
  const launchMat = new StandardMaterial('launchMat', scene);
  launchMat.diffuseColor = Color3.FromHexString('#0284c7');
  launchMat.emissiveColor = Color3.FromHexString('#0369a1');
  launchPad.material = launchMat;
  launchPad.position.set(-3.0, 6.6, 0);
  launchPad.parent = stationRoot;

  structures.push({
    x: -9.0,
    z: 56,
    radius: 4.5,
    height: 8.5,
    isTree: false
  });

  // --- Pine Forest Trees across the 2km Landscape ---
  const pineCoords = [
    { x: 40, z: -20 }, { x: 70, z: -50 }, { x: 120, z: -10 },
    { x: 180, z: -80 }, { x: 230, z: -160 }, { x: 160, z: -220 },
    { x: 80, z: -280 }, { x: 10, z: -310 }, { x: -60, z: -250 },
    { x: -130, z: -210 }, { x: -210, z: -160 }, { x: -270, z: -100 },
    { x: -290, z: -20 }, { x: -270, z: 60 }, { x: -220, z: 140 },
    { x: -160, z: 180 }, { x: -80, z: 240 }, { x: 20, z: 240 },
    { x: 80, z: 140 }, { x: 40, z: 90 }, { x: -50, z: 50 },
    { x: -140, z: 80 }, { x: -200, z: 10 }, { x: -240, z: -70 }
  ];

  const pineTrunkMat = new StandardMaterial('pineTrunkMat', scene);
  pineTrunkMat.diffuseColor = Color3.FromHexString('#3e2723');
  pineTrunkMat.specularColor = Color3.Black();

  const pineFoliageMat = new StandardMaterial('pineFoliageMat', scene);
  pineFoliageMat.diffuseColor = Color3.FromHexString('#14321a');
  pineFoliageMat.specularColor = Color3.Black();

  pineCoords.forEach((c, idx) => {
    const treeNode = new TransformNode(`pine_${idx}`, scene);
    treeNode.position.set(c.x, 0, c.z);
    treeNode.parent = parent;

    const trunk = MeshBuilder.CreateCylinder(`pineTrunk_${idx}`, {
      diameterTop: 0.6,
      diameterBottom: 1.0,
      height: 9.0,
      tessellation: 6
    }, scene);
    trunk.material = pineTrunkMat;
    trunk.position.y = 4.5;
    trunk.parent = treeNode;
    shadowGenerator.addShadowCaster(trunk);

    const foliage = MeshBuilder.CreateCylinder(`pineFoliage_${idx}`, {
      diameterTop: 0,
      diameterBottom: 8.0,
      height: 15.0,
      tessellation: 6
    }, scene);
    foliage.material = pineFoliageMat;
    foliage.position.y = 13.0;
    foliage.parent = treeNode;
    shadowGenerator.addShadowCaster(foliage);

    structures.push({
      x: c.x,
      z: c.z,
      radius: 4.0,
      height: 20.0,
      isTree: true,
      foliageStartY: 5.5,
      trunkRadius: 0.5
    });
  });

  // --- 3D MOVING TRAIN (5 CARS: ENGINE, TENDER, COACH 1, FREIGHT, CABOOSE) ---
  const trainRoot = new TransformNode('trainRoot', scene);
  trainRoot.parent = parent;

  const trainCars: TrainCar[] = [];

  // Materials
  const ironMat = new StandardMaterial('ironMat', scene);
  ironMat.diffuseColor = Color3.FromHexString('#1e293b'); // Steam iron black
  ironMat.specularColor = new Color3(0.3, 0.3, 0.3);
  ironMat.roughness = 0.4;

  const brassMat = new StandardMaterial('brassMat', scene);
  brassMat.diffuseColor = Color3.FromHexString('#d97706'); // Brass gold
  brassMat.specularColor = new Color3(0.9, 0.8, 0.3);
  brassMat.roughness = 0.2;

  const passengerMat = new StandardMaterial('passengerMat', scene);
  passengerMat.diffuseColor = Color3.FromHexString('#7f1d1d'); // Burgundy coach
  passengerMat.specularColor = new Color3(0.4, 0.4, 0.4);

  const freightMat = new StandardMaterial('freightMat', scene);
  freightMat.diffuseColor = Color3.FromHexString('#0369a1'); // Freight blue container
  freightMat.specularColor = new Color3(0.3, 0.3, 0.3);

  const cabooseMat = new StandardMaterial('cabooseMat', scene);
  cabooseMat.diffuseColor = Color3.FromHexString('#b91c1c'); // Classic bright caboose red
  cabooseMat.specularColor = new Color3(0.5, 0.5, 0.5);

  const wheelMat = new StandardMaterial('wheelMat', scene);
  wheelMat.diffuseColor = Color3.FromHexString('#0f172a');
  wheelMat.specularColor = Color3.White();

  // 1. LOCOMOTIVE ENGINE
  const locoNode = new TransformNode('locomotive', scene);
  locoNode.parent = trainRoot;

  const boiler = MeshBuilder.CreateCylinder('boiler', {
    diameter: 2.2,
    height: 6.2,
    tessellation: 16
  }, scene);
  boiler.material = ironMat;
  boiler.rotation.x = Math.PI / 2;
  boiler.position.set(0, 2.0, 1.2);
  boiler.parent = locoNode;
  shadowGenerator.addShadowCaster(boiler);

  [-0.8, 1.0, 2.8].forEach((zPos, ringIdx) => {
    const ring = MeshBuilder.CreateTorus(`boilerRing_${ringIdx}`, {
      diameter: 2.26,
      thickness: 0.08,
      tessellation: 16
    }, scene);
    ring.material = brassMat;
    ring.rotation.x = Math.PI / 2;
    ring.position.set(0, 2.0, zPos);
    ring.parent = locoNode;
  });

  const cab = MeshBuilder.CreateBox('cab', { width: 2.6, height: 3.2, depth: 3.0 }, scene);
  cab.material = ironMat;
  cab.position.set(0, 2.6, -2.4);
  cab.parent = locoNode;
  shadowGenerator.addShadowCaster(cab);

  const cowcatcher = MeshBuilder.CreateCylinder('cowcatcher', {
    diameterTop: 0,
    diameterBottom: 2.8,
    height: 1.5,
    tessellation: 3
  }, scene);
  cowcatcher.material = ironMat;
  cowcatcher.position.set(0, 0.8, 4.6);
  cowcatcher.rotation.x = Math.PI / 2;
  cowcatcher.parent = locoNode;

  const smokestack = MeshBuilder.CreateCylinder('smokestack', {
    diameterTop: 0.7,
    diameterBottom: 0.5,
    height: 1.4,
    tessellation: 12
  }, scene);
  smokestack.material = ironMat;
  smokestack.position.set(0, 3.6, 3.4);
  smokestack.parent = locoNode;

  const headlight = MeshBuilder.CreateCylinder('headlight', {
    diameter: 0.9,
    height: 0.8,
    tessellation: 12
  }, scene);
  const headMat = new StandardMaterial('headMat', scene);
  headMat.emissiveColor = new Color3(1.0, 0.95, 0.7); // Glowing bright headlight
  headlight.material = headMat;
  headlight.position.set(0, 2.6, 4.4);
  headlight.rotation.x = Math.PI / 2;
  headlight.parent = locoNode;

  [-1.5, 0.5, 2.5].forEach((wz, wi) => {
    [-1.2, 1.2].forEach((wx, wside) => {
      const wheel = MeshBuilder.CreateCylinder(`wheel_${wi}_${wside}`, {
        diameter: 1.5,
        height: 0.22,
        tessellation: 12
      }, scene);
      wheel.material = wheelMat;
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(wx, 0.75, wz);
      wheel.parent = locoNode;
    });
  });

  trainCars.push({
    root: locoNode,
    length: 8.5,
    width: 2.8,
    height: 4.2,
    offsetFromEngine: 0
  });

  // 2. COAL TENDER
  const tenderNode = new TransformNode('tender', scene);
  tenderNode.parent = trainRoot;

  const tenderBody = MeshBuilder.CreateBox('tenderBody', { width: 2.6, height: 2.2, depth: 5.5 }, scene);
  tenderBody.material = ironMat;
  tenderBody.position.set(0, 1.8, 0);
  tenderBody.parent = tenderNode;
  shadowGenerator.addShadowCaster(tenderBody);

  const coal = MeshBuilder.CreateBox('coal', { width: 2.2, height: 0.8, depth: 4.8 }, scene);
  const coalMat = new StandardMaterial('coalMat', scene);
  coalMat.diffuseColor = Color3.FromHexString('#09090b');
  coal.material = coalMat;
  coal.position.set(0, 2.7, 0);
  coal.parent = tenderNode;

  trainCars.push({
    root: tenderNode,
    length: 6.0,
    width: 2.6,
    height: 3.2,
    offsetFromEngine: 8.0
  });

  // 3. PASSENGER COACH 1
  const coach1Node = new TransformNode('coach1', scene);
  coach1Node.parent = trainRoot;

  const coach1Body = MeshBuilder.CreateBox('coach1Body', { width: 2.6, height: 2.8, depth: 9.0 }, scene);
  coach1Body.material = passengerMat;
  coach1Body.position.set(0, 2.2, 0);
  coach1Body.parent = coach1Node;
  shadowGenerator.addShadowCaster(coach1Body);

  const coach1Roof = MeshBuilder.CreateCylinder('coach1Roof', {
    diameter: 2.8,
    height: 9.2,
    tessellation: 12
  }, scene);
  coach1Roof.material = ironMat;
  coach1Roof.rotation.x = Math.PI / 2;
  coach1Roof.position.set(0, 3.4, 0);
  coach1Roof.parent = coach1Node;

  trainCars.push({
    root: coach1Node,
    length: 9.5,
    width: 2.8,
    height: 3.6,
    offsetFromEngine: 17.5
  });

  // 4. FREIGHT CONTAINER CAR
  const freightNode = new TransformNode('freightCar', scene);
  freightNode.parent = trainRoot;

  const flatbed = MeshBuilder.CreateBox('flatbed', { width: 2.6, height: 0.6, depth: 9.0 }, scene);
  flatbed.material = ironMat;
  flatbed.position.set(0, 1.0, 0);
  flatbed.parent = freightNode;

  const container1 = MeshBuilder.CreateBox('container1', { width: 2.4, height: 2.5, depth: 4.2 }, scene);
  container1.material = freightMat;
  container1.position.set(0, 2.4, 2.1);
  container1.parent = freightNode;
  shadowGenerator.addShadowCaster(container1);

  const container2 = MeshBuilder.CreateBox('container2', { width: 2.4, height: 2.5, depth: 4.2 }, scene);
  const cont2Mat = new StandardMaterial('cont2Mat', scene);
  cont2Mat.diffuseColor = Color3.FromHexString('#ea580c'); // Orange freight container
  container2.material = cont2Mat;
  container2.position.set(0, 2.4, -2.1);
  container2.parent = freightNode;
  shadowGenerator.addShadowCaster(container2);

  trainCars.push({
    root: freightNode,
    length: 9.5,
    width: 2.6,
    height: 3.8,
    offsetFromEngine: 28.5
  });

  // 5. CLASSIC RED CABOOSE (TAIL CAR)
  const cabooseNode = new TransformNode('caboose', scene);
  cabooseNode.parent = trainRoot;

  const cabooseBody = MeshBuilder.CreateBox('cabooseBody', { width: 2.6, height: 2.6, depth: 7.5 }, scene);
  cabooseBody.material = cabooseMat;
  cabooseBody.position.set(0, 2.1, 0);
  cabooseBody.parent = cabooseNode;
  shadowGenerator.addShadowCaster(cabooseBody);

  // Cupola (lookout tower on roof)
  const cupola = MeshBuilder.CreateBox('cupola', { width: 2.2, height: 1.2, depth: 2.6 }, scene);
  cupola.material = cabooseMat;
  cupola.position.set(0, 3.8, 0.5);
  cupola.parent = cabooseNode;

  // Rear red tail lamps
  [-1.1, 1.1].forEach((lx, li) => {
    const lamp = MeshBuilder.CreateSphere(`tailLamp_${li}`, { diameter: 0.35 }, scene);
    const redLampMat = new StandardMaterial(`lampMat_${li}`, scene);
    redLampMat.emissiveColor = new Color3(1.0, 0.1, 0.1);
    lamp.material = redLampMat;
    lamp.position.set(lx, 2.5, -3.8);
    lamp.parent = cabooseNode;
  });

  trainCars.push({
    root: cabooseNode,
    length: 8.0,
    width: 2.6,
    height: 4.2,
    offsetFromEngine: 39.5
  });

  // --- SMOKE PUFF PARTICLES ---
  const smokePuffs: SmokePuff[] = [];
  const maxPuffs = 30;
  const smokeMat = new StandardMaterial('smokeMat', scene);
  smokeMat.diffuseColor = new Color3(0.9, 0.9, 0.9);
  smokeMat.alpha = 0.45;
  smokeMat.disableLighting = true;

  for (let p = 0; p < maxPuffs; p++) {
    const puff = MeshBuilder.CreateSphere(`smoke_${p}`, { diameter: 0.9, segments: 4 }, scene);
    puff.material = smokeMat;
    puff.isVisible = false;
    puff.parent = parent;
    smokePuffs.push({
      mesh: puff,
      velocity: Vector3.Zero(),
      life: 0,
      maxLife: 2.5
    });
  }

  // --- TRAIN ANIMATION CONTROLLER ---
  let trainDistance = 75.0; // Starting position on track ahead of station
  const trainSpeed = 10.0; // ~36 km/h authentic mountain steam train cruising speed
  let smokeSpawnTimer = 0;

  function updateTrain(dt: number): CrateCollider[] {
    trainDistance = (trainDistance + trainSpeed * dt) % totalTrackLength;

    dynamicTrainColliders = [];

    // Update each car position & orientation along track
    trainCars.forEach((car) => {
      const carDist = (trainDistance - car.offsetFromEngine + totalTrackLength * 10) % totalTrackLength;
      const norm = carDist / totalTrackLength;

      const pos = path3d.getPointAt(norm);
      const tan = path3d.getTangentAt(norm);

      car.root.position.copyFrom(pos);

      const yaw = Math.atan2(tan.x, tan.z);
      const pitch = -Math.asin(tan.y);
      car.root.rotation.y = yaw;
      car.root.rotation.x = pitch;

      // Dynamic AABB Collider for drone crash detection
      const pad = car.width * 0.55;
      const padL = car.length * 0.5;
      dynamicTrainColliders.push({
        minX: pos.x - pad,
        maxX: pos.x + pad,
        minY: pos.y,
        maxY: pos.y + car.height,
        minZ: pos.z - padL,
        maxZ: pos.z + padL
      });
    });

    // Update Smoke Particles
    smokeSpawnTimer += dt;
    if (smokeSpawnTimer >= 0.07) {
      smokeSpawnTimer = 0;
      const inactivePuff = smokePuffs.find(p => !p.mesh.isVisible);
      if (inactivePuff) {
        const stackWorldPos = smokestack.getAbsolutePosition();
        inactivePuff.mesh.position.copyFrom(stackWorldPos);
        inactivePuff.mesh.scaling.setAll(0.8);
        inactivePuff.mesh.isVisible = true;
        inactivePuff.life = inactivePuff.maxLife;

        const trainTan = path3d.getTangentAt(trainDistance / totalTrackLength);
        inactivePuff.velocity.set(
          -trainTan.x * 7 + (Math.random() - 0.5) * 1.5,
          2.8 + Math.random() * 2.0,
          -trainTan.z * 7 + (Math.random() - 0.5) * 1.5
        );
      }
    }

    smokePuffs.forEach(p => {
      if (!p.mesh.isVisible) return;
      p.life -= dt;
      if (p.life <= 0) {
        p.mesh.isVisible = false;
        return;
      }
      p.mesh.position.addInPlace(p.velocity.scale(dt));
      const progress = 1 - p.life / p.maxLife;
      p.mesh.scaling.setAll(0.8 + progress * 3.8);
    });

    return dynamicTrainColliders;
  }

  function disposeEnvironment() {
    smokePuffs.forEach(p => p.mesh.dispose());
  }

  return {
    structures,
    beams,
    crates: [],
    update: updateTrain,
    dispose: disposeEnvironment
  };
}
