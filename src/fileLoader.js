/**
 * File loader module - drag/drop, file loading, format handling
 */

import { getFormatHandler } from "./formats/index.js";
import {
  viewerEl,
  pickBtn,
  fileInput,
  bgBlurControlsEl,
  bgBlurSlider,
  appendLog,
  setStatus,
  updateInfo,
  supportedExtensionsText,
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
  composer.setSize(clientWidth, clientHeight);
  
  if (activeCamera) {
    applyCameraProjection(activeCamera, clientWidth, clientHeight);
  } else {
    camera.aspect = clientWidth / clientHeight;
    camera.updateProjectionMatrix();
  }
  requestRender();
};

// Capture background from current render
const captureAndApplyBackground = () => {
  if (!currentMesh) return;

  // Set solid background for capture
  scene.background = new THREE.Color("#0c1018");
  renderer.setClearColor(0x0c1018, 1);
  
  composer.render();
  
  const dataUrl = renderer.domElement.toDataURL("image/jpeg", 0.9);
  
  setBgImageUrl(dataUrl);
  const blur = parseInt(bgBlurSlider?.value || 40);
  updateBackgroundImage(dataUrl, blur);
  
  // Set transparent background so blurred image shows through
  scene.background = null;
  renderer.setClearColor(0x000000, 0);
  
  if (bgBlurControlsEl) bgBlurControlsEl.classList.add("visible");
  
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
    if (formatHandler.colorSpace === "linear") {
      if (!composer.passes.includes(outputPass)) {
        composer.addPass(outputPass);
      }
    } else {
      composer.removePass(outputPass);
    }

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

    // Warmup frames for spark renderer
    let warmupFrames = 120;
    let bgCaptured = false;
    const warmup = () => {
      if (warmupFrames > 0) {
        warmupFrames--;
        requestRender();
        requestAnimationFrame(warmup);
        
        if (!bgCaptured && warmupFrames === 90) {
          bgCaptured = true;
          captureAndApplyBackground();
        }
      }
    };
    warmup();

    const loadMs = performance.now() - start;
    updateInfo({ file, mesh, loadMs });
    saveHomeView();
    
    setTimeout(() => {
      viewerEl.classList.remove("loading");
    }, 100);
    
    setStatus(
      cameraMetadata
        ? "Loaded (using file camera: drag to rotate / scroll to zoom)"
        : "Loaded: drag to rotate / scroll to zoom",
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

  viewerEl.addEventListener("drop", (event) => {
    const file = event.dataTransfer?.files?.[0];
    viewerEl.classList.remove("dragging");
    loadSplatFile(file);
  });
};

export const initFilePicker = () => {
  pickBtn.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", (event) => {
    const file = event.target.files?.[0];
    if (file) {
      loadSplatFile(file);
      fileInput.value = "";
    }
  });
};
