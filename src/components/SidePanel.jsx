/**
 * Side panel component.
 * Contains file upload controls, debug info display, and settings panels.
 * Collapsible via toggle button.
 */

import { useRef, useCallback } from 'preact/hooks';
import { useStore } from '../store';
import CameraControls from './CameraControls';
import AnimationSettings from './AnimationSettings';
import AssetGallery from './AssetGallery';
import LogPanel from './LogPanel';
import { getSupportedLabel, getFormatAccept } from '../formats/index';
import { handleMultipleFiles } from '../fileLoader';

/** Supported file formats label for UI display */
const supportedLabel = getSupportedLabel();

/** File input accept attribute value */
const formatAccept = getFormatAccept();

function SidePanel() {
  // Store state
  const panelOpen = useStore((state) => state.panelOpen);
  const status = useStore((state) => state.status);
  const fileInfo = useStore((state) => state.fileInfo);
  const debugLoadingMode = useStore((state) => state.debugLoadingMode);
  
  // Store actions
  const togglePanel = useStore((state) => state.togglePanel);
  const toggleDebugLoadingMode = useStore((state) => state.toggleDebugLoadingMode);

  // Ref for file input to avoid DOM queries
  const fileInputRef = useRef(null);

  /**
   * Triggers file picker dialog by clicking hidden file input.
   */
  const handlePickFile = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  /**
   * Handles file selection from file picker.
   * Passes selected files to file loader and resets input.
   * @param {Event} event - Change event from file input
   */
  const handleFileChange = useCallback(async (event) => {
    const files = event.target.files;
    if (files && files.length > 0) {
      await handleMultipleFiles(Array.from(files));
      event.target.value = '';
    }
  }, []);

  return (
    <>
      {/* Panel toggle button - fixed position */}
      <button
        class="panel-toggle"
        aria-label="Toggle info panel"
        aria-expanded={panelOpen}
        type="button"
        onClick={togglePanel}
      >
        {panelOpen ? '>' : '<'}
      </button>
      
      {/* Side panel content */}
      <div class="side">
        {/* Header with file upload */}
        <div class="header">
          <div>
            <div class="title">3DGS File Upload</div>
          </div>
          <button class="primary" onClick={handlePickFile}>
            Choose File
          </button>
          <input 
            ref={fileInputRef}
            type="file" 
            accept={formatAccept} 
            multiple 
            hidden 
            onChange={handleFileChange}
          />
        </div>
        
        {/* File info display */}
        <div class="debug">
          <div class="row">
            <span>Status</span>
            <span>{status}</span>
          </div>
          <div class="row">
            <span>File</span>
            <span>{fileInfo.name}</span>
          </div>
          <div class="row">
            <span>Size</span>
            <span>{fileInfo.size}</span>
          </div>
          <div class="row">
            <span>Splats</span>
            <span>{fileInfo.splatCount}</span>
          </div>
          <div class="row">
            <span>Time</span>
            <span>{fileInfo.loadTime}</span>
          </div>
        </div>
        
        {/* Debug controls */}
        {/* <div class="settings">
          <div class="control-row animate-toggle-row">
            <span class="control-label">Debug Loading</span>
            <label class="switch">
              <input
                type="checkbox"
                checked={debugLoadingMode}
                onChange={toggleDebugLoadingMode}
              />
              <span class="switch-track"></span>
            </label>
          </div>
        </div> */}
        
        {/* Settings panels */}
        <CameraControls />
        <AnimationSettings />
        <AssetGallery />
        {/* <LogPanel /> */}
      </div>
    </>
  );
}

export default SidePanel;
