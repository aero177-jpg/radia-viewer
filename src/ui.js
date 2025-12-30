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
          <div class="eyebrow">Drag ${supportedLabel} files here</div>
          <div class="fine-print">Spark + THREE 3DGS</div>
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
          <div class="control-row bg-blur-controls" id="bg-blur-controls">
            <span class="control-label">Background blur</span>
            <div class="control-track">
              <input type="range" id="bg-blur-slider" min="10" max="100" value="40" />
              <span class="control-value" id="bg-blur-value">40px</span>
            </div>
          </div>
          <div class="settings-footer">
            <button id="recenter-btn" class="secondary">Recenter view</button>
          </div>
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
export let cameraRangeSliderEl;
export let cameraRangeLabelEl;
export let fovSliderEl;
export let fovValueEl;
export let bgBlurControlsEl;
export let bgBlurSlider;
export let bgBlurValue;

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
  cameraRangeSliderEl = document.getElementById("camera-range-slider");
  cameraRangeLabelEl = document.getElementById("camera-range-label");
  fovSliderEl = document.getElementById("fov-slider");
  fovValueEl = document.getElementById("fov-value");
  bgBlurControlsEl = document.getElementById("bg-blur-controls");
  bgBlurSlider = document.getElementById("bg-blur-slider");
  bgBlurValue = document.getElementById("bg-blur-value");
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
