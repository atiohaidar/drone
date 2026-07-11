/**
 * Application entry point for the DJI FPV Drone simulator.
 * Integrates Babylon.js scene, input management, physics, collision detection, and UI.
 */
import { buildScene } from './world/SceneBuilder';
import { InputManager } from './core/InputManager';
import { GameStateManager, formatTime } from './core/GameStateManager';
import { DronePhysics } from './drone/DronePhysics';
import { buildDroneModel, DroneModelData } from './drone/DroneModel';
import { buildOutdoorEnvironment } from './world/OutdoorEnvironment';
import { buildIndoorEnvironment } from './world/IndoorEnvironment';
import { buildCheckpoints, updateCheckpointHighlight, checkCheckpointTrigger, CheckpointData } from './world/Checkpoints';
import { CameraController } from './drone/CameraController';
import { CollisionSystem, CollisionStructure, BeamData, CrateCollider } from './drone/CollisionSystem';
import { HUD } from './ui/HUD';
import { showStartScreen, hideAllScreens } from './ui/Screens';
import { createIcons, Rocket, Mountain, Home, TriangleAlert, Trophy } from 'lucide';

import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { LinesMesh } from '@babylonjs/core/Meshes/linesMesh';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';

// State references
let activeEnvironmentNode: TransformNode | null = null;
let activeCheckpoints: CheckpointData[] = [];
let pathLines: LinesMesh | null = null;

let collisionStructures: CollisionStructure[] = [];
let collisionBeams: BeamData[] = [];
let crateColliders: CrateCollider[] = [];

// Smoothed Camera Pitch holder (passed by reference)
const smoothedCameraPitch = { value: 0 };

let startOverlayEl: HTMLElement | null = null;
let controlDetectedEl: HTMLElement | null = null;
let timerHudEl: HTMLElement | null = null;

