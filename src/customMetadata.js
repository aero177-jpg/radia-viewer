/**
 * Custom metadata module for non-ML Sharp splats.
 * Handles coordinate system conversion and camera pose persistence.
 */

import {
  camera,
  controls,
  requestRender,
  updateDollyZoomBaselineFromCamera,
} from "./viewer.js";
import { makeAxisFlipCvToGl } from "./cameraUtils.js";
import {
  saveCustomMetadata,
  loadCustomMetadata,
  clearCustomMetadata,
} from "./fileStorage.js";
import { useStore } from "./store.js";

const CUSTOM_METADATA_VERSION = 2;
const MIN_MODEL_SCALE = 0.1;
const MAX_MODEL_SCALE = 10.0;
const DEFAULT_MODEL_SCALE = 1.0;

/**
 * Clamp scale to valid range
 */
const clampScale = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return DEFAULT_MODEL_SCALE;
  return Math.max(MIN_MODEL_SCALE, Math.min(MAX_MODEL_SCALE, num));
};

/**
 * Store original mesh matrix before any custom transforms
 */
const ensureBaseMatrix = (mesh) => {
  if (!mesh || mesh.userData?.__customBaseMatrix) return;
  mesh.updateMatrix();
  mesh.userData.__customBaseMatrix = mesh.matrix.clone();
};

/**
 * Apply CV→GL coordinate flip to mesh (same as ML Sharp files).
 * This is the key transform that makes custom splats behave like ML Sharp.
 *
 * @param {THREE.Object3D} mesh - The splat mesh
 * @param {boolean} shouldFlip - Whether to apply the flip
 */
export const applyCoordinateSystemFlip = (mesh, shouldFlip) => {
  if (!mesh) return;

  ensureBaseMatrix(mesh);
  const baseMatrix = mesh.userData.__customBaseMatrix;
  if (!baseMatrix) return;

  // Reset to base
  mesh.matrix.copy(baseMatrix);
  mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);

  if (shouldFlip) {
    // Apply the exact CV→GL transform used by ML Sharp
    const cvToGl = makeAxisFlipCvToGl();
    mesh.applyMatrix4(cvToGl);
    mesh.userData.__cvToThreeApplied = true;
  } else {
    mesh.userData.__cvToThreeApplied = false;
  }

  mesh.updateMatrix();
  mesh.updateMatrixWorld(true);
  requestRender();
};

/**
 * Apply model scale transform
 *
 * @param {THREE.Object3D} mesh - The splat mesh
 * @param {number} scale - Scale factor (0.1 to 10.0)
 */
export const applyModelScale = (mesh, scale) => {
  if (!mesh) return;

  const clampedScale = clampScale(scale);
  mesh.scale.setScalar(clampedScale);
  mesh.updateMatrix();
  mesh.updateMatrixWorld(true);
  requestRender();
};

/**
 * Apply full custom transform: flip + scale
 */
export const applyCustomModelTransform = (mesh, overrides = {}) => {
  if (!mesh) return;

  ensureBaseMatrix(mesh);
  const baseMatrix = mesh.userData.__customBaseMatrix;
  if (!baseMatrix) return;

  // Reset to base
  mesh.matrix.copy(baseMatrix);
  mesh.matrix.decompose(mesh.position, mesh.quaternion, mesh.scale);

  // Apply CV→GL flip if requested
  if (overrides.applyCoordinateFlip) {
    const cvToGl = makeAxisFlipCvToGl();
    mesh.applyMatrix4(cvToGl);
    mesh.userData.__cvToThreeApplied = true;
  } else {
    mesh.userData.__cvToThreeApplied = false;
  }

  // Apply scale
  const scale = clampScale(overrides.modelScale ?? DEFAULT_MODEL_SCALE);
  mesh.scale.setScalar(scale);

  mesh.updateMatrix();
  mesh.updateMatrixWorld(true);
  requestRender();
};

