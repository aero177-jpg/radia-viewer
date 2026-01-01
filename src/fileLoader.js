/**
  * File loader module.
 * Handles file loading, drag/drop, format detection, and asset management.
 * Works with Zustand store for state updates and Preact components for UI.
 */

import { getFormatHandler, getSupportedExtensions } from "./formats/index.js";
import { useStore } from "./store.js";
import {
  scene,
  renderer,
  composer,
  camera,
  controls,
  spark,
  outputPass,
  currentMesh,
  setCurrentMesh,
  setOriginalImageAspect,
  originalImageAspect,
  activeCamera,
  removeCurrentMesh,
  requestRender,
  updateBackgroundImage,
  bgImageContainer,
  setBgImageUrl,
  THREE,
} from "./viewer.js";
import {
  fitViewToMesh,
  applyMetadataCamera,
  clearMetadataCamera,
  saveHomeView,
  applyCameraProjection,
} from "./cameraUtils.js";
import { startLoadZoomAnimation } from "./cameraAnimations.js";
import {
  setAssetList as setAssetListManager,
  getAssetList,
  getCurrentAssetIndex,
  setCurrentAssetIndex as setCurrentAssetIndexManager,
  getAssetByIndex,
  onPreviewGenerated,
  hasMultipleAssets,
  getAssetCount,
  nextAsset,
  prevAsset,
  setCapturePreviewFn,
  captureCurrentAssetPreview,
} from "./assetManager.js";

/** Warmup frames for renderer stabilization */
const WARMUP_FRAMES = 120;

/** Frame at which to capture background */
const BG_CAPTURE_FRAME = 90;

/** Frame at which to capture preview thumbnail */
const PREVIEW_CAPTURE_FRAME = 60;

/** Page padding in pixels */
const PAGE_PADDING = 36;

/** Accesses Zustand store state */
const getStoreState = () => useStore.getState();

/** Supported file extensions for display */
const supportedExtensions = getSupportedExtensions();
const supportedExtensionsText = supportedExtensions.join(", ");

/**
 * Updates viewer dimensions based on window size and panel state.
 * If camera metadata provides an aspect ratio, constrains viewer to match it.
 * Otherwise fills available space.
 */
export const updateViewerAspectRatio = () => {
  const viewerEl = document.getElementById('viewer');
  if (!viewerEl) return;
  
  const availableWidth = Math.max(0, window.innerWidth - PAGE_PADDING);
  const availableHeight = Math.max(0, window.innerHeight - PAGE_PADDING);

  if (originalImageAspect && originalImageAspect > 0) {
    // Calculate what the aspect ratio of available space is
    const availableAspect = availableWidth / availableHeight;
    
    let viewerWidth, viewerHeight;
    
    // If image is wider than available space, constrain by width
    // If image is taller than available space, constrain by height
    if (originalImageAspect > availableAspect) {
      // Image is wider - fill width
      viewerWidth = availableWidth;
      viewerHeight = viewerWidth / originalImageAspect;
    } else {
      // Image is taller - fill height
      viewerHeight = availableHeight;
      viewerWidth = viewerHeight * originalImageAspect;
    }
    
    viewerEl.style.width = `${viewerWidth}px`;
    viewerEl.style.height = `${viewerHeight}px`;
  } else {
    viewerEl.style.width = `${availableWidth}px`;
    viewerEl.style.height = `${availableHeight}px`;
  }
};

/**
 * Resizes renderer and updates camera projection.
 * Called on window resize and panel toggle.
 */
export const resize = () => {
  const viewerEl = document.getElementById('viewer');
  if (!viewerEl) return;
  
  updateViewerAspectRatio();
  const { clientWidth, clientHeight } = viewerEl;
  renderer.setSize(clientWidth, clientHeight, false);
//   composer.setSize(clientWidth, clientHeight);
  
  if (activeCamera) {
    applyCameraProjection(activeCamera, clientWidth, clientHeight);
  } else {
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
  }
  requestRender();
};

/**
 * Captures a JPEG thumbnail of the current render.
 * Used for asset gallery previews.
 * @returns {string|null} Data URL of captured image, or null if no mesh loaded
 */
const capturePreviewThumbnail = () => {
  if (!currentMesh) return null;
  
  // Render with solid background for capture
  scene.background = new THREE.Color("#0c1018");
  renderer.setClearColor(0x0c1018, 1);
  composer.render();
  
  const dataUrl = renderer.domElement.toDataURL("image/jpeg", 0.85);
  
  // Restore transparent background
  scene.background = null;
  renderer.setClearColor(0x000000, 0);
  
  return dataUrl;
};

