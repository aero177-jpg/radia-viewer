import { camera, controls, requestRender, THREE } from "./viewer.js";

let animationState = null;
let resetAnimationState = null;
let anchorAnimationState = null;
let animationEnabled = true;

const sweepPresets = {
  left: { axis: "up", startDeg: 4, endDeg: 0 },
  right: { axis: "up", startDeg: -4, endDeg: 0 },
  down: { axis: "right", startDeg: 4, endDeg: 0 },
  up: { axis: "right", startDeg: -4, endDeg: 0 },
};

const sweepPresetKeys = Object.keys(sweepPresets);

const intensityPresets = {
  subtle: { zoomOutFactor: 1, duration: 1200, sweepMultiplier: 0.5 },
  medium: { zoomOutFactor: 1.05, duration: 1800, sweepMultiplier: 1.0 },
  dramatic: { zoomOutFactor: 1.1, duration: 2400, sweepMultiplier: 1.5 },
};

const validDirections = ["left", "right", "up", "down", "none"];

let currentIntensityKey = "medium";
let currentDirectionChoice = "left";

const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);

export const cancelLoadZoomAnimation = () => {
  if (animationState?.frameId) {
    cancelAnimationFrame(animationState.frameId);
  }
  if (animationState) {
    // Re-enable controls on cancel, stay at current position
    controls.enabled = animationState.wasEnabled;
    controls.update();
    requestRender();
  }
  animationState = null;
};

export const getLoadAnimationIntensityKey = () => currentIntensityKey;

export const setLoadAnimationIntensity = (key) => {
  if (intensityPresets[key]) {
    currentIntensityKey = key;
  }
  return currentIntensityKey;
};

export const getLoadAnimationDirection = () => currentDirectionChoice;

export const setLoadAnimationDirection = (direction) => {
  const normalized = direction?.toLowerCase?.();
  if (validDirections.includes(normalized)) {
    currentDirectionChoice = normalized;
  }
  return currentDirectionChoice;
};

export const startLoadZoomAnimation = (options = {}) => {
  const normalizedOptions =
    typeof options === "string"
      ? { direction: options }
      : options ?? {};
  const requestedDirection = normalizedOptions.direction?.toLowerCase?.() ?? null;
  const forcePlayback = Boolean(normalizedOptions.force);

  if (!camera || !controls || (!animationEnabled && !forcePlayback)) return;

  const baseOffset = new THREE.Vector3().subVectors(camera.position, controls.target);
  const distance = baseOffset.length();
  if (!Number.isFinite(distance) || distance <= 0.01) return;

  const intensity = intensityPresets[currentIntensityKey] ?? intensityPresets.medium;
  const sweepMultiplier = intensity.sweepMultiplier ?? 1;

  const resolvedDirection = (() => {
    if (requestedDirection && validDirections.includes(requestedDirection)) {
      return requestedDirection;
    }
    if (validDirections.includes(currentDirectionChoice)) {
      return currentDirectionChoice;
    }
    return "left";
  })();

  const upVector = (controls.object?.up ?? controls.up ?? new THREE.Vector3(0, 1, 0)).clone();
  if (upVector.lengthSq() === 0) {
    upVector.set(0, 1, 0);
  }
  upVector.normalize();

  const rightVector = new THREE.Vector3().copy(baseOffset).cross(upVector);
  if (rightVector.lengthSq() < 1e-6) {
    rightVector.copy(upVector).cross(new THREE.Vector3(1, 0, 0));
    if (rightVector.lengthSq() < 1e-6) {
      rightVector.copy(upVector).cross(new THREE.Vector3(0, 0, 1));
    }
  }
  rightVector.normalize();

  const presetKey = resolvedDirection === "none" ? null : resolvedDirection;
  const preset = presetKey ? sweepPresets[presetKey] ?? sweepPresets[sweepPresetKeys[0]] : null;
  const axisVector = (preset && preset.axis === "right" ? rightVector : upVector).clone();

  const maxOffset = Math.min(Math.max(distance * 0.08, 0.05), distance * 0.35);
  const startRadius = distance * (intensity.zoomOutFactor ?? 1);
  const endRadius = Math.max(distance - maxOffset, distance * 0.65);
  const startAngle = THREE.MathUtils.degToRad((preset ? preset.startDeg : 0) * sweepMultiplier);
  const endAngle = THREE.MathUtils.degToRad(preset?.endDeg ?? 0);
  const duration = intensity.duration ?? 2600;

  // Store the target to orbit around
  const animTarget = controls.target.clone();

  // Move to start position without updating controls
  const initialOffset = baseOffset.clone().applyAxisAngle(axisVector, startAngle).setLength(startRadius);
  camera.position.copy(animTarget).add(initialOffset);
  camera.lookAt(animTarget);
  
  // Disable controls during animation to prevent internal state drift
  const wasEnabled = controls.enabled;
  controls.enabled = false;
  
  requestRender();

  cancelLoadZoomAnimation();

  const animate = (timestamp) => {
    if (!animationState) return;

    if (animationState.startTime == null) {
      animationState.startTime = timestamp;
    }

    const elapsed = timestamp - animationState.startTime;
    const t = Math.min(elapsed / duration, 1);
    const eased = easeOutCubic(t);

    const angle = THREE.MathUtils.lerp(animationState.startAngle, animationState.endAngle, eased);
    const radius = THREE.MathUtils.lerp(animationState.startRadius, animationState.endRadius, eased);
    const offset = animationState.baseOffset
      .clone()
      .applyAxisAngle(animationState.axisVector, angle)
      .setLength(radius);
    camera.position.copy(animationState.animTarget).add(offset);
    camera.lookAt(animationState.animTarget);
    requestRender();

    if (t < 1) {
      animationState.frameId = requestAnimationFrame(animate);
    } else {
      // Animation complete - re-enable controls at current position
      controls.enabled = animationState.wasEnabled;
      controls.update();
      requestRender();
      animationState = null;
    }
  };

  animationState = {
    frameId: requestAnimationFrame(animate),
    startTime: null,
    baseOffset,
    upVector,
    axisVector,
    rightVector,
    startAngle,
    endAngle,
    startRadius,
    endRadius,
    duration,
    animTarget,
    wasEnabled,
  };
};

