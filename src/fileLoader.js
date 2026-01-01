/**
 * File loader module - drag/drop, file loading, format handling
 */

import { getFormatHandler, getSupportedExtensions } from "./formats/index.js";
import {
  viewerEl,
  pickBtn,
  fileInput,
  appendLog,
  setStatus,
  updateInfo,
  supportedExtensionsText,
  showAssetGallery,
  renderAssetList,
  updateAssetCount,
  updateAssetActiveState,
  updateAssetPreview,
} from "./ui.js";
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
  setAssetList,
  getAssetList,
  getCurrentAssetIndex,
  setCurrentAssetIndex,
  getAssetByIndex,
  onPreviewGenerated,
  hasMultipleAssets,
  getAssetCount,
  nextAsset,
  prevAsset,
  setCapturePreviewFn,
  captureCurrentAssetPreview,
} from "./assetManager.js";

// Resize callback (set by main.js)
let resizeCallback = null;
export const setResizeCallback = (fn) => { resizeCallback = fn; };

// Update viewer aspect ratio based on image metadata
export const updateViewerAspectRatio = () => {
  const pageEl = document.querySelector(".page");
  const sidePanelEl = document.getElementById("side-panel");
  const padding = 36; // 18px page padding on each side
  const panelWidth = pageEl?.classList.contains("panel-open")
    ? (sidePanelEl?.getBoundingClientRect().width ?? 0) + padding
    : 0;
  const availableWidth = Math.max(0, window.innerWidth - padding - panelWidth);
  const availableHeight = Math.max(0, window.innerHeight - padding);

  if (originalImageAspect && originalImageAspect > 0) {
    let viewerWidth, viewerHeight;
    
    viewerHeight = availableHeight;
    viewerWidth = viewerHeight * originalImageAspect;
    
    if (viewerWidth > availableWidth) {
      viewerWidth = availableWidth;
      viewerHeight = viewerWidth / originalImageAspect;
    }
    
    viewerEl.style.width = `${viewerWidth}px`;
    viewerEl.style.height = `${viewerHeight}px`;
  } else {
    viewerEl.style.width = `${availableWidth}px`;
    viewerEl.style.height = `${availableHeight}px`;
  }
};

export const resize = () => {
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

// Capture a preview thumbnail from the current render
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

// Initialize capture function for asset manager
setCapturePreviewFn(capturePreviewThumbnail);

// Capture background from current render
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
  
  // Set transparent background so blurred image shows through
  scene.background = null;
  renderer.setClearColor(0x000000, 0);
  
  requestRender();
  appendLog("Background captured from model render");
};

export const loadSplatFile = async (file) => {
  if (!file) return;
  const formatHandler = getFormatHandler(file);
  if (!formatHandler) {
    setStatus(`Only ${supportedExtensionsText} 3DGS files are supported`);
    return;
  }

  try {
    viewerEl.classList.add("loading");
    
    setStatus("Reading local file...");
    const start = performance.now();
    const bytes = new Uint8Array(await file.arrayBuffer());

    let cameraMetadata = null;
    try {
      cameraMetadata = await formatHandler.loadMetadata({ file, bytes });
      if (cameraMetadata) {
        const { intrinsics } = cameraMetadata;
        setOriginalImageAspect(intrinsics.imageWidth / intrinsics.imageHeight);
        updateViewerAspectRatio();
        appendLog(
          `${formatHandler.label} camera: fx=${intrinsics.fx.toFixed(1)}, fy=${intrinsics.fy.toFixed(1)}, ` +
            `cx=${intrinsics.cx.toFixed(1)}, cy=${intrinsics.cy.toFixed(1)}, ` +
            `img=${intrinsics.imageWidth}x${intrinsics.imageHeight}`,
        );
      } else {
        setOriginalImageAspect(null);
        updateViewerAspectRatio();
      }
    } catch (error) {
      setOriginalImageAspect(null);
      updateViewerAspectRatio();
      appendLog(`Failed to parse camera metadata, falling back to default view: ${error?.message ?? error}`);
    }

    setStatus(`Parsing ${formatHandler.label} and building splats...`);
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

    // Warmup frames for spark renderer
    let warmupFrames = 120;
    let bgCaptured = false;
    let previewCaptured = false;
    const warmup = () => {
      if (warmupFrames > 0) {
        warmupFrames--;
        requestRender();
        requestAnimationFrame(warmup);
        
        if (!bgCaptured && warmupFrames === 90) {
          bgCaptured = true;
          captureAndApplyBackground();
        }
        
        // Capture preview thumbnail slightly after background (when fully warmed up)
        if (!previewCaptured && warmupFrames === 60) {
          previewCaptured = true;
          captureCurrentAssetPreview();
        }
      }
    };
    warmup();

    const loadMs = performance.now() - start;
    updateInfo({ file, mesh, loadMs });
    
    setTimeout(() => {
      viewerEl.classList.remove("loading");
    }, 100);
    
    setStatus(
      cameraMetadata
        ? "Loaded "
        : "Loaded (no camera data)",
    );
    appendLog(
      `Debug: splats=${mesh.packedSplats.numSplats}`,
    );
  } catch (error) {
    console.error(error);
    viewerEl.classList.remove("loading");
    clearMetadataCamera(resize);
    setStatus("Load failed, please check the file or console log");
  }
};