window.addEventListener('DOMContentLoaded', () => {
  createIcons({
    icons: {
      Rocket,
      Mountain,
      Home,
      TriangleAlert,
      Trophy,
    },
    attrs: {
      class: 'lucide-icon',
      'stroke-width': '2',
    },
  });

  const canvas = document.getElementById('renderCanvas') as HTMLCanvasElement;
  if (!canvas) {
    console.error('Render canvas not found!');
    return;
  }

  // 1. Initialize core systems
  const sceneCtx = buildScene(canvas);
  const inputManager = new InputManager();
  const stateManager = new GameStateManager();
  const physics = new DronePhysics();
  const hud = new HUD();
  const collisionSystem = new CollisionSystem(sceneCtx.scene);
  const cameraController = new CameraController(sceneCtx.camera);

  // 2. Build drone model
  const droneModel = buildDroneModel(sceneCtx.scene, sceneCtx.shadowGenerator);

  // 3. Environment building helper
  function loadEnvironment(env: 'outdoor' | 'indoor') {
    // Clean up old environment node
    if (activeEnvironmentNode) {
      activeEnvironmentNode.dispose();
      activeEnvironmentNode = null;
    }
    // Clean up checkpoints
    activeCheckpoints.forEach(cp => {
      cp.group.dispose();
    });
    activeCheckpoints = [];
    if (pathLines) {
      pathLines.dispose();
      pathLines = null;
    }

    // Create a new parent node for environment
    activeEnvironmentNode = new TransformNode('activeEnvironment', sceneCtx.scene);

    if (env === 'outdoor') {
      const data = buildOutdoorEnvironment(sceneCtx.scene, activeEnvironmentNode, sceneCtx.shadowGenerator);
      collisionStructures = data.structures;
      collisionBeams = data.beams;
      crateColliders = [];
    } else {
      const data = buildIndoorEnvironment(sceneCtx.scene, activeEnvironmentNode, sceneCtx.shadowGenerator);
      collisionStructures = data.structures;
      collisionBeams = data.beams;
      crateColliders = data.crates;
    }

    // Build checkpoints
    const cpData = buildCheckpoints(sceneCtx.scene, stateManager.courseCheckpoints, env);
    activeCheckpoints = cpData.checkpoints;
    pathLines = cpData.pathLine;

    // Merge environment colliders with checkpoint pole colliders for this load only.
    collisionStructures = collisionStructures.concat(cpData.structures);

    // Reset physics state
    physics.reset(env);
    stateManager.activeCheckpointIndex = 0;
    updateCheckpointHighlight(activeCheckpoints, 0, stateManager.courseCheckpoints.length);
  }

  // Load initial environment
  loadEnvironment(stateManager.activeEnvironment);

  // 4. Input callbacks and bindings
  inputManager.onPhotoButton(() => {
    cameraController.cycleMode();
  });

  inputManager.onFnButton(() => {
    resetGame();
  });

  inputManager.connectWebSocket();
  inputManager.initKeyboard();

  // Button Action Bindings
  document.getElementById('btn-start')?.addEventListener('click', () => {
    stateManager.startGame();
  });

  document.getElementById('btn-retry')?.addEventListener('click', () => {
    resetGame();
  });

  document.getElementById('btn-fly-again')?.addEventListener('click', () => {
    resetGame();
  });

  document.getElementById('btn-restart')?.addEventListener('click', () => {
    resetGame();
  });

  document.getElementById('btn-dashboard')?.addEventListener('click', () => {
    window.location.href = 'dashboard.html';
  });

  const btnEnvOutdoor = document.getElementById('btn-env-outdoor');
  const btnEnvIndoor = document.getElementById('btn-env-indoor');

  btnEnvOutdoor?.addEventListener('click', () => {
    stateManager.setEnvironment('outdoor');
    loadEnvironment('outdoor');
  });

  btnEnvIndoor?.addEventListener('click', () => {
    stateManager.setEnvironment('indoor');
    loadEnvironment('indoor');
  });

  function resetGame() {
    stateManager.startGame();
    physics.reset(stateManager.activeEnvironment);
    updateCheckpointHighlight(activeCheckpoints, 0, stateManager.courseCheckpoints.length);
  }

  // Show start screen initial state
  startOverlayEl = document.getElementById('screen-start');
  controlDetectedEl = document.getElementById('control-detected');
  timerHudEl = document.getElementById('timer-hud');
  showStartScreen('Checking connection...', stateManager.activeEnvironment);

  // 5. Main Render Loop
  let lastTime = performance.now();

  sceneCtx.engine.runRenderLoop(() => {
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000.0, 0.1);
    lastTime = now;

    // Update screen overlays & control text detection
    let controlText = 'Keyboard controls ready';
    if (inputManager['isControllerActive']) {
      controlText = 'Controller connected and ready';
    } else if (inputManager['isConnected']) {
      controlText = 'Controller connected, waiting for remote power';
    }
    if (startOverlayEl && !startOverlayEl.classList.contains('hidden')) {
      if (controlDetectedEl) controlDetectedEl.innerText = controlText;
    }

    // Update timer on HUD
    if (stateManager.isPlaying) {
      const elapsedSec = (now - stateManager.timerStart) / 1000;
      if (timerHudEl) timerHudEl.innerText = formatTime(elapsedSec);
    }

    // Update input managers
    inputManager.updateFromKeyboard();
    hud.updateInputs(inputManager.inputs);
    hud.updateTelemetry(physics.velocity.length(), Math.max(0, physics.position.y), inputManager.inputs.yaw * 8);

    // Update physics
    const damage = physics.update(
      dt,
      inputManager.inputs,
      stateManager.activeEnvironment,
      stateManager.isPlaying,
      droneModel
    );

    if (damage > 0 && stateManager.isPlaying) {
      collisionSystem.triggerSparks(physics.position);
      const isDead = stateManager.applyDamage(damage);
      if (isDead) {
        // Drone crashed! Game over modal shown in stateManager.handleCrash
      }
    }

    hud.updateShieldHealth(stateManager.shieldHealth);

    // Collisions
    if (stateManager.isPlaying) {
      const collDamage = collisionSystem.checkCollisions(
        physics.position,
        physics.velocity,
        stateManager.activeEnvironment,
        collisionStructures,
        collisionBeams,
        crateColliders
      );

      if (collDamage > 0) {
        const isDead = stateManager.applyDamage(collDamage);
        if (isDead) {
          // Game Over
        }
      }

      // Check checkpoints trigger
      const checkpointCleared = checkCheckpointTrigger(
        activeCheckpoints,
        stateManager.activeCheckpointIndex,
        physics.position
      );

      if (checkpointCleared) {
        stateManager.activeCheckpointIndex++;
        updateCheckpointHighlight(activeCheckpoints, stateManager.activeCheckpointIndex, stateManager.courseCheckpoints.length);
        if (stateManager.activeCheckpointIndex >= stateManager.courseCheckpoints.length) {
          stateManager.handleVictory();
        }
      }
    }

    // Update particles
    collisionSystem.updateParticles(dt);

    // Update camera controller
    cameraController.update(
      dt,
      physics.position,
      physics.heading,
      physics.pitch,
      physics.currentGimbalPitch,
      smoothedCameraPitch,
      stateManager.activeEnvironment,
      stateManager.courseCheckpoints,
      stateManager.activeCheckpointIndex,
      droneModel,
      activeCheckpoints
    );

    // Render Scene
    sceneCtx.scene.render();
  });
});
