/**
 * Fullscreen control hook using browser fullscreen only.
 */

import { useCallback, useEffect, useState } from 'preact/hooks';

const isBrowserWindowFullscreen = () => {
  if (typeof window === 'undefined' || typeof window.screen === 'undefined') {
    return false;
  }

  const tolerancePx = 2;
  return (
    window.innerWidth >= window.screen.width - tolerancePx &&
    window.innerHeight >= window.screen.height - tolerancePx
  );
};

export default function useFullscreenControls({ resize, requestRender } = {}) {
  const [isRegularFullscreen, setIsRegularFullscreen] = useState(false);

  useEffect(() => {
    const syncRegularFullscreen = () => {
      const hasFullscreenElement = Boolean(document.fullscreenElement);
      setIsRegularFullscreen(hasFullscreenElement || isBrowserWindowFullscreen());
    };

    syncRegularFullscreen();
    document.addEventListener('fullscreenchange', syncRegularFullscreen);
    window.addEventListener('resize', syncRegularFullscreen);
    window.addEventListener('orientationchange', syncRegularFullscreen);
    return () => {
      document.removeEventListener('fullscreenchange', syncRegularFullscreen);
      window.removeEventListener('resize', syncRegularFullscreen);
      window.removeEventListener('orientationchange', syncRegularFullscreen);
    };
  }, []);

  const handleToggleRegularFullscreen = useCallback(async () => {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen();
      } else {
        await document.documentElement.requestFullscreen();
      }

      requestAnimationFrame(() => {
        if (resize) resize();
        if (requestRender) requestRender();
      });
    } catch (err) {
      console.warn('Regular fullscreen toggle failed:', err);
    }
  }, [resize, requestRender]);

  return {
    isRegularFullscreen,
    handleToggleRegularFullscreen,
  };
}