// Drag and drop handlers
const preventDefaults = (event) => {
  event.preventDefault();
  event.stopPropagation();
};

export const initDragDrop = () => {
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

// Process file/folder entries recursively
const processEntries = async (entries) => {
  const files = [];
  
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

// Handle multiple files (from drop or picker)
export const handleMultipleFiles = async (files) => {
  const result = await setAssetList(files);
  
  if (result.count === 0) {
    setStatus(`No supported files found. Supported: ${supportedExtensionsText}`);
    return;
  }
  
  if (result.count === 1) {
    // Single file - load directly
    showAssetGallery(false);
    setCurrentAssetIndex(0);
    await loadSplatFile(result.assets[0].file);
  } else {
    // Multiple files - show gallery and start loading
    appendLog(`Found ${result.count} assets`);
    showAssetGallery(true);
    
    // Set up preview generation callback
    onPreviewGenerated((asset, index) => {
      updateAssetPreview(index, asset.preview);
    });
    
    // Render initial list (without previews)
    renderAssetList(result.assets, -1, handleAssetClick);
    updateAssetCount(-1, result.count);
    
    // Load first asset (preview will be captured automatically after warmup)
    setCurrentAssetIndex(0);
    updateAssetActiveState(0);
    updateAssetCount(0, result.count);
    await loadSplatFile(result.assets[0].file);
  }
};

// Handle asset click from gallery
const handleAssetClick = async (index) => {
  const currentIndex = getCurrentAssetIndex();
  if (index === currentIndex) return;
  
  const asset = getAssetByIndex(index);
  if (!asset) return;
  
  setCurrentAssetIndex(index);
  updateAssetActiveState(index);
  updateAssetCount(index, getAssetCount());
  await loadSplatFile(asset.file);
};

// Navigate to next asset
export const loadNextAsset = async () => {
  if (!hasMultipleAssets()) return;
  
  const asset = nextAsset();
  if (asset) {
    const index = getCurrentAssetIndex();
    updateAssetActiveState(index);
    updateAssetCount(index, getAssetCount());
    await loadSplatFile(asset.file);
  }
};

// Navigate to previous asset
export const loadPrevAsset = async () => {
  if (!hasMultipleAssets()) return;
  
  const asset = prevAsset();
  if (asset) {
    const index = getCurrentAssetIndex();
    updateAssetActiveState(index);
    updateAssetCount(index, getAssetCount());
    await loadSplatFile(asset.file);
  }
};

export const initFilePicker = () => {
  // Enable multiple file selection
  fileInput.setAttribute("multiple", "");
  // Add webkitdirectory for folder selection (optional secondary button could enable this)
  
  pickBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", async (event) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      await handleMultipleFiles(Array.from(files));
      fileInput.value = "";
    }
  });
};