// Register capture function with asset manager
setCapturePreviewFn(capturePreviewThumbnail);

/**
 * Applies a preview image as background immediately.
 * Used when loading an asset that already has a preview.
 */
const applyPreviewAsBackground = (previewUrl) => {
  if (!previewUrl) return;
  console.log(previewUrl)
  setBgImageUrl(previewUrl);
  const blur = 20;
  updateBackgroundImage(previewUrl, blur);
  
  // Apply glow effect to page container
  const pageEl = document.querySelector(".page");
  if (pageEl) {
    pageEl.style.setProperty("--glow-image", `url(${previewUrl})`);
    pageEl.classList.add("has-glow");
  }
  
  // Make canvas transparent so background shows through
  scene.background = null;
  renderer.setClearColor(0x000000, 0);
  
  requestRender();
};

/**
 * Captures current render as blurred background image.
 * Creates depth effect behind the model and glow effect around the viewer.
 */
const captureAndApplyBackground = () => {
  if (!currentMesh) return;

  // Set solid background for capture
  scene.background = new THREE.Color("#0c1018");
  renderer.setClearColor(0x0c1018, 1);
  
  composer.render();
  
  const dataUrl = renderer.domElement.toDataURL("image/jpeg", 0.9);
  
  setBgImageUrl(dataUrl);
  const blur = 20;
  updateBackgroundImage(dataUrl, blur);
  
  // Apply glow effect to page container
  const pageEl = document.querySelector(".page");
  if (pageEl) {
    pageEl.style.setProperty("--glow-image", `url(${dataUrl})`);
    pageEl.classList.add("has-glow");
  }
  
  // Set transparent background so blurred image shows through
  scene.background = null;
  renderer.setClearColor(0x000000, 0);
  
  requestRender();
  getStoreState().addLog("Background captured from model render");
};

/**
 * Formats byte count into human-readable string.
 * @param {number} bytes - Number of bytes
 * @returns {string} Formatted string (e.g., "1.5 MB")
 */
