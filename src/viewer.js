/**
 * Viewer module - Three.js scene, renderer, camera, controls, render loop
 */

import * as THREE from "three";
import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

// Scene
export const scene = new THREE.Scene();
scene.background = new THREE.Color("#0c1018");

// Renderer (initialized lazily)
export let renderer;
export let composer;
export let renderPass;
export let outputPass;
export let camera;
export let controls;
export let spark;
export let raycaster;

// Default settings (captured after initialization)
export let defaultCamera;
export let defaultControls;

// State
export let currentMesh = null;
export let activeCamera = null;
export let needsRender = true;
export let originalImageAspect = null;

// Dolly zoom state
export let dollyZoomEnabled = true;
export let dollyZoomBaseDistance = null;
export let dollyZoomBaseFov = null;

// Background capture state
export let bgImageUrl = null;
export let bgImageContainer = null;
// FPS overlay element
export let fpsContainer = null;

export const setCurrentMesh = (mesh) => { currentMesh = mesh; };
export const setActiveCamera = (cam) => { activeCamera = cam; };
export const setOriginalImageAspect = (aspect) => { originalImageAspect = aspect; };
export const setDollyZoomEnabled = (enabled) => { dollyZoomEnabled = enabled; };
export const setBgImageUrl = (url) => { bgImageUrl = url; };

export const requestRender = () => {
  needsRender = true;
};

export const updateDollyZoomBaselineFromCamera = () => {
  if (!dollyZoomEnabled) return;
  dollyZoomBaseDistance = camera.position.distanceTo(controls.target);
  dollyZoomBaseFov = camera.fov;
};

export const initViewer = (viewerEl) => {
  // Renderer
  renderer = new THREE.WebGLRenderer({
    antialias: false,
    alpha: true,
  });
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setPixelRatio(window.devicePixelRatio);
  viewerEl.appendChild(renderer.domElement);

  // Camera
  camera = new THREE.PerspectiveCamera(60, 1, 0.01, 500);
  camera.position.set(0.5, 0.5, 2.5);
  defaultCamera = {
    fov: camera.fov,
    near: camera.near,
    far: camera.far,
  };

  // Post-processing
  composer = new EffectComposer(renderer);
  renderPass = new RenderPass(scene, camera);
  composer.addPass(renderPass);
  outputPass = new OutputPass();

  // Controls
  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.75;
  controls.zoomSpeed = 0.6;
  controls.panSpeed = 0.6;
  controls.target.set(0, 0, 0);
  defaultControls = {
    dampingFactor: controls.dampingFactor,
    rotateSpeed: controls.rotateSpeed,
    zoomSpeed: controls.zoomSpeed,
    panSpeed: controls.panSpeed,
    minDistance: controls.minDistance,
    maxDistance: controls.maxDistance,
    minPolarAngle: controls.minPolarAngle,
    maxPolarAngle: controls.maxPolarAngle,
    minAzimuthAngle: controls.minAzimuthAngle,
    maxAzimuthAngle: controls.maxAzimuthAngle,
    enablePan: controls.enablePan,
  };

  // Spark renderer
  spark = new SparkRenderer({ renderer });
  scene.add(spark);

  // Raycaster for double-click
  raycaster = new THREE.Raycaster();

  // Background image container
  bgImageContainer = document.createElement("div");
  bgImageContainer.className = "bg-image-container";
  viewerEl.insertBefore(bgImageContainer, viewerEl.firstChild);

  // FPS overlay
  fpsContainer = document.createElement('div');
  fpsContainer.id = 'fps-counter';
  fpsContainer.textContent = '';
  fpsContainer.style.display = 'none';
  viewerEl.appendChild(fpsContainer);

  // Subscribe to store for showFps flag (lazy import to avoid circular deps)
  import('./store.js').then(({ useStore }) => {
    // Initialize visibility
    const initial = useStore.getState().showFps;
    fpsContainer.style.display = initial ? 'block' : 'none';
    // Subscribe to changes
    useStore.subscribe((s) => s.showFps, (show) => {
      if (fpsContainer) fpsContainer.style.display = show ? 'block' : 'none';
    });
  }).catch(() => {});

  // Initialize dolly zoom baseline
  updateDollyZoomBaselineFromCamera();

  // Apply default camera range (imported after initialization to avoid circular dependency)
  setTimeout(() => {
    import('./cameraUtils.js').then(({ applyCameraRangeDegrees }) => {
      import('./store.js').then(({ useStore }) => {
        const defaultRange = useStore.getState().cameraRange;
        applyCameraRangeDegrees(defaultRange);
      });
    });
  }, 0);

  // On-demand rendering
  controls.addEventListener("change", requestRender);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) requestRender();
  });

  return { renderer, camera, controls, composer, spark };
};

export const startRenderLoop = () => {
  // Simple FPS measurement
  let lastTime = performance.now();
  let frameCount = 0;
  let lastFpsUpdate = performance.now();

  const animate = () => {
    requestAnimationFrame(animate);

    // Skip rendering if tab is hidden
    if (document.hidden) return;

    // Always update controls for damping, but only render if needed
    const controlsNeedUpdate = controls.update();

    if (needsRender || controlsNeedUpdate) {
      composer.render();
      needsRender = false;
      frameCount++;
    }

    // Update FPS display once per 250ms if present
    if (fpsContainer && fpsContainer.style.display === 'block') {
      const now = performance.now();
      const dt = now - lastFpsUpdate;
      if (dt >= 250) {
        const fps = Math.round((frameCount * 1000) / dt);
        fpsContainer.textContent = `${fps} FPS`;
        frameCount = 0;
        lastFpsUpdate = now;
      }
    }
  };
  animate();
};

export const removeCurrentMesh = () => {
  if (currentMesh) {
    scene.remove(currentMesh);
    currentMesh = null;
  }
};

export const updateBackgroundImage = (url, blur = 20) => {
  if (!bgImageContainer) return;
  if (url) {
    bgImageContainer.style.backgroundImage = `url(${url})`;
    bgImageContainer.style.filter = `blur(${blur}px)`;
    bgImageContainer.classList.add("active");
  } else {
    bgImageContainer.style.backgroundImage = "none";
    bgImageContainer.classList.remove("active");
  }
  requestRender();
};

// Export THREE and SplatMesh for use in other modules
export { THREE, SplatMesh };
