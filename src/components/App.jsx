/**
 * Main App component.
 * Root component that initializes the Three.js viewer and
 * orchestrates the main layout (viewer + side panel).
 */

import { useEffect, useState } from 'preact/hooks';
import { useStore } from '../store';
import Viewer from './Viewer';
import SidePanel from './SidePanel';
import { initViewer, startRenderLoop } from '../viewer';
import { resize } from '../fileLoader';

/** Delay before resize after panel toggle animation completes */
const PANEL_TRANSITION_MS = 350;

function App() {
  // Store state
  const panelOpen = useStore((state) => state.panelOpen);
  
  // Local state for viewer initialization
  const [viewerReady, setViewerReady] = useState(false);

  /**
   * Initialize Three.js viewer on mount.
   * Sets up renderer, camera, controls, and render loop.
   */
  useEffect(() => {
    const viewerEl = document.getElementById('viewer');
    if (!viewerEl) return;
    
    initViewer(viewerEl);
    startRenderLoop();
    setViewerReady(true);
    
    // Handle window resize
    window.addEventListener('resize', resize);
    resize();
    
    return () => {
      window.removeEventListener('resize', resize);
    };
  }, []);

  /**
   * Trigger resize after panel toggle animation completes.
   * This ensures the viewer properly fills available space.
   */


  return (
    <div class={`page ${panelOpen ? 'panel-open' : ''}`}>
      <Viewer viewerReady={viewerReady} />
      <SidePanel />
    </div>
  );
}

export default App;