const formatBytes = (bytes) => {
  if (!bytes && bytes !== 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let i = 0;
  let value = bytes;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value >= 10 ? 0 : 1)} ${units[i]}`;
};

/**
 * Loads and displays a 3DGS splat file.
 * Handles format detection, camera metadata parsing, mesh creation,
 * and post-load effects (animation, preview capture, background).
 * 
 * @param {File} file - File object to load
 */
export const loadSplatFile = async (file) => {
  const viewerEl = document.getElementById('viewer');
  if (!file || !viewerEl) return;
  
  const store = getStoreState();
  
  const formatHandler = getFormatHandler(file);
  if (!formatHandler) {
    store.setStatus(`Only ${supportedExtensionsText} 3DGS files are supported`);
    return;
  }

  try {
    // Immediately clear old backgrounds to prevent aspect ratio mismatch artifacts
    updateBackgroundImage(null);
    const pageEl = document.querySelector(".page");
    if (pageEl) {
      pageEl.classList.remove("has-glow");
    }
    
    // Get current asset to check for existing preview
    const currentIndex = getCurrentAssetIndex();
    const currentAsset = getAssetByIndex(currentIndex);
    
    viewerEl.classList.add("loading");
    store.setIsLoading(true);
    
    store.setStatus("Reading local file...");
    const start = performance.now();
    const bytes = new Uint8Array(await file.arrayBuffer());

    let cameraMetadata = null;
    try {
      cameraMetadata = await formatHandler.loadMetadata({ file, bytes });
      if (cameraMetadata) {
        const { intrinsics } = cameraMetadata;
        // Store aspect ratio but don't update viewer yet
        setOriginalImageAspect(intrinsics.imageWidth / intrinsics.imageHeight);
        
        store.addLog(
          `${formatHandler.label} camera: fx=${intrinsics.fx.toFixed(1)}, fy=${intrinsics.fy.toFixed(1)}, ` +
            `cx=${intrinsics.cx.toFixed(1)}, cy=${intrinsics.cy.toFixed(1)}, ` +
            `img=${intrinsics.imageWidth}x${intrinsics.imageHeight}`,
        );
      } else {
        setOriginalImageAspect(null);
      }
    } catch (error) {
      setOriginalImageAspect(null);
      store.addLog(`Failed to parse camera metadata, falling back to default view: ${error?.message ?? error}`);
    }

    store.setStatus(`Parsing ${formatHandler.label} and building splats...`);
    const mesh = await formatHandler.loadData({ file, bytes });

    // Configure pipeline based on color space
    // if (formatHandler.colorSpace === "linear") {
    //   if (!composer.passes.includes(outputPass)) {
    //     composer.addPass(outputPass);
    //   }
    // } else {
    //   composer.removePass(outputPass);
    // }

    removeCurrentMesh();
    setCurrentMesh(mesh);
    viewerEl.classList.add("has-mesh");
    scene.add(mesh);

    // Now update aspect ratio after old mesh is removed and new mesh is added
    updateViewerAspectRatio();
    
    // Apply preview background after aspect ratio is set
    if (currentAsset?.preview) {
      setTimeout(() => {
        applyPreviewAsBackground(currentAsset.preview);
      }, 50);
    }

    clearMetadataCamera(resize);
    if (cameraMetadata) {
      applyMetadataCamera(mesh, cameraMetadata, resize);
    } else {
      fitViewToMesh(mesh);
    }
    spark.update({ scene });

    // Save home view BEFORE animation so we capture the correct position
    saveHomeView();

    startLoadZoomAnimation();

    // Warmup frames for spark renderer stabilization
    let warmupFrames = WARMUP_FRAMES;
    let bgCaptured = false;
    let previewCaptured = false;
    
    // Skip background generation if we already have an image-based preview
    const skipBgGeneration = currentAsset?.preview && currentAsset.previewSource === "image";
    
    /**
     * Warmup loop for renderer stabilization.
     * Captures background and preview at specific frames.
     */
    const warmup = () => {
      if (warmupFrames > 0) {
        warmupFrames--;
        requestRender();
        requestAnimationFrame(warmup);
        
        if (!bgCaptured && warmupFrames === BG_CAPTURE_FRAME && !skipBgGeneration) {
          bgCaptured = true;
          captureAndApplyBackground();
        }
        
        if (!previewCaptured && warmupFrames === PREVIEW_CAPTURE_FRAME) {
          previewCaptured = true;
          captureCurrentAssetPreview();
        }
      }
    };
    warmup();

    const loadMs = performance.now() - start;
    
    // Update file info in store
    store.setFileInfo({
      name: file.name,
      size: formatBytes(file.size),
      splatCount: mesh?.packedSplats?.numSplats ?? "-",
      loadTime: `${loadMs.toFixed(1)} ms`,
    });
    
    setTimeout(() => {
      viewerEl.classList.remove("loading");
      store.setIsLoading(false);
    }, 100);
    
    store.setStatus(
      cameraMetadata
        ? "Loaded "
        : "Loaded (no camera data)",
    );
    store.addLog(
      `Debug: splats=${mesh.packedSplats.numSplats}`,
    );
  } catch (error) {
    console.error(error);
    viewerEl.classList.remove("loading");
    store.setIsLoading(false);
    clearMetadataCamera(resize);
    store.setStatus("Load failed, please check the file or console log");
  }
};

/**
 * Prevents default browser behavior for drag events.
 * @param {DragEvent} event - Drag event
 */
const preventDefaults = (event) => {
  event.preventDefault();
  event.stopPropagation();
};

/**
 * Initializes drag-and-drop file loading on the viewer element.
 * Supports both individual files and folder drops.
 * Called from Viewer component after viewer is ready.
 */
export const initDragDrop = () => {
  const viewerEl = document.getElementById('viewer');
  if (!viewerEl) return;
  
  ["dragenter", "dragover"].forEach((eventName) => {
    viewerEl.addEventListener(eventName, (event) => {
      preventDefaults(event);
      viewerEl.classList.add("dragging");
    });
  });

  ["dragleave", "drop"].forEach((eventName) => {
    viewerEl.addEventListener(eventName, (event) => {
      preventDefaults(event);
      if (eventName === "dragleave") {
        viewerEl.classList.remove("dragging");
      }
    });
  });

  viewerEl.addEventListener("drop", async (event) => {
    viewerEl.classList.remove("dragging");
    
    const items = event.dataTransfer?.items;
    const files = [];
    
    if (items) {
      // Try to get folder contents using webkitGetAsEntry
      const entries = [];
      for (const item of items) {
        const entry = item.webkitGetAsEntry?.();
        if (entry) {
          entries.push(entry);
        }
      }
      
      if (entries.length > 0) {
        // Process entries (files and folders)
        const processedFiles = await processEntries(entries);
        files.push(...processedFiles);
      } else {
        // Fallback to regular file list
        const fileList = event.dataTransfer?.files;
        if (fileList) {
          files.push(...Array.from(fileList));
        }
      }
    } else {
      // Fallback to regular file list
      const fileList = event.dataTransfer?.files;
      if (fileList) {
        files.push(...Array.from(fileList));
      }
    }
    
    if (files.length > 0) {
      await handleMultipleFiles(files);
    }
  });
};

/**
 * Recursively processes FileSystemEntry objects from drag/drop.
 * Handles both files and directories.
 * @param {FileSystemEntry[]} entries - Array of file system entries
 * @returns {Promise<File[]>} Array of File objects
 */
const processEntries = async (entries) => {
  const files = [];
  
  /**
   * Reads a single entry (file or directory).
   * @param {FileSystemEntry} entry - Entry to read
   * @returns {Promise<File[]>} Array of files from this entry
   */
  const readEntry = async (entry) => {
    if (entry.isFile) {
      return new Promise((resolve) => {
        entry.file((file) => resolve([file]), () => resolve([]));
      });
    } else if (entry.isDirectory) {
      const dirReader = entry.createReader();
      const subEntries = await new Promise((resolve) => {
        const allEntries = [];
        const readEntries = () => {
          dirReader.readEntries((entries) => {
            if (entries.length === 0) {
              resolve(allEntries);
            } else {
              allEntries.push(...entries);
              readEntries();
            }
          }, () => resolve(allEntries));
        };
        readEntries();
      });
      const subFiles = await processEntries(subEntries);
      return subFiles;
    }
    return [];
  };
  
  for (const entry of entries) {
    const entryFiles = await readEntry(entry);
    files.push(...entryFiles);
  }
  
  return files;
};

/**
 * Processes multiple files from drag/drop or file picker.
 * Filters supported formats, updates asset gallery, and loads first file.
 * Called from SidePanel (file picker) and initDragDrop (drag/drop).
 * 
 * @param {File[]} files - Array of File objects to process
 */
export const handleMultipleFiles = async (files) => {
  if (!files || files.length === 0) return;
  const store = getStoreState();
  const result = await setAssetListManager(files);
  
  if (result.count === 0) {
    store.setStatus(`No supported files found. Supported: ${supportedExtensionsText}`);
    return;
  }
  
  // Update store with assets
  store.setAssets(result.assets);
  
  if (result.count === 1) {
    // Single file - load directly
    setCurrentAssetIndexManager(0);
    store.setCurrentAssetIndex(0);
    await loadSplatFile(result.assets[0].file);
  } else {
    // Multiple files - show gallery and start loading
    store.addLog(`Found ${result.count} assets`);
    
    // Set up preview generation callback
    onPreviewGenerated((asset, index) => {
      store.updateAssetPreview(index, asset.preview);
    });
    
    // Load first asset (preview will be captured automatically after warmup)
    setCurrentAssetIndexManager(0);
    store.setCurrentAssetIndex(0);
    await loadSplatFile(result.assets[0].file);
  }
};

/**
 * Loads a specific asset by index.
 * Called from AssetGallery component when user clicks a thumbnail.
 * @param {number} index - Asset index to load
 */
export const loadAssetByIndex = async (index) => {
  const currentIndex = getCurrentAssetIndex();
  if (index === currentIndex) return;
  
  const asset = getAssetByIndex(index);
  if (!asset) return;
  
  const store = getStoreState();
  setCurrentAssetIndexManager(index);
  store.setCurrentAssetIndex(index);
  await loadSplatFile(asset.file);
};

/**
 * Loads the next asset in the list.
 * Called from keyboard shortcut (arrow keys).
 */
export const loadNextAsset = async () => {
  if (!hasMultipleAssets()) return;
  
  const asset = nextAsset();
  if (asset) {
    const index = getCurrentAssetIndex();
    const store = getStoreState();
    store.setCurrentAssetIndex(index);
    await loadSplatFile(asset.file);
  }
};

/**
 * Loads the previous asset in the list.
 * Called from keyboard shortcut (arrow keys).
 */
export const loadPrevAsset = async () => {
  if (!hasMultipleAssets()) return;
  
  const asset = prevAsset();
  if (asset) {
    const index = getCurrentAssetIndex();
    const store = getStoreState();
    store.setCurrentAssetIndex(index);
    await loadSplatFile(asset.file);
  }
};
