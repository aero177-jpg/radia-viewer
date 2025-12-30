/**
 * Camera utilities - projection, metadata camera, home view, orbit limits
 */

import {
  camera,
  controls,
  defaultCamera,
  defaultControls,
  activeCamera,
  setActiveCamera,
  updateDollyZoomBaselineFromCamera,
  requestRender,
  dollyZoomEnabled,
  setDollyZoomEnabled,
  THREE,
} from "./viewer.js";
import { appendLog, updateBounds, formatVec3 } from "./ui.js";

// Home view state
let homeView = null;

export const saveHomeView = () => {
  homeView = {
    cameraPosition: camera.position.clone(),
    cameraQuaternion: camera.quaternion.clone(),
    cameraFov: camera.fov,
    cameraNear: camera.near,
    cameraFar: camera.far,
    cameraZoom: camera.zoom,
    controlsTarget: controls.target.clone(),
    controlsDampingFactor: controls.dampingFactor,
    controlsRotateSpeed: controls.rotateSpeed,
    controlsZoomSpeed: controls.zoomSpeed,
    controlsPanSpeed: controls.panSpeed,
    activeCamera: activeCamera ? JSON.parse(JSON.stringify(activeCamera)) : null,
  };
};

export const restoreHomeView = (fovSliderEl, fovValueEl, resize) => {
  if (!homeView) return;

  camera.position.copy(homeView.cameraPosition);
  camera.quaternion.copy(homeView.cameraQuaternion);
  camera.fov = homeView.cameraFov;
  camera.near = homeView.cameraNear;
  camera.far = homeView.cameraFar;
  camera.zoom = homeView.cameraZoom;
  camera.updateProjectionMatrix();

  controls.target.copy(homeView.controlsTarget);
  controls.dampingFactor = homeView.controlsDampingFactor;
  controls.rotateSpeed = homeView.controlsRotateSpeed;
  controls.zoomSpeed = homeView.controlsZoomSpeed;
  controls.panSpeed = homeView.controlsPanSpeed;

  setActiveCamera(homeView.activeCamera ? { ...homeView.activeCamera } : null);

  // Sync UI FOV slider with restored camera fov
  if (fovSliderEl) {
    fovSliderEl.value = String(camera.fov);
    if (fovValueEl) fovValueEl.textContent = `${camera.fov.toFixed(0)}°`;
  }

  // Reset dolly zoom to its default enabled state and baseline
  setDollyZoomEnabled(true);
  updateDollyZoomBaselineFromCamera();

  controls.update();
  requestRender();
  if (resize) resize();
};

export const fitViewToMesh = (mesh) => {
  if (!mesh.getBoundingBox) return;
  const box = mesh.getBoundingBox();
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const radius = Math.max(size.length() * 0.5, 0.5);
  const dist = radius / Math.tan((camera.fov * Math.PI) / 360);

  camera.position.copy(center).add(new THREE.Vector3(dist, dist, dist));
  camera.near = Math.max(0.01, radius * 0.01);
  camera.far = Math.max(dist * 4, radius * 8);
  camera.updateProjectionMatrix();

  controls.target.copy(center);
  controls.update();
  updateDollyZoomBaselineFromCamera();
  requestRender();

  updateBounds(center, size);
};

// CV to GL axis flip matrix
export const makeAxisFlipCvToGl = () =>
  new THREE.Matrix4().set(1, 0, 0, 0, 0, -1, 0, 0, 0, 0, -1, 0, 0, 0, 0, 1);

// Compute depth focus from splat distribution
const quantileSorted = (sorted, q) => {
  if (!sorted.length) return null;
  const clampedQ = Math.max(0, Math.min(1, q));
  const pos = (sorted.length - 1) * clampedQ;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  if (lower === upper) return sorted[lower];
  const weight = pos - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
};

export const computeMlSharpDepthFocus = (
  mesh,
  { qFocus = 0.1, minDepthFocus = 2.0, maxSamples = 50_000 } = {},
) => {
  const numSplats = mesh?.packedSplats?.numSplats ?? 0;
  if (!numSplats) return minDepthFocus;

  const step = Math.max(1, Math.floor(numSplats / maxSamples));
  const depths = [];
  for (let i = 0; i < numSplats; i += step) {
    const { center } = mesh.packedSplats.getSplat(i);
    const z = center.z;
    if (Number.isFinite(z) && z > 0) depths.push(z);
  }

  if (!depths.length) return minDepthFocus;
  depths.sort((a, b) => a - b);
  const q = quantileSorted(depths, qFocus);
  if (!Number.isFinite(q)) return minDepthFocus;
  return Math.max(minDepthFocus, q);
};

// Build projection matrix from intrinsics
export const makeProjectionFromIntrinsics = ({
  fx,
  fy,
  cx,
  cy,
  width,
  height,
  near,
  far,
}) => {
  const left = (-cx * near) / fx;
  const right = ((width - cx) * near) / fx;
  const top = (cy * near) / fy;
  const bottom = (-(height - cy) * near) / fy;

  return new THREE.Matrix4().set(
    (2 * near) / (right - left),
    0,
    (right + left) / (right - left),
    0,
    0,
    (2 * near) / (top - bottom),
    (top + bottom) / (top - bottom),
    0,
    0,
    0,
    -(far + near) / (far - near),
    (-2 * far * near) / (far - near),
    0,
    0,
    -1,
    0,
  );
};

