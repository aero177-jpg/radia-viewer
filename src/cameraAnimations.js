import { camera, controls, requestRender, THREE, bgImageContainer } from "./viewer.js";
import { cancelLoadZoomAnimation } from "./customAnimations.js";

let animationState = null;
let resetAnimationState = null;
let anchorAnimationState = null;

// Easing functions
const easingFunctions = {
  'linear': (t) => t,
  'ease-in': (t) => t * t * t,
  'ease-out': (t) => 1 - Math.pow(1 - t, 3),
  'ease-in-out': (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2,
};

// NOTE: Load/zoom animation helpers have been moved to customAnimations.js

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

export const cancelAnchorTransition = () => {
  if (anchorAnimationState?.frameId) {
    cancelAnimationFrame(anchorAnimationState.frameId);
  }
  anchorAnimationState = null;
};

// Slide transition state
let slideAnimationState = null;

export const cancelSlideAnimation = () => {
  if (slideAnimationState?.frameId) {
    cancelAnimationFrame(slideAnimationState.frameId);
  }
  if (slideAnimationState?.fadeTimeoutId) {
    clearTimeout(slideAnimationState.fadeTimeoutId);
  }
  slideAnimationState = null;
  
  // Clean up CSS transition classes to ensure clean state
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
 * Performs a slide-out animation (pan camera in direction of navigation).
 * @param {'next'|'prev'} direction - Navigation direction
 * @param {Object} options - Animation options
 * @param {string} options.mode - Slide mode: 'horizontal', 'vertical', 'zoom', or 'fade'
 * @returns {Promise} Resolves when animation completes
 */
export const slideOutAnimation = (direction, { duration = 1200, amount = 0.45, fadeDelay = 0.7, mode = 'horizontal' } = {}) => {
  return new Promise((resolve) => {
    
    if (!camera || !controls) {
      resolve();
      return;
    }

    cancelSlideAnimation();
    
    const viewerEl = document.getElementById('viewer');
    if (viewerEl) {
      viewerEl.classList.remove('slide-in');
    }
 
    
    // Schedule canvas blur for later in the animation (last 0.45s)
    const fadeTimeoutId = setTimeout(() => {
      if (viewerEl) {
        viewerEl.classList.add('slide-out');
      }
      // Fade background out in sync with canvas blur instead of immediately
      if (bgImageContainer) {
        bgImageContainer.classList.remove('active');
      }
    }, duration * fadeDelay);

    const startPosition = camera.position.clone();
    const startTarget = controls.target.clone();
    const distance = startPosition.distanceTo(startTarget);

    // Calculate direction vectors
    const forward = new THREE.Vector3().subVectors(startTarget, startPosition).normalize();
    const up = camera.up.clone().normalize();
    const right = new THREE.Vector3().crossVectors(forward, up).normalize();

    let endPosition, endTarget, orbitAxis, orbitAngle;
    
    if (mode === 'zoom') {
      // Zoom: move closer to target without orbit
      const zoomAmount = distance * 0.3; // Zoom in by 30% of distance
      const zoomOffset = forward.clone().multiplyScalar(zoomAmount);
      endPosition = startPosition.clone().add(zoomOffset);
      endTarget = startTarget.clone(); // Target stays the same
      orbitAxis = up;
      orbitAngle = 0; // No orbit rotation for zoom
    } else if (mode === 'fade') {
      // Fade: keep camera static (no pan/zoom)
      endPosition = startPosition.clone();
      endTarget = startTarget.clone();
      orbitAxis = up;
      orbitAngle = 0;
    } else if (mode === 'vertical') {
      // Vertical mode: pan up/down
      const panSign = direction === 'next' ? -1 : 1; // next = pan down, prev = pan up
      const panAmount = distance * amount * panSign;
      const panOffset = up.clone().multiplyScalar(panAmount);
      endPosition = startPosition.clone().add(panOffset);
      endTarget = startTarget.clone().add(panOffset);
      // Orbit around right axis for vertical movement
      orbitAxis = right;
      orbitAngle = (Math.PI / 180) * 8 * (direction === 'next' ? 1 : -1);
    } else {
      // Horizontal mode (default): pan left/right
      const panSign = direction === 'next' ? 1 : -1;
      const panAmount = distance * amount * panSign;
      const panOffset = right.clone().multiplyScalar(panAmount);
      endPosition = startPosition.clone().add(panOffset);
      endTarget = startTarget.clone().add(panOffset);
      orbitAxis = up;
      orbitAngle = (Math.PI / 180) * 8 * (direction === 'next' ? 1 : -1);
    }

    const animate = (timestamp) => {
      if (!slideAnimationState) {
        resolve();
        return;
      }

      if (slideAnimationState.startTime == null) {
        slideAnimationState.startTime = timestamp;
      }

      const elapsed = timestamp - slideAnimationState.startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = easingFunctions['ease-in'](t);

      // Interpolate position and target
      camera.position.lerpVectors(startPosition, endPosition, eased);
      controls.target.lerpVectors(startTarget, endTarget, eased);

      // Add orbit rotation (skip for zoom mode)
      if (orbitAngle !== 0) {
        const currentOrbitAngle = orbitAngle * eased;
        const orbitOffset = new THREE.Vector3().subVectors(camera.position, controls.target);
        orbitOffset.applyAxisAngle(orbitAxis, currentOrbitAngle);
        camera.position.copy(controls.target).add(orbitOffset);
      }

      controls.update();
      requestRender();

      if (t < 1) {
        slideAnimationState.frameId = requestAnimationFrame(animate);
      } else {
        slideAnimationState = null;
        resolve();
      }
    };

    slideAnimationState = {
      frameId: requestAnimationFrame(animate),
      startTime: null,
      fadeTimeoutId,
    };
  });
};

/**
 * Performs a slide-in animation (camera starts offset, slides to center).
 * Call this AFTER setting up the new camera position.
 * @param {'next'|'prev'} direction - Navigation direction (determines start offset)
 * @param {Object} options - Animation options
 * @param {string} options.mode - Slide mode: 'horizontal', 'vertical', 'zoom', or 'fade'
 * @returns {Promise} Resolves when animation completes
 */
export const slideInAnimation = (direction, { duration = 7000, amount = 0.45, mode = 'horizontal' } = {}) => {
  return new Promise((resolve) => {
    cancelSlideAnimation();
    
    const viewerEl = document.getElementById('viewer');
    const canvas = viewerEl?.querySelector('canvas');
    
 

    
    // For non-fade modes, remove slide-out synchronously before setting up camera
    if (viewerEl) {
      viewerEl.classList.remove('slide-out');
      void viewerEl.offsetHeight;
      viewerEl.classList.add('slide-in');
    }

    if (!camera || !controls) {
      resolve();
      return;
    }

    // End position is current (target) position
    const endPosition = camera.position.clone();
    const endTarget = controls.target.clone();
    const distance = endPosition.distanceTo(endTarget);

    // Calculate direction vectors
    const forward = new THREE.Vector3().subVectors(endTarget, endPosition).normalize();
    const up = camera.up.clone().normalize();
    const right = new THREE.Vector3().crossVectors(forward, up).normalize();

    let startPosition, startTarget, orbitAxis, startOrbitAngle;
    if (mode === 'zoom') {
      // Zoom start: begin further out, then ease in
      const zoomAmount = distance * 0.25; // Start 25% further out
      const zoomOffset = forward.clone().multiplyScalar(-zoomAmount);
      startPosition = endPosition.clone().add(zoomOffset);
      startTarget = endTarget.clone(); // Target stays the same
      orbitAxis = up;
      startOrbitAngle = 0; // No orbit rotation for zoom
    } else if (mode === 'fade') {
      // Fade: keep camera static (no offset)
      startPosition = endPosition.clone();
      startTarget = endTarget.clone();
      orbitAxis = up;
      startOrbitAngle = 0;
    } else if (mode === 'vertical') {
      // Vertical mode: start offset vertically
      const panSign = direction === 'next' ? 1 : -1; // Opposite of slide-out
      const panAmount = distance * amount * panSign;
      const panOffset = up.clone().multiplyScalar(panAmount);
      startPosition = endPosition.clone().add(panOffset);
      startTarget = endTarget.clone().add(panOffset);
      // Orbit around right axis for vertical movement
      orbitAxis = right;
      startOrbitAngle = (Math.PI / 180) * 8 * (direction === 'next' ? -1 : 1);
    } else {
      // Horizontal mode (default): start offset horizontally
      const panSign = direction === 'next' ? -1 : 1;
      const panAmount = distance * amount * panSign;
      const panOffset = right.clone().multiplyScalar(panAmount);
      startPosition = endPosition.clone().add(panOffset);
      startTarget = endTarget.clone().add(panOffset);
      orbitAxis = up;
      startOrbitAngle = (Math.PI / 180) * 8 * (direction === 'next' ? -1 : 1);
    }

    // Set camera to start position
    camera.position.copy(startPosition);
    controls.target.copy(startTarget);
    controls.update();
    requestRender();

    const animate = (timestamp) => {
      if (!slideAnimationState) {
        resolve();
        return;
      }

      if (slideAnimationState.startTime == null) {
        slideAnimationState.startTime = timestamp;
      }

      const elapsed = timestamp - slideAnimationState.startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = easingFunctions['ease-out'](t);

      // Interpolate position and target
      camera.position.lerpVectors(startPosition, endPosition, eased);
      controls.target.lerpVectors(startTarget, endTarget, eased);

      // Add orbit rotation (skip for zoom mode)
      if (startOrbitAngle !== 0) {
        const currentOrbitAngle = startOrbitAngle * (1 - eased);
        const orbitOffset = new THREE.Vector3().subVectors(camera.position, controls.target);
        orbitOffset.applyAxisAngle(orbitAxis, currentOrbitAngle);
        camera.position.copy(controls.target).add(orbitOffset);
      }

      controls.update();
      requestRender();

      if (t < 1) {
        slideAnimationState.frameId = requestAnimationFrame(animate);
      } else {
        slideAnimationState = null;
        // Clean up blur classes after slide-in completes
        const viewerEl = document.getElementById('viewer');
        if (viewerEl) {
          viewerEl.classList.remove('slide-out', 'slide-in');
        }
     
        resolve();
      }
    };

    slideAnimationState = {
      frameId: requestAnimationFrame(animate),
      startTime: null,
    };
  });
};
