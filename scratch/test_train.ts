import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { buildTrainEnvironment } from '../src/world/TrainEnvironment';

const engine = new NullEngine();
const scene = new Scene(engine);
const parent = new TransformNode('testParent', scene);
const dirLight = new DirectionalLight('sun', new Vector3(0, -1, 0), scene);
const shadowGen = new ShadowGenerator(512, dirLight);

try {
  console.log('Building train environment...');
  const env = buildTrainEnvironment(scene, parent, shadowGen);
  console.log('SUCCESS! Structures:', env.structures.length);
  const colliders = env.update(0.016);
  console.log('Update success! Colliders:', colliders.length);
} catch (e) {
  console.error('ERROR in buildTrainEnvironment:', e);
}
process.exit(0);
