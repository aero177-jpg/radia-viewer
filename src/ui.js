/**
 * UI module - DOM references, panel management, status/logging
 */

import {
  getFormatAccept,
  getSupportedExtensions,
  getSupportedLabel,
} from "./formats/index.js";

// Format info for UI
const supportedLabel = getSupportedLabel();
const formatAccept = getFormatAccept();
const supportedExtensions = getSupportedExtensions();
export const supportedExtensionsText = supportedExtensions.join(", ");

// Build and inject HTML template
export const initializeUI = () => {
  const app = document.querySelector("#app");
  
  app.innerHTML = `
    <div class="page">
      <div id="viewer" class="viewer">
        <div class="loading-overlay"><div class="loading-spinner"></div></div>
        <div class="drop-help">
          <div class="eyebrow">Drag ${supportedLabel} files or folders here</div>
          <div class="fine-print">Drop multiple files to browse • Spark + THREE 3DGS</div>
        </div>
      </div>
      <button
        id="panel-toggle"
        class="panel-toggle"
        aria-label="Toggle info panel"
        aria-controls="side-panel"
        aria-expanded="true"
        type="button"
      >></button>
      <div class="side" id="side-panel">
        <div class="header">
          <div>
            <div class="title">3DGS File Upload</div>
          </div>
          <button id="pick-btn" class="primary">Choose File</button>
          <input id="file-input" type="file" accept="${formatAccept}" hidden />
        </div>
        <div class="debug">
          <div class="row"><span>Status</span><span id="status">Waiting for file...</span></div>
          <div class="row"><span>File</span><span id="file-name">-</span></div>
          <div class="row"><span>Size</span><span id="file-size">-</span></div>
          <div class="row"><span>Splats</span><span id="splat-count">-</span></div>
          <div class="row"><span>Time</span><span id="load-time">-</span></div>
        </div>
        <div class="settings">
          <div class="settings-header">
            <span class="settings-eyebrow">Camera Settings</span>
          </div>
          <div class="control-row camera-range-controls">
            <span class="control-label">Orbit range</span>
            <div class="control-track">
              <input type="range" id="camera-range-slider" min="0" max="180" step="0.1" value="5" />
              <span class="control-value" id="camera-range-label">5°</span>
            </div>
          </div>
          <div class="control-row">
            <span class="control-label">FOV</span>
            <div class="control-track">
              <input type="range" id="fov-slider" min="20" max="120" step="1" value="60" />
              <span class="control-value" id="fov-value">60°</span>
            </div>
          </div>
          
          <div class="settings-group">
            <button class="group-toggle" id="anim-settings-toggle" aria-expanded="false">
              <span class="settings-eyebrow">Animation Settings</span>
              <span class="chevron"></span>
            </button>
            <div class="group-content" id="anim-settings-content" hidden>
              <div class="control-row animate-toggle-row">
                <span class="control-label">Animate on load</span>
                <label class="switch">
                  <input type="checkbox" id="animation-toggle" checked />
                  <span class="switch-track" aria-hidden="true"></span>
                </label>
              </div>
              <div class="control-row select-row">
                <span class="control-label">Style</span>
                <select id="animation-intensity-select">
                  <option value="subtle">Subtle</option>
                  <option value="medium" selected>Medium</option>
                  <option value="dramatic">Dramatic</option>
                </select>
              </div>
              <div class="control-row select-row">
                <span class="control-label">Direction</span>
                <select id="animation-direction-select">
                  <option value="left">Left</option>
                  <option value="right">Right</option>
                  <option value="up">Top</option>
                  <option value="down">Bottom</option>
                  <option value="none">None</option>
                </select>
              </div>
            </div>
          </div>

          <div class="settings-footer">
            <button id="recenter-btn" class="secondary">Recenter view</button>
            <button id="auto-anchor-btn" class="secondary">Auto target</button>
          </div>
        </div>
        <div class="asset-gallery" id="asset-gallery">
          <div class="asset-gallery-header">
            <span class="settings-eyebrow">Assets</span>
            <span class="asset-count" id="asset-count"></span>
          </div>
          <div class="asset-list" id="asset-list"></div>
        </div>
        <div class="log-panel" id="log-panel">
          <button
            id="log-toggle"
            class="log-toggle"
            type="button"
            aria-expanded="false"
          >
            <span class="settings-eyebrow">Debug console</span>
            <span class="chevron" aria-hidden="true"></span>
          </button>
          <div class="log" id="log" hidden></div>
        </div>
      </div>
    </div>
  `;
};

