/**
 * Scene builder — creates the Babylon.js engine, scene, camera, and base lighting.
 */
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { FreeCamera } from '@babylonjs/core/Cameras/freeCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { ShadowGenerator } from '@babylonjs/core/Lights/Shadows/shadowGenerator';
import { Vector3, Color3, Color4 } from '@babylonjs/core/Maths/math';
import { Viewport } from '@babylonjs/core/Maths/math.viewport';
import '@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent';

export interface SceneContext {
  engine: Engine;
  scene: Scene;
  camera: FreeCamera;
  pipCamera: FreeCamera;
  hemisphericLight: HemisphericLight;
  dirLight: DirectionalLight;
  keyLight: DirectionalLight;
  shadowGenerator: ShadowGenerator;
}

/** Build the core Babylon.js scene with engine, camera, and lights. */
export function buildScene(canvas: HTMLCanvasElement): SceneContext {
  const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                   (window.innerWidth <= 950 && 'ontouchstart' in window);

  // Create engine with mobile-optimized power settings
  const engine = new Engine(canvas, !isMobile, {
    preserveDrawingBuffer: false,
    stencil: false,
    antialias: !isMobile,
    powerPreference: 'high-performance'
  });

  // Optimize hardware scaling level (prevents 3x Retina supersampling lag on mobile)
  if (isMobile) {
    const mobileDPR = Math.min(window.devicePixelRatio || 1, 1.25);
    engine.setHardwareScalingLevel(1 / mobileDPR);
  } else {
    engine.setHardwareScalingLevel(1);
  }

  // Create scene
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.965, 0.969, 0.973, 1.0); // soft neutral daylight

  // Disable unneeded physics or collision calculations when idle
  scene.autoClear = true;
  scene.autoClearDepthAndStencil = true;

  // Camera — manual FreeCamera, we'll control it ourselves
  const camera = new FreeCamera('mainCamera', new Vector3(0, 7, 10), scene);
  camera.fov = 60 * (Math.PI / 180);
  camera.minZ = 0.1;
  camera.maxZ = 1000;
  camera.detachControl();

  // PiP Camera
  const pipCamera = new FreeCamera('pipCamera', new Vector3(0, 0, 0), scene);
  pipCamera.fov = 60 * (Math.PI / 180);
  pipCamera.minZ = 0.1;
  pipCamera.maxZ = 1000;
  pipCamera.viewport = new Viewport(0.02, 0.15, 0.25, 0.25);
  pipCamera.detachControl();

  // Enable multi-camera
  scene.activeCameras = [camera, pipCamera];

  // Hemispheric light (ambient fill)
  const hemisphericLight = new HemisphericLight('ambient', new Vector3(0, 1, 0), scene);
  hemisphericLight.intensity = 0.5;
  hemisphericLight.diffuse = Color3.FromHexString('#f8fafc');
  hemisphericLight.groundColor = Color3.FromHexString('#94a3b8');

  // Directional light (sun)
  const dirLight = new DirectionalLight('sun', new Vector3(-100, -250, -150).normalize(), scene);
  dirLight.intensity = 1.0;
  dirLight.diffuse = Color3.White();
  dirLight.position = new Vector3(100, 250, 150);

  // Shadow generator (lighter shadow map resolution on mobile)
  const shadowGenerator = new ShadowGenerator(isMobile ? 256 : 512, dirLight);
  shadowGenerator.useBlurExponentialShadowMap = !isMobile;
  shadowGenerator.blurKernel = isMobile ? 4 : 8;
  shadowGenerator.depthScale = 30;
  shadowGenerator.bias = 0.0003;

  // Key light (fill)
  const keyLight = new DirectionalLight('keyLight', new Vector3(150, -80, 100).normalize(), scene);
  keyLight.intensity = 0.22;
  keyLight.diffuse = Color3.FromHexString('#e2e8f0');

  // Handle window resize
  window.addEventListener('resize', () => {
    engine.resize();
  });

  return { engine, scene, camera, pipCamera, hemisphericLight, dirLight, keyLight, shadowGenerator };
}
