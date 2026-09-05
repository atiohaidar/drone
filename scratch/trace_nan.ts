import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';
import { NullEngine } from '@babylonjs/core/Engines/nullEngine';
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { Vector3 } from '@babylonjs/core/Maths/math';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';

import { GameStateManager } from '../src/core/GameStateManager';
import { DronePhysics } from '../src/drone/DronePhysics';
import { buildDroneModel } from '../src/drone/DroneModel';
import { buildTrainEnvironment } from '../src/world/TrainEnvironment';
import { buildCheckpoints, checkCheckpointTrigger } from '../src/world/Checkpoints';
import { CameraController } from '../src/drone/CameraController';
import { CollisionSystem } from '../src/drone/CollisionSystem';

const engine = new NullEngine();
const scene = new Scene(engine);
const camera = new FreeCamera('mainCamera', new Vector3(0, 7, 10), scene);
const pipCamera = new FreeCamera('pipCamera', new Vector3(0, 0, 0), scene);
scene.activeCameras = [camera, pipCamera];

// @ts-ignore
global.document = {
  getElementById: () => ({ classList: { toggle: () => {}, add: () => {}, remove: () => {} }, innerText: '', style: {} })
};
// @ts-ignore
global.window = {};

const dirLight = new DirectionalLight('sun', new Vector3(0, -1, 0), scene);
const shadowGen = new ShadowGenerator(512, dirLight);

const stateManager = new GameStateManager();
stateManager.setEnvironment('train');
stateManager.startGame();

const physics = new DronePhysics();
physics.reset('train');

console.log('After reset: Drone pos:', physics.position.toString(), 'velocity:', physics.velocity.toString());

const droneModel = buildDroneModel(scene, shadowGen);
const cameraController = new CameraController(camera, pipCamera);
const collisionSystem = new CollisionSystem(scene);

const activeEnvNode = new TransformNode('activeEnv', scene);
const trainData = buildTrainEnvironment(scene, activeEnvNode, shadowGen);
const cpData = buildCheckpoints(scene, stateManager.courseCheckpoints, 'train');

const dt = 0.016;
const crateColliders = trainData.update(dt);
console.log('After trainData.update: colliders count:', crateColliders.length);

physics.update(
  dt,
  { throttle: 0, yaw: 0, pitch: 0, roll: 0, camera: 0 },
  stateManager.activeEnvironment,
  stateManager.isPlaying,
  droneModel
);
console.log('After physics.update: Drone pos:', physics.position.toString(), 'velocity:', physics.velocity.toString());

collisionSystem.checkCollisions(
  physics.position,
  physics.velocity,
  stateManager.activeEnvironment,
  trainData.structures,
  trainData.beams,
  crateColliders
);
console.log('After collisionSystem.checkCollisions: Drone pos:', physics.position.toString(), 'velocity:', physics.velocity.toString());

process.exit(0);
