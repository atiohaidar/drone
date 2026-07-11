/**
 * Outdoor forest arena environment.
 * Sky dome, ground plane, trees, mountain, and laser beams.
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
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import type { CollisionStructure, BeamData } from '../drone/CollisionSystem';

/** Build the outdoor forest arena. Returns collision data arrays. */
export function buildOutdoorEnvironment(
  scene: Scene,
  parent: TransformNode,
  shadowGenerator: ShadowGenerator
): { structures: CollisionStructure[]; beams: BeamData[] } {
  const structures: CollisionStructure[] = [];
  const beams: BeamData[] = [];

  // Fog
  scene.fogMode = Scene.FOGMODE_EXP2;
  scene.fogDensity = 0.005;
  scene.fogColor = Color3.FromHexString('#e0f2fe');
  scene.clearColor.set(0.878, 0.949, 0.996, 1.0);

  // --- Sky Dome ---
  // Register custom shader
  Effect.ShadersStore['skyVertexShader'] = `
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
  Effect.ShadersStore['skyFragmentShader'] = `
    precision highp float;
    uniform vec3 topColor;
    uniform vec3 bottomColor;
    uniform float offset;
    uniform float exponent;
    varying vec3 vWorldPosition;
    void main() {
      float h = normalize(vWorldPosition + offset).y;
      gl_FragColor = vec4(mix(bottomColor, topColor, max(pow(max(h, 0.0), exponent), 0.0)), 1.0);
    }
  `;

  const skyMat = new ShaderMaterial('skyMat', scene, {
    vertex: 'sky',
    fragment: 'sky',
  }, {
    attributes: ['position'],
    uniforms: ['worldViewProjection', 'world', 'topColor', 'bottomColor', 'offset', 'exponent'],
  });
  skyMat.setVector3('topColor', new Vector3(0.280, 0.400, 0.520));
  skyMat.setVector3('bottomColor', new Vector3(0.925, 0.933, 0.941));
  skyMat.setFloat('offset', 33);
  skyMat.setFloat('exponent', 0.6);
  skyMat.backFaceCulling = false;

  const sky = MeshBuilder.CreateSphere('sky', { diameter: 1200, segments: 32 }, scene);
  sky.material = skyMat;
  sky.parent = parent;

  // --- Ground ---
  const groundSize = 1000;
  const ground = MeshBuilder.CreateGround('ground', { width: groundSize, height: groundSize }, scene);
  const groundMat = new StandardMaterial('groundMat', scene);
  groundMat.diffuseColor = Color3.FromHexString('#3e6538');
  groundMat.specularColor = Color3.Black();
  groundMat.roughness = 0.95;
  ground.material = groundMat;
  ground.receiveShadows = true;
  ground.parent = parent;

  // --- Grid overlay ---
  const gridLines = MeshBuilder.CreateGround('gridOverlay', { width: groundSize, height: groundSize, subdivisions: 100 }, scene);
  const gridMat = new StandardMaterial('gridMat', scene);
  gridMat.wireframe = true;
  gridMat.diffuseColor = Color3.White();
  gridMat.alpha = 0.08;
  gridLines.material = gridMat;
  gridLines.position.y = 0.02;
  gridLines.parent = parent;

  // --- Trees ---
  const treeCoords = [
    { x: 30, z: -50 }, { x: -50, z: -100 }, { x: -20, z: -40 },
    { x: 90, z: -80 }, { x: 120, z: -30 }, { x: 60, z: 20 },
    { x: 0, z: 40 }, { x: -60, z: 80 }, { x: -120, z: 10 },
    { x: -90, z: -70 }, { x: 10, z: -60 }, { x: 50, z: -90 },
    { x: 55, z: 10 }, { x: -60, z: 55 }, { x: -75, z: -30 }
  ];

  const trunkMat = new StandardMaterial('trunkMat', scene);
  trunkMat.diffuseColor = Color3.FromHexString('#5c4033');
  trunkMat.specularColor = Color3.Black();

  const foliageColors = ['#14321a', '#1f441e', '#224d21', '#2d5a27'];
  const foliageMats = foliageColors.map((c, i) => {
    const mat = new StandardMaterial(`foliageMat${i}`, scene);
    mat.diffuseColor = Color3.FromHexString(c);
    mat.specularColor = Color3.Black();
    return mat;
  });

  treeCoords.forEach((coord, idx) => {
    const treeNode = new TransformNode(`tree${idx}`, scene);
    treeNode.position.set(coord.x, 0, coord.z);
    treeNode.parent = parent;

    const seed = Math.sin(idx + 1) * 10000;
    const frac = seed - Math.floor(seed);

    const trunkHeight = 12 + frac * 8;
    const trunkRadius = 0.8 + frac * 0.4;

    // Trunk
    const trunk = MeshBuilder.CreateCylinder(`trunk${idx}`, {
      diameterTop: trunkRadius * 0.8 * 2,
      diameterBottom: trunkRadius * 2,
      height: trunkHeight,
      tessellation: 8
    }, scene);
    trunk.material = trunkMat;
    trunk.position.y = trunkHeight / 2;
    trunk.parent = treeNode;
    shadowGenerator.addShadowCaster(trunk);
    trunk.receiveShadows = true;

    // Foliage cones
    const coneLayers = 4;
    const foliageHeight = 18 + frac * 10;
    const foliageBaseRadius = 7.0 + frac * 4.0;
    const foliageMat = foliageMats[idx % foliageMats.length];

    for (let layer = 0; layer < coneLayers; layer++) {
      const layerRadius = foliageBaseRadius * (1 - layer * 0.22);
      const layerHeight = foliageHeight * (1 - layer * 0.12);
      const cone = MeshBuilder.CreateCylinder(`cone${idx}_${layer}`, {
        diameterTop: 0,
        diameterBottom: layerRadius * 2,
        height: layerHeight,
        tessellation: 8
      }, scene);
      cone.material = foliageMat;
      cone.position.y = trunkHeight + (layer * layerHeight * 0.4);
      cone.parent = treeNode;
      shadowGenerator.addShadowCaster(cone);
      cone.receiveShadows = true;
    }

    treeNode.rotation.y = frac * Math.PI * 2;

    // Collision data
    const lastLayerIdx = coneLayers - 1;
    const lastLayerHeight = foliageHeight * (1 - lastLayerIdx * 0.12);
    const lastLayerY = trunkHeight + (lastLayerIdx * lastLayerHeight * 0.4);
    const totalHeight = lastLayerY + lastLayerHeight / 2;

    structures.push({
      x: coord.x,
      z: coord.z,
      radius: foliageBaseRadius,
      height: totalHeight,
      isTree: true,
      foliageStartY: trunkHeight - foliageHeight / 2,
      trunkRadius: trunkRadius
    });
  });

  // --- Mountain ---
  const mountain = MeshBuilder.CreateCylinder('mountain', {
    diameterTop: 0,
    diameterBottom: 50,
    height: 140,
    tessellation: 5
  }, scene);
  const mountainMat = new StandardMaterial('mountainMat', scene);
  mountainMat.diffuseColor = Color3.FromHexString('#5a6358');
  mountainMat.specularColor = Color3.Black();
  mountain.material = mountainMat;
  mountain.position.set(0, 70, -160);
  mountain.rotation.y = 0.5;
  mountain.parent = parent;
  shadowGenerator.addShadowCaster(mountain);
  mountain.receiveShadows = true;

  structures.push({ x: 0, z: -160, radius: 22, height: 140, isTree: false });

  // --- Laser Beams ---
  const beamMat = new StandardMaterial('beamMat', scene);
  beamMat.diffuseColor = Color3.FromHexString('#c2410c');
  beamMat.emissiveColor = Color3.FromHexString('#c2410c');
  beamMat.alpha = 0.7;

  const beamsData: BeamData[] = [
    { x1: 10, z1: -60, x2: 30, z2: -50, y: 14, thickness: 0.8 },
    { x1: -50, z1: -100, x2: -90, z2: -70, y: 22, thickness: 0.8 },
    { x1: -60, z1: 55, x2: -60, z2: 80, y: 18, thickness: 0.8 },
    { x1: 0, z1: 40, x2: 55, z2: 10, y: 22, thickness: 0.8 },
    { x1: 60, z1: 20, x2: 55, z2: 10, y: 12, thickness: 0.8 },
    { x1: 30, z1: -50, x2: 90, z2: -80, y: 25, thickness: 0.8 },
    { x1: -20, z1: -40, x2: 0, z2: 40, y: 10, thickness: 0.8 },
    { x1: -120, z1: 10, x2: -75, z2: -30, y: 14, thickness: 0.8 }
  ];

  beamsData.forEach((b, i) => {
    const p1 = new Vector3(b.x1, b.y, b.z1);
    const p2 = new Vector3(b.x2, b.y, b.z2);
    const direction = p2.subtract(p1);
    const length = direction.length();
    const midpoint = p1.add(p2).scale(0.5);

    const beam = MeshBuilder.CreateCylinder(`beam${i}`, {
      diameter: b.thickness * 2,
      height: length,
      tessellation: 8
    }, scene);
    beam.material = beamMat;
    beam.position.copyFrom(midpoint);

    // Orient the cylinder to point from p1 to p2
    const dir = direction.normalize();
    const up = Vector3.Up();
    const right = Vector3.Cross(up, dir).normalize();
    const correctedUp = Vector3.Cross(dir, right);
    beam.rotationQuaternion = null;

    // Use lookAt approach: place a dummy target
    const angle = Math.acos(Vector3.Dot(Vector3.Up(), dir));
    const axis = Vector3.Cross(Vector3.Up(), dir).normalize();
    if (axis.length() > 0.001) {
      beam.rotationQuaternion = null;
      // Simple: calculate pitch and yaw
      const dx = direction.x;
      const dy = direction.y;
      const dz = direction.z;
      const horizontalLength = Math.sqrt(dx * dx + dz * dz);
      beam.rotation.x = Math.atan2(horizontalLength, dy) - Math.PI / 2;
      beam.rotation.y = Math.atan2(dx, dz);
      beam.rotation.z = 0;
      // Actually for a horizontal beam (dy=0), we need: 
      // rotate the cylinder (which is vertical by default) to lie along the direction
      beam.rotation.x = Math.PI / 2; // lay horizontal
      beam.rotation.y = Math.atan2(dx, dz);
    }

    beam.parent = parent;
    beams.push(b);
  });

  return { structures, beams };
}