export const applyCameraProjection = (cameraMetadata, viewportWidth, viewportHeight) => {
  const { intrinsics, near, far } = cameraMetadata;
  const sx = viewportWidth / intrinsics.imageWidth;
  const sy = viewportHeight / intrinsics.imageHeight;
  const s = Math.min(sx, sy);
  const scaledWidth = intrinsics.imageWidth * s;
  const scaledHeight = intrinsics.imageHeight * s;
  const offsetX = (viewportWidth - scaledWidth) * 0.5;
  const offsetY = (viewportHeight - scaledHeight) * 0.5;

  const fx = intrinsics.fx * s;
  const fy = intrinsics.fy * s;
  const cx = intrinsics.cx * s + offsetX;
  const cy = intrinsics.cy * s + offsetY;

  camera.aspect = viewportWidth / viewportHeight;
  camera.fov = THREE.MathUtils.radToDeg(
    2 * Math.atan(viewportHeight / (2 * Math.max(1e-6, fy))),
  );
  camera.near = near;
  camera.far = far;

  const fovScale = THREE.MathUtils.clamp(camera.fov / defaultCamera.fov, 0.05, 2.0);
  controls.rotateSpeed = Math.max(0.02, defaultControls.rotateSpeed * fovScale * 0.45);
  controls.zoomSpeed = Math.max(0.05, defaultControls.zoomSpeed * fovScale * 0.8);
  controls.panSpeed = Math.max(0.05, defaultControls.panSpeed * fovScale * 0.8);

  const projection = makeProjectionFromIntrinsics({
    fx,
    fy,
    cx,
    cy,
    width: viewportWidth,
    height: viewportHeight,
    near,
    far,
  });
  camera.projectionMatrix.copy(projection);
  camera.projectionMatrixInverse.copy(projection).invert();
};

export const applyMetadataCamera = (mesh, cameraMetadata, resize) => {
  const cvToThree = makeAxisFlipCvToGl();
  if (!mesh.userData.__cvToThreeApplied) {
    mesh.applyMatrix4(cvToThree);
    mesh.userData.__cvToThreeApplied = true;
  }
  mesh.updateMatrixWorld(true);

  const e = cameraMetadata.extrinsicCv;
  const extrinsicCv = new THREE.Matrix4().set(
    e[0], e[1], e[2], e[3],
    e[4], e[5], e[6], e[7],
    e[8], e[9], e[10], e[11],
    e[12], e[13], e[14], e[15],
  );

  const view = new THREE.Matrix4().multiplyMatrices(cvToThree, extrinsicCv).multiply(cvToThree);
  const cameraWorld = new THREE.Matrix4().copy(view).invert();

  camera.matrixAutoUpdate = true;
  camera.matrixWorld.copy(cameraWorld);
  camera.matrixWorld.decompose(camera.position, camera.quaternion, camera.scale);
  camera.updateMatrix();
  camera.updateMatrixWorld(true);

  if (mesh?.getBoundingBox) {
    const box = mesh.getBoundingBox();
    const worldBox = box.clone().applyMatrix4(mesh.matrixWorld);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    worldBox.getSize(size);
    worldBox.getCenter(center);
    const radius = Math.max(size.length() * 0.5, 0.25);

    const camPos = camera.position.clone();
    const dist = camPos.distanceTo(center);

    const near = Math.max(0.01, dist - radius * 2.0);
    const far = Math.max(near + 1.0, dist + radius * 6.0);
    setActiveCamera({ ...cameraMetadata, near, far });

    updateBounds(center, size);
  } else {
    setActiveCamera({ ...cameraMetadata, near: 0.01, far: 1000 });
  }

  const depthFocusCv = computeMlSharpDepthFocus(mesh);
  const lookAtCv = new THREE.Vector3(0, 0, depthFocusCv);
  const lookAtThree = lookAtCv.applyMatrix4(mesh.matrixWorld);
  controls.target.copy(lookAtThree);
  appendLog(`ml-sharp lookAt: depth_focus=${depthFocusCv.toFixed(3)} (q=0.1, min=2.0)`);

  controls.enabled = true;
  controls.update();
  updateDollyZoomBaselineFromCamera();
  requestRender();

  if (resize) resize();
};

export const clearMetadataCamera = (resize) => {
  setActiveCamera(null);
  camera.matrixAutoUpdate = true;
  controls.enabled = true;
  controls.dampingFactor = defaultControls.dampingFactor;
  controls.rotateSpeed = defaultControls.rotateSpeed;
  controls.zoomSpeed = defaultControls.zoomSpeed;
  controls.panSpeed = defaultControls.panSpeed;
  camera.fov = defaultCamera.fov;
  camera.near = defaultCamera.near;
  camera.far = defaultCamera.far;
  camera.updateProjectionMatrix();
  if (resize) resize();
};

// Orbit range control
export const applyCameraRangeDegrees = (degrees) => {
  // Convert degrees (0-180) to orbit limits
  // 0° = locked view, 180° = full hemisphere orbit
  const t = Math.max(0, Math.min(180, degrees)) / 180;
  
  // Azimuth: 0 to ±90° (π/2)
  const azimuthRange = t * (Math.PI / 2);
  controls.minAzimuthAngle = -azimuthRange;
  controls.maxAzimuthAngle = azimuthRange;
  
  // Polar: centered at π/2 (horizontal), expand outward
  // At 0°: very tight around horizontal (0.48π to 0.52π)
  // At 180°: full range (0.05π to 0.95π)
  const polarMin = 0.5 - (0.45 * t);
  const polarMax = 0.5 + (0.45 * t);
  controls.minPolarAngle = Math.PI * polarMin;
  controls.maxPolarAngle = Math.PI * polarMax;
};