/**
 * Capture current camera pose for saving
 * 
 * OrbitControls doesn't use quaternion - it keeps camera looking at target.
 * So we save position, target, and the distance/up vector to reconstruct.
 */
export const captureCameraPose = () => {
  if (!camera || !controls) return null;

  // Calculate distance from camera to target (for zoom)
  const distance = camera.position.distanceTo(controls.target);

  return {
    position: camera.position.toArray(),
    target: controls.target.toArray(),
    up: camera.up.toArray(),
    distance: distance,
    fov: camera.fov,
    near: camera.near,
    far: camera.far,
    zoom: camera.zoom,
  };
};

/**
 * Apply saved camera pose
 * 
 * Sets position and target, then lets OrbitControls handle the orientation.
 */
export const applyCameraPose = (pose) => {
  if (!pose || !camera || !controls) return;

  // Restore camera up vector first
  if (pose.up) {
    camera.up.fromArray(pose.up);
  }

  // Set target first
  controls.target.fromArray(pose.target);

  // Set camera position
  camera.position.fromArray(pose.position);

  // Restore camera parameters
  camera.fov = pose.fov;
  camera.near = pose.near;
  camera.far = pose.far;
  camera.zoom = pose.zoom;
  camera.updateProjectionMatrix();

  // Let OrbitControls sync its internal spherical state
  controls.update();

  // Now make the camera look at the target (this is what OrbitControls does)
  camera.lookAt(controls.target);
  
  // Update again to ensure everything is in sync
  controls.update();
  
  updateDollyZoomBaselineFromCamera();
  requestRender();

  // Sync store FOV
  useStore.getState().setFov(Math.round(pose.fov));
};

/**
 * Capture complete custom metadata payload for persistence
 * Note: applyCoordinateFlip defaults to true since non-ML Sharp splats
 * always need the CV→GL transform applied.
 */
export const captureCustomMetadataPayload = (overrides = {}) => {
  const pose = captureCameraPose();
  if (!pose) return null;

  return {
    version: CUSTOM_METADATA_VERSION,
    cameraPose: pose,
    model: {
      applyCoordinateFlip: true, // Always apply for non-ML Sharp splats
      modelScale: clampScale(overrides.modelScale ?? DEFAULT_MODEL_SCALE),
    },
    savedAt: Date.now(),
  };
};

/**
 * Enable 360° orbit (no angle limits)
 */
export const applyFullOrbitConstraints = () => {
  if (!controls) return;

  controls.minAzimuthAngle = -Infinity;
  controls.maxAzimuthAngle = Infinity;
  controls.minPolarAngle = 0.01; // Avoid gimbal lock at poles
  controls.maxPolarAngle = Math.PI - 0.01;
  controls.update();
};

/**
 * Restore normal orbit constraints
 */
export const restoreOrbitConstraints = (rangeDegrees = 26) => {
  if (!controls) return;

  // Import dynamically to avoid circular deps
  import("./cameraUtils.js").then(({ applyCameraRangeDegrees }) => {
    applyCameraRangeDegrees(rangeDegrees);
    controls.update();
  });
};

// ─────────────────────────────────────────────────────────────────────────────
// Persistence
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load custom metadata for an asset by name
 */
export const loadCustomMetadataForAsset = async (assetName) => {
  if (!assetName) return null;
  return loadCustomMetadata(assetName);
};

/**
 * Save custom metadata for an asset by name
 */
export const saveCustomMetadataForAsset = async (assetName, payload) => {
  if (!assetName || !payload) return false;
  return saveCustomMetadata(assetName, payload);
};

/**
 * Clear custom metadata for an asset
 */
export const clearCustomMetadataForAsset = async (assetName) => {
  if (!assetName) return false;
  return clearCustomMetadata(assetName);
};

/**
 * Check if asset has custom metadata
 */
export const hasCustomMetadataForAsset = async (assetName) => {
  if (!assetName) return false;
  const data = await loadCustomMetadata(assetName);
  return data !== null;
};
