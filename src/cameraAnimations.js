import { camera, controls, requestRender, THREE, bgImageContainer } from "./viewer.js";
import { cancelLoadZoomAnimation } from "./customAnimations.js";
import { useStore } from "./store.js";
import gsap from "gsap";

let animationState = null;
let resetAnimationState = null;
let anchorAnimationState = null;
let currentGsapTween = null; // Track active GSAP tween for cancellation

// Easing functions (kept for non-slideshow animations)
const easingFunctions = {
  'linear': (t) => t,
  'ease-in': (t) => t * t * t,
  'ease-out': (t) => 1 - Math.pow(1 - t, 3),
  'ease-in-out': (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
};

// ============================================================================
// SLIDESHOW TIMING CONFIGURATION (GSAP)
// ============================================================================
// These values control the "feel" of slideshow transitions.
// Adjust durations and easing to taste. GSAP supports:
//   - Standard eases: "power1", "power2", "power3", "power4" with .in, .out, .inOut
//   - Custom bezier: "cubic-bezier(0.17, 0.67, 0.83, 0.67)" via CustomEase plugin
//   - See: https://gsap.com/docs/v3/Eases/
//
// Current setup creates continuous motion feel:
//   - Slide-in: rushes in fast, decelerates to slow drift at end
//   - Slide-out: starts with slow drift, accelerates out fast
//   - Handoff between animations feels like one continuous motion
// ============================================================================

export const SLIDESHOW_CONFIG = {
  slideIn: {
    totalDuration: 5,
    speedMultiplier: 1.0,   // NEW: >1 = faster (shorter), <1 = slower (longer)
    decelTimeRatio: 0.45,
    fastSpeed: 1.0,
    slowSpeed: 0.25,
    decelEase: "power3.out",
    slowEase: "none",
  },
  slideOut: {
    totalDuration: 3,
    speedMultiplier: 1.0,   // NEW: >1 = faster (shorter), <1 = slower (longer)
    slowTimeRatio: 0.55,
    fastSpeed: 1.0,
    slowSpeed: 0.25,
    accelEase: "power3.in",
    fadeDelay: 0.7,
  },
};

// Non-slideshow defaults (original behavior)
const DEFAULT_CONFIG = {
  slideIn: {
    duration: 1.2,
    ease: "power2.out",
  },
  slideOut: {
    duration: 1.2,
    ease: "power2.in",
    fadeDelay: 0.7,
  },
};

const getStoreState = () => useStore.getState();

// Smooth reset animation
const easeInOutCubic = easingFunctions['ease-in-out'];

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

    camera.position.lerpVectors(startState.position, targetState.position, eased);
    camera.quaternion.slerpQuaternions(startState.quaternion, targetState.quaternion, eased);
    camera.fov = THREE.MathUtils.lerp(startState.fov, targetState.fov, eased);
    camera.near = THREE.MathUtils.lerp(startState.near, targetState.near, eased);
    camera.far = THREE.MathUtils.lerp(startState.far, targetState.far, eased);
    camera.zoom = THREE.MathUtils.lerp(startState.zoom, targetState.zoom, eased);
    camera.updateProjectionMatrix();

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

    const currentAnchor = new THREE.Vector3().lerpVectors(
      anchorAnimationState.startTarget, 
      anchorAnimationState.endTarget, 
      eased
    );

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

export const cancelAnchorTransition = () => {
  if (anchorAnimationState?.frameId) {
    cancelAnimationFrame(anchorAnimationState.frameId);
  }
  anchorAnimationState = null;
};

// Slide transition state
let slideAnimationState = null;

export const cancelSlideAnimation = () => {
  // Kill GSAP tween if active
  if (currentGsapTween) {
    currentGsapTween.kill();
    currentGsapTween = null;
  }
  
  // Legacy cleanup for non-GSAP state
  if (slideAnimationState?.frameId) {
    cancelAnimationFrame(slideAnimationState.frameId);
  }
  if (slideAnimationState?.fadeTimeoutId) {
    clearTimeout(slideAnimationState.fadeTimeoutId);
  }
  slideAnimationState = null;
  
  const viewerEl = document.getElementById('viewer');
  if (viewerEl) {
    viewerEl.classList.remove('slide-out', 'slide-in');
  }
};

export const cancelResetAnimation = () => {
  if (resetAnimationState?.frameId) {
    cancelAnimationFrame(resetAnimationState.frameId);
  }
  resetAnimationState = null;
};

/**
 * Calculate slide geometry based on mode and direction.
 * Returns start/end positions for camera and target, plus orbit params.
 * This is separated from timing so GSAP can handle the "when" while this handles the "where".
 */
const calculateSlideGeometry = (mode, direction, amount, isSlideOut) => {
  const currentPosition = camera.position.clone();
  const currentTarget = controls.target.clone();
  const distance = currentPosition.distanceTo(currentTarget);

  const forward = new THREE.Vector3().subVectors(currentTarget, currentPosition).normalize();
  const up = camera.up.clone().normalize();
  const right = new THREE.Vector3().crossVectors(forward, up).normalize();

  let offsetPosition, offsetTarget, orbitAxis, orbitAngle;

  switch (mode) {
    case 'zoom':
      // Zoom: move along forward axis
      const zoomAmount = distance * (isSlideOut ? 0.3 : 0.25);
      const zoomDir = isSlideOut ? 1 : -1;
      const zoomOffset = forward.clone().multiplyScalar(zoomAmount * zoomDir);
      offsetPosition = currentPosition.clone().add(zoomOffset);
      offsetTarget = currentTarget.clone();
      orbitAxis = up;
      orbitAngle = 0;
      break;

    case 'fade':
      // Fade: no camera movement
      offsetPosition = currentPosition.clone();
      offsetTarget = currentTarget.clone();
      orbitAxis = up;
      orbitAngle = 0;
      break;

    case 'vertical':
      // Vertical: pan up/down
      const vPanSign = isSlideOut 
        ? (direction === 'next' ? -1 : 1)
        : (direction === 'next' ? 1 : -1);
      const vPanAmount = distance * amount * vPanSign;
      const vPanOffset = up.clone().multiplyScalar(vPanAmount);
      offsetPosition = currentPosition.clone().add(vPanOffset);
      offsetTarget = currentTarget.clone().add(vPanOffset);
      orbitAxis = right;
      orbitAngle = (Math.PI / 180) * 8 * (direction === 'next' ? (isSlideOut ? 1 : -1) : (isSlideOut ? -1 : 1));
      break;

    default: // horizontal
      const hPanSign = isSlideOut
        ? (direction === 'next' ? 1 : -1)
        : (direction === 'next' ? -1 : 1);
      const hPanAmount = distance * amount * hPanSign;
      const hPanOffset = right.clone().multiplyScalar(hPanAmount);
      offsetPosition = currentPosition.clone().add(hPanOffset);
      offsetTarget = currentTarget.clone().add(hPanOffset);
      orbitAxis = up;
      orbitAngle = (Math.PI / 180) * 8 * (direction === 'next' ? (isSlideOut ? 1 : -1) : (isSlideOut ? -1 : 1));
      break;
  }

  if (isSlideOut) {
    return {
      startPosition: currentPosition,
      endPosition: offsetPosition,
      startTarget: currentTarget,
      endTarget: offsetTarget,
      orbitAxis,
      orbitAngle,
    };
  } else {
    return {
      startPosition: offsetPosition,
      endPosition: currentPosition,
      startTarget: offsetTarget,
      endTarget: currentTarget,
      orbitAxis,
      startOrbitAngle: orbitAngle,
    };
  }
};

/**
 * Performs a slide-out animation using GSAP.
 * @param {'next'|'prev'} direction - Navigation direction
 * @param {Object} options - Animation options
 * @returns {Promise} Resolves when animation completes
 */
export const slideOutAnimation = (direction, { duration = 1200, amount = 0.45, fadeDelay = 0.7, mode = 'horizontal' } = {}) => {
  return new Promise((resolve) => {
    const { slideshowMode, slideshowUseCustom } = getStoreState();
    const useCustom = slideshowMode && slideshowUseCustom;
    const config = useCustom ? SLIDESHOW_CONFIG.slideOut : DEFAULT_CONFIG.slideOut;

    const baseDuration = useCustom ? config.totalDuration : duration / 1000;
    const speedMultiplier = useCustom ? (config.speedMultiplier || 1) : 1;
    const durationSec = baseDuration / speedMultiplier;
    const actualFadeDelay = useCustom ? config.fadeDelay : fadeDelay;

    cancelSlideAnimation();

    const viewerEl = document.getElementById('viewer');
    if (viewerEl) {
      viewerEl.classList.remove('slide-in');
    }

    if (!camera || !controls) {
      resolve();
      return;
    }

    // console.log(`[SlideOut] START - duration: ${durationSec}s, mode: ${mode}`);

    const geometry = calculateSlideGeometry(mode, direction, amount, true);
    const { startPosition, endPosition, startTarget, endTarget, orbitAxis, orbitAngle } = geometry;

    const proxy = { t: 0 };
    let progress = 0;
    let lastTime = 0;

    const speedAt = useCustom
      ? createSlideOutSpeedProfile(config, durationSec)
      : null;

    const speedScale = useCustom
      ? computeSpeedScale(speedAt, durationSec)
      : 1;

    const fadeTimeoutId = setTimeout(() => {
      if (viewerEl) viewerEl.classList.add('slide-out');
      if (bgImageContainer) bgImageContainer.classList.remove('active');
    }, durationSec * actualFadeDelay * 1000);

    slideAnimationState = { fadeTimeoutId };

    currentGsapTween = gsap.to(proxy, {
      t: durationSec,
      duration: durationSec,
      ease: "none",
      onUpdate: () => {
        let t = proxy.t;

        if (useCustom) {
          const dt = t - lastTime;
          lastTime = t;
          progress += speedAt(t) * speedScale * dt;
          progress = clamp01(progress);
        } else {
          // legacy non-slideshow behavior
          progress = clamp01(t / durationSec);
          progress = gsap.parseEase(config.ease || "power2.in")(progress);
        }

        camera.position.lerpVectors(startPosition, endPosition, progress);
        controls.target.lerpVectors(startTarget, endTarget, progress);

        if (orbitAngle !== 0) {
          const currentOrbitAngle = orbitAngle * progress;
          const orbitOffset = new THREE.Vector3().subVectors(camera.position, controls.target);
          orbitOffset.applyAxisAngle(orbitAxis, currentOrbitAngle);
          camera.position.copy(controls.target).add(orbitOffset);
        }

        controls.update();
        requestRender();
      },
      onComplete: () => {
        // console.log(`[SlideOut] END`);
        currentGsapTween = null;
        slideAnimationState = null;
        resolve();
      },
    });
  });
};

export const slideInAnimation = (direction, { duration = 1200, amount = 0.45, mode = 'horizontal' } = {}) => {
  return new Promise((resolve) => {
    const { slideshowMode, slideshowUseCustom } = getStoreState();
    const useCustom = slideshowMode && slideshowUseCustom;
    const config = useCustom ? SLIDESHOW_CONFIG.slideIn : DEFAULT_CONFIG.slideIn;

    const baseDuration = useCustom ? config.totalDuration : duration / 1000;
    const speedMultiplier = useCustom ? (config.speedMultiplier || 1) : 1;
    const durationSec = baseDuration / speedMultiplier;

    cancelSlideAnimation();

    const viewerEl = document.getElementById('viewer');
    if (viewerEl) {
      viewerEl.classList.remove('slide-out');
      void viewerEl.offsetHeight;
      viewerEl.classList.add('slide-in');
    }

    if (!camera || !controls) {
      resolve();
      return;
    }

    // console.log(`[SlideIn] START - duration: ${durationSec}s, mode: ${mode}`);

    const geometry = calculateSlideGeometry(mode, direction, amount, false);
    const { startPosition, endPosition, startTarget, endTarget, orbitAxis, startOrbitAngle } = geometry;

    camera.position.copy(startPosition);
    controls.target.copy(startTarget);
    controls.update();
    requestRender();

    const proxy = { t: 0 };
    let progress = 0;
    let lastTime = 0;

    const speedAt = useCustom
      ? createSlideInSpeedProfile(config, durationSec)
      : null;

    const speedScale = useCustom
      ? computeSpeedScale(speedAt, durationSec)
      : 1;

    currentGsapTween = gsap.to(proxy, {
      t: durationSec,
      duration: durationSec,
      ease: "none",
      onUpdate: () => {
        let t = proxy.t;

        if (useCustom) {
          const dt = t - lastTime;
          lastTime = t;
          progress += speedAt(t) * speedScale * dt;
          progress = clamp01(progress);
        } else {
          progress = clamp01(t / durationSec);
          progress = gsap.parseEase(config.ease || "power2.out")(progress);
        }

        camera.position.lerpVectors(startPosition, endPosition, progress);
        controls.target.lerpVectors(startTarget, endTarget, progress);

        if (startOrbitAngle !== 0) {
          const currentOrbitAngle = startOrbitAngle * (1 - progress);
          const orbitOffset = new THREE.Vector3().subVectors(camera.position, controls.target);
          orbitOffset.applyAxisAngle(orbitAxis, currentOrbitAngle);
          camera.position.copy(controls.target).add(orbitOffset);
        }

        controls.update();
        requestRender();
      },
      onComplete: () => {
        // console.log(`[SlideIn] END`);
        currentGsapTween = null;
        slideAnimationState = null;

        if (viewerEl) {
          viewerEl.classList.remove('slide-out', 'slide-in');
        }
        resolve();
      },
    });
  });
};

const clamp01 = (v) => Math.min(1, Math.max(0, v));

const computeSpeedScale = (speedAt, totalDuration, samples = 240) => {
  let total = 0;
  let prevTime = 0;
  let prevSpeed = speedAt(0);

  for (let i = 1; i <= samples; i++) {
    const time = (totalDuration * i) / samples;
    const speed = speedAt(time);
    const dt = time - prevTime;
    // trapezoidal integration
    total += 0.5 * (prevSpeed + speed) * dt;
    prevTime = time;
    prevSpeed = speed;
  }

  return total > 0 ? 1 / total : 1;
};

const createSlideInSpeedProfile = (config, totalDuration) => {
  const total = totalDuration;
  const decelDur = total * config.decelTimeRatio;
  const decelEase = gsap.parseEase(config.decelEase || "power3.out");
  const slowEase = gsap.parseEase(config.slowEase || "none");

  return (time) => {
    if (time <= decelDur) {
      const t = decelDur > 0 ? time / decelDur : 1;
      const eased = decelEase(t);
      return gsap.utils.interpolate(config.fastSpeed, config.slowSpeed, eased);
    }
    const remaining = total - decelDur;
    const t = remaining > 0 ? (time - decelDur) / remaining : 1;
    slowEase(t);
    return config.slowSpeed;
  };
};

const createSlideOutSpeedProfile = (config, totalDuration) => {
  const total = totalDuration;
  const slowDur = total * config.slowTimeRatio;
  const accelDur = Math.max(0, total - slowDur);
  const accelEase = gsap.parseEase(config.accelEase || "power3.in");

  return (time) => {
    if (time <= slowDur) {
      return config.slowSpeed;
    }
    const t = accelDur > 0 ? (time - slowDur) / accelDur : 1;
    const eased = accelEase(t);
    return gsap.utils.interpolate(config.slowSpeed, config.fastSpeed, eased);
  };
};
