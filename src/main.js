/**
 * Main entry point - orchestrates initialization and event binding
 */

import "./style.css";

// UI module
import {
  initializeUI,
  bindElements,
  viewerEl,
  pageEl,
  sidePanelEl,
  recenterBtn,
  cameraRangeSliderEl,
  cameraRangeLabelEl,
  fovSliderEl,
  fovValueEl,
  bgBlurSlider,
  bgBlurValue,
  initPanelToggle,
  togglePanel,
  initLogToggle,
  resetInfo,
  setStatus,
  appendLog,
  formatVec3,
} from "./ui.js";

// Viewer module
import {
  initViewer,
  startRenderLoop,
  scene,
  renderer,
  camera,
  controls,
  composer,
  raycaster,
  requestRender,
  updateDollyZoomBaselineFromCamera,
  dollyZoomEnabled,
  dollyZoomBaseDistance,
  dollyZoomBaseFov,
  currentMesh,
  activeCamera,
  bgImageUrl,
  bgImageContainer,
  defaultCamera,
  defaultControls,
  THREE,
  SplatMesh,
} from "./viewer.js";

// Camera utilities
import {
  restoreHomeView,
  applyCameraProjection,
  applyCameraRangeDegrees,
} from "./cameraUtils.js";

// File loader
import {
  initDragDrop,
  initFilePicker,
  updateViewerAspectRatio,
  resize,
} from "./fileLoader.js";

// Initialize UI
initializeUI();
bindElements();

// Initialize Three.js viewer
initViewer(viewerEl);

// Panel toggle with resize callback
initPanelToggle(() => {
  setTimeout(resize, 350);
});

// Log panel toggle
initLogToggle();

// Reset info display
resetInfo();
setStatus("Waiting for file...");

// Window resize handler
window.addEventListener("resize", resize);
resize();

// Recenter button
if (recenterBtn) {
  recenterBtn.addEventListener("click", () => {
    restoreHomeView(fovSliderEl, fovValueEl, resize);
  });
}

// Global keyboard shortcut: Spacebar to recenter view
document.addEventListener("keydown", (event) => {
  const target = event.target;
  const tag = target?.tagName;
  if (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    tag === "BUTTON" ||
    target?.isContentEditable
  ) {
    return;
  }

  if (event.key === "t" || event.key === "T") {
    event.preventDefault();
    togglePanel();
    return;
  }

  if (event.code === "Space" || event.key === " " || event.key === "Spacebar") {
    event.preventDefault();
    restoreHomeView(fovSliderEl, fovValueEl, resize);
  }
});

// Double-click to set new orbit anchor point
renderer.domElement.addEventListener("dblclick", (event) => {
  if (!currentMesh) return;

  const rect = renderer.domElement.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1
  );

  raycaster.setFromCamera(mouse, camera);
  const intersects = [];
  raycaster.intersectObjects(scene.children, true, intersects);

  const splatHit = intersects.find((i) => i.object instanceof SplatMesh);
  if (splatHit) {
    controls.target.copy(splatHit.point);
    controls.update();
    updateDollyZoomBaselineFromCamera();
    requestRender();
    appendLog(`Anchor set: ${formatVec3(splatHit.point)} (distance: ${splatHit.distance.toFixed(2)})`);
  }
});

// Initialize file handling
initDragDrop();
initFilePicker();

// Start render loop
startRenderLoop();

// Camera range slider
if (cameraRangeSliderEl) {
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  const sliderValueToDegrees = (sliderValue) => {
    const t = clamp(sliderValue / 180, 0, 1);
    if (t <= 0.5) {
      return 20 * t; // 0-10° across first half
    }
    if (t <= 0.85) {
      const localT = (t - 0.5) / 0.35;
      return 10 + 20 * localT; // 10-30° across next 35%
    }
    const localT = (t - 0.85) / 0.15;
    return 30 + 150 * localT; // 30-180° across final 15%
  };

  const degreesToSliderValue = (degrees) => {
    const clamped = clamp(degrees, 0, 180);
    if (clamped <= 10) {
      return (clamped / 20) * 180;
    }
    if (clamped <= 30) {
      const localT = (clamped - 10) / 20;
      return (0.5 + 0.35 * localT) * 180;
    }
    const localT = (clamped - 30) / 150;
    return (0.85 + 0.15 * localT) * 180;
  };

  const formatDegrees = (degrees) => (degrees < 10 ? degrees.toFixed(1) : degrees.toFixed(0));

  const updateCameraRange = (sliderValue) => {
    const degrees = sliderValueToDegrees(sliderValue);
    applyCameraRangeDegrees(degrees);
    if (cameraRangeLabelEl) {
      cameraRangeLabelEl.textContent = `${formatDegrees(degrees)}°`;
    }
  };

  const desiredDegrees = 5;
  const initialSliderValue = degreesToSliderValue(desiredDegrees);
  cameraRangeSliderEl.value = String(initialSliderValue.toFixed(1));
  updateCameraRange(Number.parseFloat(cameraRangeSliderEl.value));

  cameraRangeSliderEl.addEventListener("input", (event) => {
    const val = Number.parseFloat(event.target.value);
    if (!Number.isFinite(val)) return;
    updateCameraRange(val);
  });
}

// FOV slider with dolly zoom support
if (fovSliderEl) {
  fovSliderEl.value = camera.fov;
  if (fovValueEl) fovValueEl.textContent = `${camera.fov.toFixed(0)}°`;

  fovSliderEl.addEventListener("input", (event) => {
    const newFov = Number(event.target.value);
    if (!Number.isFinite(newFov)) return;
    
    if (fovValueEl) fovValueEl.textContent = `${newFov}°`;

    if (dollyZoomEnabled && dollyZoomBaseDistance && dollyZoomBaseFov) {
      const baseTan = Math.tan(THREE.MathUtils.degToRad(dollyZoomBaseFov / 2));
      const newTan = Math.tan(THREE.MathUtils.degToRad(newFov / 2));
      const newDistance = dollyZoomBaseDistance * (baseTan / newTan);
      
      const direction = new THREE.Vector3().subVectors(camera.position, controls.target).normalize();
      camera.position.copy(controls.target).addScaledVector(direction, newDistance);
    }

    camera.fov = newFov;
    camera.updateProjectionMatrix();

    const fovScale = THREE.MathUtils.clamp(camera.fov / defaultCamera.fov, 0.05, 2.0);
    controls.rotateSpeed = Math.max(0.02, defaultControls.rotateSpeed * fovScale * 0.45);
    controls.zoomSpeed = Math.max(0.05, defaultControls.zoomSpeed * fovScale * 0.8);
    controls.panSpeed = Math.max(0.05, defaultControls.panSpeed * fovScale * 0.8);
    
    controls.update();
    requestRender();
  });
}

// Background blur slider
if (bgBlurSlider && bgBlurValue) {
  bgBlurSlider.addEventListener("input", (event) => {
    const blur = parseInt(event.target.value);
    bgBlurValue.textContent = `${blur}px`;
    if (bgImageUrl) {
      bgImageContainer.style.filter = `blur(${blur}px)`;
    }
  });
}