// DOM element references (populated after initializeUI)
export let viewerEl;
export let pageEl;
export let sidePanelEl;
export let panelToggleBtn;
export let pickBtn;
export let fileInput;
export let statusEl;
export let fileNameEl;
export let fileSizeEl;
export let splatCountEl;
export let loadTimeEl;
export let boundsEl;
export let logEl;
export let logPanelEl;
export let logToggleBtn;
export let recenterBtn;
export let autoAnchorBtn;
export let cameraRangeSliderEl;
export let cameraRangeLabelEl;
export let fovSliderEl;
export let fovValueEl;
export let assetGalleryEl;
export let assetListEl;
export let assetCountEl;
export let animationToggleEl;
export let animationIntensitySelect;
export let animationDirectionSelect;
export let animSettingsToggleBtn;
export let animSettingsContentEl;

let panelIsOpen = true;
let panelToggleCallback = null;

export const bindElements = () => {
  viewerEl = document.getElementById("viewer");
  pageEl = document.querySelector(".page");
  sidePanelEl = document.getElementById("side-panel");
  panelToggleBtn = document.getElementById("panel-toggle");
  pickBtn = document.getElementById("pick-btn");
  fileInput = document.getElementById("file-input");
  statusEl = document.getElementById("status");
  fileNameEl = document.getElementById("file-name");
  fileSizeEl = document.getElementById("file-size");
  splatCountEl = document.getElementById("splat-count");
  loadTimeEl = document.getElementById("load-time");
  boundsEl = document.getElementById("bounds");
  logEl = document.getElementById("log");
  logPanelEl = document.getElementById("log-panel");
  logToggleBtn = document.getElementById("log-toggle");
  recenterBtn = document.getElementById("recenter-btn");
  autoAnchorBtn = document.getElementById("auto-anchor-btn");
  cameraRangeSliderEl = document.getElementById("camera-range-slider");
  cameraRangeLabelEl = document.getElementById("camera-range-label");
  fovSliderEl = document.getElementById("fov-slider");
  fovValueEl = document.getElementById("fov-value");
  animationToggleEl = document.getElementById("animation-toggle");
  animationIntensitySelect = document.getElementById("animation-intensity-select");
  animationDirectionSelect = document.getElementById("animation-direction-select");
  assetGalleryEl = document.getElementById("asset-gallery");
  assetListEl = document.getElementById("asset-list");
  assetCountEl = document.getElementById("asset-count");
  animSettingsToggleBtn = document.getElementById("anim-settings-toggle");
  animSettingsContentEl = document.getElementById("anim-settings-content");
};

// Logging
const logBuffer = [];

export const appendLog = (message) => {
  const entry = `[${new Date().toLocaleTimeString()}] ${message}`;
  logBuffer.unshift(entry);
  logBuffer.length = Math.min(logBuffer.length, 14);
  if (logEl) logEl.textContent = logBuffer.join("\n");
  console.info(message);
};

export const setStatus = (message) => {
  if (statusEl) statusEl.textContent = message;
  appendLog(message);
};

// Panel state management
export const setLogExpanded = (expanded) => {
  if (!logPanelEl || !logToggleBtn || !logEl) return;
  logPanelEl.classList.toggle("expanded", expanded);
  logToggleBtn.setAttribute("aria-expanded", String(expanded));
  logEl.hidden = !expanded;
};

const updatePanelUiState = (isOpen) => {
  if (!panelToggleBtn || !pageEl) return;
  panelIsOpen = isOpen;
  pageEl.classList.toggle("panel-open", isOpen);
  panelToggleBtn.setAttribute("aria-expanded", String(isOpen));
  panelToggleBtn.textContent = isOpen ? ">" : "<";
  panelToggleBtn.title = isOpen ? "Hide info panel" : "Show info panel";
};

export const setPanelOpen = (isOpen, { emit = true } = {}) => {
  updatePanelUiState(isOpen);
  if (emit && panelToggleCallback) panelToggleCallback();
};

export const togglePanel = ({ emit = true } = {}) => {
  setPanelOpen(!panelIsOpen, { emit });
};

export const isPanelOpen = () => panelIsOpen;

export const initPanelToggle = (onToggle) => {
  if (!panelToggleBtn || !pageEl) return;
  panelToggleCallback = onToggle ?? null;
  
  setPanelOpen(true, { emit: false });

  panelToggleBtn.addEventListener("click", () => {
    togglePanel();
  });
};

export const initLogToggle = () => {
  if (!logToggleBtn || !logPanelEl || !logEl) return;
  setLogExpanded(false);
  logToggleBtn.addEventListener("click", () => {
    const nextState = logToggleBtn.getAttribute("aria-expanded") !== "true";
    setLogExpanded(nextState);
  });
};

