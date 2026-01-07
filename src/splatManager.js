/**
 * Splat Manager
 * Maintains a persistent THREE.Group of splats and handles preload/activation.
 */

import { scene, THREE } from "./viewer.js";
import { getFormatHandler } from "./formats/index.js";
import { loadFileSettings } from "./fileStorage.js";

let splatGroup = null;
const cache = new Map();
const loading = new Map();

// Export cache for direct access (used during preloaded transitions)
export const getSplatCache = () => cache;

const ensureGroup = () => {
  if (!splatGroup) {
    splatGroup = new THREE.Group();
    splatGroup.name = "SplatManagerGroup";
    scene.add(splatGroup);
  }
  return splatGroup;
};

const disposeMesh = (mesh) => {
  if (!mesh) return;
  mesh.parent?.remove(mesh);
  if (typeof mesh.dispose === "function") {
    try {
      mesh.dispose();
    } catch (err) {
      console.warn("[SplatManager] Mesh dispose failed", err);
    }
  }
  if (mesh.geometry?.dispose) {
    mesh.geometry.dispose();
  }
  if (mesh.material?.dispose) {
    mesh.material.dispose();
  }
};

const disposeEntry = (entry) => {
  if (!entry) return;
  disposeMesh(entry.mesh);
};

const createEntry = async (asset) => {
  if (!asset?.file) {
    const err = new Error("Missing file reference for asset");
    err.code = "MISSING_FILE";
    throw err;
  }

  const formatHandler = getFormatHandler(asset.file);
  if (!formatHandler) {
    const err = new Error(`Unsupported file: ${asset.name}`);
    err.code = "UNSUPPORTED_FORMAT";
    throw err;
  }

  const bytes = new Uint8Array(await asset.file.arrayBuffer());

  let cameraMetadata = null;
  try {
    cameraMetadata = await formatHandler.loadMetadata({ file: asset.file, bytes });
  } catch (err) {
    console.warn(`[SplatManager] Failed to parse metadata for ${asset.name}:`, err);
  }

  const mesh = await formatHandler.loadData({ file: asset.file, bytes });
  mesh.visible = false;
  mesh.userData.assetId = asset.id;
  ensureGroup().add(mesh);

  let storedSettings = null;
  try {
    storedSettings = await loadFileSettings(asset.name);
  } catch (err) {
    console.warn(`[SplatManager] Failed to read stored settings for ${asset.name}:`, err);
  }

  return {
    id: asset.id,
    asset,
    mesh,
    cameraMetadata: cameraMetadata ?? null,
    formatLabel: formatHandler.label,
    storedSettings,
    focusDistanceOverride: storedSettings?.focusDistance,
  };
};

export const isSplatCached = (asset) => {
  if (!asset?.id) return false;
  return cache.has(asset.id);
};

export const ensureSplatEntry = async (asset) => {
  if (!asset?.id) return null;
  if (cache.has(asset.id)) return cache.get(asset.id);
  if (loading.has(asset.id)) return loading.get(asset.id);

  const promise = createEntry(asset)
    .then((entry) => {
      cache.set(asset.id, entry);
      loading.delete(asset.id);
      return entry;
    })
    .catch((err) => {
      loading.delete(asset.id);
      throw err;
    });

  loading.set(asset.id, promise);
  return promise;
};

export const activateSplatEntry = async (asset) => {
  const entry = await ensureSplatEntry(asset);
  if (!entry) return null;

  // Only toggle visibility - DO NOT reset transforms!
  // The mesh has CV-to-Three axis flip applied via applyMatrix4()
  // which modifies position/rotation/scale. Resetting them corrupts the view.
  cache.forEach((cached, id) => {
    cached.mesh.visible = id === asset.id;
  });

  return entry;
};

export const retainOnlySplats = (assetIds) => {
  if (!assetIds || assetIds.size === 0) {
    resetSplatManager();
    return;
  }

  cache.forEach((entry, id) => {
    if (!assetIds.has(id)) {
      disposeEntry(entry);
      cache.delete(id);
    }
  });
};

export const resetSplatManager = () => {
  cache.forEach(disposeEntry);
  cache.clear();
  loading.clear();
  if (splatGroup) {
    splatGroup.clear();
    ensureGroup();
  }
};