/**
 * Slideshow controller module.
 * Simple auto-advance: uses existing transitions, holds after fade-in, then advances.
 */

import { useStore } from "./store.js";
import { loadNextAsset } from "./fileLoader.js";
import { hasMultipleAssets } from "./assetManager.js";

const getStoreState = () => useStore.getState();

let isPlaying = false;
let holdTimeoutId = null;

/**
 * Starts slideshow playback.
 * Waits for hold duration, then advances to next asset.
 */
export const startSlideshow = () => {
  if (isPlaying) return;
  if (!hasMultipleAssets()) return;
  
  isPlaying = true;
  getStoreState().setSlideshowPlaying(true);
  
  // Start the hold timer for current asset
  scheduleNextAdvance();
};

/**
 * Stops slideshow playback.
 */
export const stopSlideshow = () => {
  isPlaying = false;
  getStoreState().setSlideshowPlaying(false);
  
  if (holdTimeoutId) {
    clearTimeout(holdTimeoutId);
    holdTimeoutId = null;
  }
};

/**
 * Schedules the next auto-advance after hold duration.
 */
const scheduleNextAdvance = () => {
  if (!isPlaying) return;
  
  const holdDuration = getStoreState().slideshowDuration ?? 3;
  
  if (holdTimeoutId) {
    clearTimeout(holdTimeoutId);
  }
  
  holdTimeoutId = setTimeout(async () => {
    if (!isPlaying) return;
    
    try {
      // Use existing loadNextAsset which handles all transitions
      await loadNextAsset();
      
      // Schedule next advance after this one completes
      if (isPlaying) {
        scheduleNextAdvance();
      }
    } catch (err) {
      console.warn('Slideshow advance failed:', err);
      // Try to continue anyway
      if (isPlaying) {
        scheduleNextAdvance();
      }
    }
  }, holdDuration * 1000);
};

/**
 * Toggles slideshow playback on/off.
 */
export const toggleSlideshow = () => {
  if (isPlaying) {
    stopSlideshow();
  } else {
    startSlideshow();
  }
};

/**
 * Returns whether slideshow is currently playing.
 */
export const isSlideshowPlaying = () => isPlaying;

/**
 * Restarts the hold timer (call after manual navigation during slideshow).
 */
export const resetSlideshowTimer = () => {
  if (isPlaying) {
    scheduleNextAdvance();
  }
};