export const initAnimationSettingsToggle = () => {
  if (!animSettingsToggleBtn || !animSettingsContentEl) return;
  
  animSettingsToggleBtn.addEventListener("click", () => {
    const isExpanded = animSettingsToggleBtn.getAttribute("aria-expanded") === "true";
    animSettingsToggleBtn.setAttribute("aria-expanded", String(!isExpanded));
    animSettingsContentEl.hidden = isExpanded;
  });
};

// Info display helpers
export const formatBytes = (bytes) => {
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

export const formatVec3 = (vec) =>
  `${vec.x.toFixed(2)}, ${vec.y.toFixed(2)}, ${vec.z.toFixed(2)}`;

export const resetInfo = () => {
  if (fileNameEl) fileNameEl.textContent = "-";
  if (fileSizeEl) fileSizeEl.textContent = "-";
  if (splatCountEl) splatCountEl.textContent = "-";
  if (loadTimeEl) loadTimeEl.textContent = "-";
  if (boundsEl) boundsEl.textContent = "-";
};

export const updateInfo = ({ file, mesh, loadMs }) => {
  if (fileNameEl) fileNameEl.textContent = file.name;
  if (fileSizeEl) fileSizeEl.textContent = formatBytes(file.size);
  if (splatCountEl) splatCountEl.textContent = mesh?.packedSplats?.numSplats ?? "-";
  if (loadTimeEl) loadTimeEl.textContent = `${loadMs.toFixed(1)} ms`;
};

export const updateBounds = (center, size) => {
  if (boundsEl) boundsEl.textContent = `${formatVec3(center)} | size ${formatVec3(size)}`;
};

export const setAnimationToggleChecked = (enabled) => {
  if (animationToggleEl) {
    animationToggleEl.checked = Boolean(enabled);
  }
};

// Asset gallery management
let onAssetClickCallback = null;

export const setOnAssetClick = (callback) => {
  onAssetClickCallback = callback;
};

export const showAssetGallery = (show) => {
  if (assetGalleryEl) {
    assetGalleryEl.classList.toggle("visible", show);
  }
};

export const updateAssetCount = (current, total) => {
  if (assetCountEl) {
    assetCountEl.textContent = total > 1 ? `${current + 1} / ${total}` : "";
  }
};

export const renderAssetList = (assets, currentIndex, onAssetClick) => {
  if (!assetListEl) return;
  
  onAssetClickCallback = onAssetClick;
  
  assetListEl.innerHTML = assets.map((asset, index) => `
    <button 
      class="asset-item ${index === currentIndex ? "active" : ""}" 
      data-index="${index}"
      title="${asset.name}"
    >
      <div class="asset-preview ${asset.preview ? "" : "loading"}">
        ${asset.preview ? `<img src="${asset.preview}" alt="${asset.name}" />` : '<div class="preview-spinner"></div>'}
      </div>
      <span class="asset-name">${truncateFileName(asset.name)}</span>
    </button>
  `).join("");
  
  // Add click handlers
  assetListEl.querySelectorAll(".asset-item").forEach(item => {
    item.addEventListener("click", () => {
      const index = parseInt(item.dataset.index);
      if (onAssetClickCallback) {
        onAssetClickCallback(index);
      }
    });
  });
};

export const updateAssetActiveState = (index) => {
  if (!assetListEl) return;
  
  assetListEl.querySelectorAll(".asset-item").forEach((item, i) => {
    item.classList.toggle("active", i === index);
  });
  
  // Scroll active item into view
  const activeItem = assetListEl.querySelector(".asset-item.active");
  if (activeItem) {
    activeItem.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
};

export const updateAssetPreview = (index, previewUrl) => {
  if (!assetListEl) return;
  
  const item = assetListEl.querySelector(`[data-index="${index}"]`);
  if (item) {
    const previewEl = item.querySelector(".asset-preview");
    if (previewEl) {
      previewEl.classList.remove("loading");
      if (previewUrl && previewUrl.startsWith("data:")) {
        previewEl.innerHTML = `<img src="${previewUrl}" alt="Preview" />`;
      } else {
        // Preview failed - show placeholder
        previewEl.innerHTML = '<div class="preview-failed">•••</div>';
      }
    }
  }
};

const truncateFileName = (name, maxLength = 18) => {
  if (name.length <= maxLength) return name;
  const ext = name.includes(".") ? name.split(".").pop() : "";
  const base = name.slice(0, name.length - ext.length - 1);
  const truncatedBase = base.slice(0, maxLength - ext.length - 4) + "...";
  return ext ? `${truncatedBase}.${ext}` : truncatedBase;
};