export const setLoadAnimationEnabled = (enabled) => {
  animationEnabled = Boolean(enabled);
  if (!animationEnabled) {
    cancelLoadZoomAnimation();
  }
};

export const isLoadAnimationEnabled = () => animationEnabled;

// Smooth reset animation
const easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

export const cancelResetAnimation = () => {
  if (resetAnimationState?.frameId) {
    cancelAnimationFrame(resetAnimationState.frameId);
  }
  resetAnimationState = null;
};

export const startSmoothResetAnimation = (targetState, { duration = 800, onComplete } = {}) => {
  if (!camera || !controls || !targetState) return;

  cancelLoadZoomAnimation();
  cancelResetAnimation();

  const startState = {
    position: camera.position.clone(),
    quaternion: camera.quaternion.clone(),
    fov: camera.fov,
    near: camera.near,
    far: camera.far,
    zoom: camera.zoom,
    target: controls.target.clone(),
  };

  const animate = (timestamp) => {
    if (!resetAnimationState) return;

    if (resetAnimationState.startTime == null) {
      resetAnimationState.startTime = timestamp;
    }

    const elapsed = timestamp - resetAnimationState.startTime;
    const t = Math.min(elapsed / duration, 1);
    const eased = easeInOutCubic(t);

    // Lerp position
    camera.position.lerpVectors(startState.position, targetState.position, eased);

    // Slerp quaternion for smooth rotation
    camera.quaternion.slerpQuaternions(startState.quaternion, targetState.quaternion, eased);

    // Lerp FOV, near, far, zoom
    camera.fov = THREE.MathUtils.lerp(startState.fov, targetState.fov, eased);
    camera.near = THREE.MathUtils.lerp(startState.near, targetState.near, eased);
    camera.far = THREE.MathUtils.lerp(startState.far, targetState.far, eased);
    camera.zoom = THREE.MathUtils.lerp(startState.zoom, targetState.zoom, eased);
    camera.updateProjectionMatrix();

    // Lerp controls target
    controls.target.lerpVectors(startState.target, targetState.target, eased);
    controls.update();

    requestRender();

    if (t < 1) {
      resetAnimationState.frameId = requestAnimationFrame(animate);
    } else {
      resetAnimationState = null;
      if (onComplete) onComplete();
    }
  };

  resetAnimationState = {
    frameId: requestAnimationFrame(animate),
    startTime: null,
  };
};

export const cancelAnchorTransition = () => {
  if (anchorAnimationState?.frameId) {
    cancelAnimationFrame(anchorAnimationState.frameId);
  }
  anchorAnimationState = null;
};

export const startAnchorTransition = (nextTarget, { duration = 650, onComplete } = {}) => {
  if (!camera || !controls || !nextTarget) return;

  const currentTarget = controls.target.clone();
  if (currentTarget.distanceTo(nextTarget) < 1e-5) {
    controls.target.copy(nextTarget);
    controls.update();
    requestRender();
    if (typeof onComplete === "function") onComplete();
    return;
  }

  cancelAnchorTransition();
  cancelLoadZoomAnimation();

  const animate = (timestamp) => {
    if (!anchorAnimationState) return;
    if (anchorAnimationState.startTime == null) {
      anchorAnimationState.startTime = timestamp;
    }

    const elapsed = timestamp - anchorAnimationState.startTime;
    const t = Math.min(elapsed / anchorAnimationState.duration, 1);
    const eased = easeInOutCubic(t);

    const currentAnchor = new THREE.Vector3().lerpVectors(anchorAnimationState.startTarget, anchorAnimationState.endTarget, eased);

    controls.target.copy(currentAnchor);
    controls.update();
    requestRender();

    if (t < 1) {
      anchorAnimationState.frameId = requestAnimationFrame(animate);
    } else {
      anchorAnimationState = null;
      if (onComplete) onComplete();
    }
  };

  anchorAnimationState = {
    frameId: requestAnimationFrame(animate),
    startTime: null,
    duration,
    startTarget: currentTarget,
    endTarget: nextTarget.clone(),
  };
};
