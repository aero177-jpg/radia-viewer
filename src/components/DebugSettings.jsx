/**
 * Debug settings dropdown for the side panel.
 * Hosts FPS overlay toggle and viewer debug controls.
 */

import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown } from '@fortawesome/free-solid-svg-icons';
import { useStore } from '../store';
import { captureCurrentAssetPreview, getAssetList, getCurrentAssetIndex } from '../assetManager';
import { savePreviewBlob } from '../fileStorage';
import { generateAllPreviews, abortBatchPreview } from '../batchPreview';
import { resize } from '../fileLoader';
import { clearCustomMetadataForAsset } from '../customMetadata.js';
import { requestRender, setStereoEffectEnabled } from '../viewer';
import { formatBytes } from '../previewManager.js';
import { getSource, isSourceAsset, loadAssetFile } from '../storage/index.js';
import { zipSync } from 'fflate';
import TransferDataModal from './TransferDataModal';
import ExportChoiceModal from './ExportChoiceModal';


function DebugSettings() {
  const showFps = useStore((state) => state.showFps);
  const setShowFps = useStore((state) => state.setShowFps);
  const assets = useStore((state) => state.assets);
  const currentAssetIndex = useStore((state) => state.currentAssetIndex);
  const activeSourceId = useStore((state) => state.activeSourceId);
  const debugSettingsExpanded = useStore((state) => state.debugSettingsExpanded);
  const toggleDebugSettingsExpanded = useStore((state) => state.toggleDebugSettingsExpanded);
  const updateAssetPreview = useStore((state) => state.updateAssetPreview);
  const setAssets = useStore((state) => state.setAssets);
  const setCurrentAssetIndex = useStore((state) => state.setCurrentAssetIndex);
  const addLog = useStore((state) => state.addLog);
  const bgBlur = useStore((state) => state.bgBlur);
  const setBgBlur = useStore((state) => state.setBgBlur);
  const debugStochasticRendering = useStore((state) => state.debugStochasticRendering);
  const setDebugStochasticRendering = useStore((state) => state.setDebugStochasticRendering);
  const debugFpsLimitEnabled = useStore((state) => state.debugFpsLimitEnabled);
  const setDebugFpsLimitEnabled = useStore((state) => state.setDebugFpsLimitEnabled);
  const debugSparkMaxStdDev = useStore((state) => state.debugSparkMaxStdDev);
  const setDebugSparkMaxStdDev = useStore((state) => state.setDebugSparkMaxStdDev);
  const setQualityPreset = useStore((state) => state.setQualityPreset);
  const customMetadataAvailable = useStore((state) => state.customMetadataAvailable);
  const setCustomMetadataAvailable = useStore((state) => state.setCustomMetadataAvailable);
  const setCustomMetadataControlsVisible = useStore((state) => state.setCustomMetadataControlsVisible);
  const stereoEnabled = useStore((state) => state.stereoEnabled);
  const setStereoEnabled = useStore((state) => state.setStereoEnabled);

  const {
    currentAssetName,
    currentAssetHasCustomMetadata,
    setCurrentAssetHasCustomMetadata,
    resetCustomMetadataState,
  } = useStore();

  const [generatingPreview, setGeneratingPreview] = useState(false);
  const [batchProgress, setBatchProgress] = useState(null); // { current, total, name }
  const [generatingBatch, setGeneratingBatch] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);

  const currentAsset = assets[currentAssetIndex] || null;
  const currentAssetSize = currentAsset?.file?.size ?? currentAsset?.size ?? null;

  const collectionInfo = useMemo(() => {
    const source = activeSourceId ? getSource(activeSourceId) : null;
    const collectionName = source?.name || source?.config?.collectionName || 'Current collection';
    const totalAssets = assets.length;
    const sizeValues = assets.map((asset) => asset?.file?.size ?? asset?.size).filter((size) => Number.isFinite(size));
    const allSizesKnown = totalAssets > 0 && sizeValues.length === totalAssets;
    const totalSize = sizeValues.reduce((sum, size) => sum + size, 0);
    const sogCount = assets.filter((asset) => {
      const name = (asset?.name || asset?.path || '').toLowerCase();
      return name.endsWith('.sog');
    }).length;
    const estimatedBytes = sogCount > 0 ? sogCount * 11 * 1024 * 1024 : null;

    return {
      collectionName,
      totalAssets,
      allSizesKnown,
      totalSize,
      estimatedBytes,
      sogCount,
    };
  }, [activeSourceId, assets]);

  const refreshAssets = useCallback(() => {
    const assets = getAssetList();
    const idx = getCurrentAssetIndex();
    setAssets([...assets]);
    setCurrentAssetIndex(idx);
  }, [setAssets, setCurrentAssetIndex]);

  /** Toggle FPS overlay visibility */
  const handleFpsToggle = useCallback((e) => {
    const enabled = Boolean(e.target.checked);
    setShowFps(enabled);
    const el = document.getElementById('fps-counter');
    if (el) el.style.display = enabled ? 'block' : 'none';
  }, [setShowFps]);

  /** Toggle stochastic rendering */
  const handleStochasticToggle = useCallback((e) => {
    const enabled = Boolean(e.target.checked);
    setQualityPreset('debug-custom');
    setDebugStochasticRendering(enabled);
  }, [setDebugStochasticRendering, setQualityPreset]);

  /** Toggle FPS limiting */
  const handleFpsLimitToggle = useCallback((e) => {
    const enabled = Boolean(e.target.checked);
    setQualityPreset('debug-custom');
    setDebugFpsLimitEnabled(enabled);
  }, [setDebugFpsLimitEnabled, setQualityPreset]);

  /** Toggle side-by-side stereo effect; enter fullscreen when enabling */
  const handleStereoToggle = useCallback(async (e) => {
    const enabled = e.target.checked;
    const fullscreenRoot = document.getElementById('app');
    if (!fullscreenRoot) return;

    try {
      if (enabled) {
        // Hide background images when entering stereo mode
        const bgContainers = document.querySelectorAll('.bg-image-container');
        bgContainers.forEach(el => el.classList.add('stereo-hidden'));

        if (document.fullscreenElement !== fullscreenRoot) {
          await fullscreenRoot.requestFullscreen();
        }
        setStereoEffectEnabled(true);
        setStereoEnabled(true);
        await new Promise((resolve) => setTimeout(resolve, 1200));
        resize();
        addLog('Side-by-side stereo enabled');
      } else {
        // Restore background images when exiting stereo mode
        const bgContainers = document.querySelectorAll('.bg-image-container');
        bgContainers.forEach(el => el.classList.remove('stereo-hidden'));

        setStereoEffectEnabled(false);
        setStereoEnabled(false);
        requestRender();
        if (document.fullscreenElement === fullscreenRoot) {
          await document.exitFullscreen();
        }
        await new Promise((resolve) => setTimeout(resolve, 1200));
        console.log('Resizing after stereo disable');
        resize();
        addLog('Stereo mode disabled');
      }
    } catch (err) {
      // Restore background images on error
      const bgContainers = document.querySelectorAll('.bg-image-container');
      bgContainers.forEach(el => el.classList.remove('stereo-hidden'));

      setStereoEffectEnabled(false);
      setStereoEnabled(false);
      e.target.checked = false;
      addLog('Stereo toggle failed');
      console.warn('Stereo toggle failed:', err);
    }
  }, [setStereoEnabled, addLog]);

  const handleSparkStdDevChange = useCallback((e) => {
    const value = Number(e.target.value);
    setQualityPreset('debug-custom');
    setDebugSparkMaxStdDev(Number.isFinite(value) ? value : Math.sqrt(5));
  }, [setDebugSparkMaxStdDev, setQualityPreset]);

  const handleClearCustomMetadata = useCallback(async () => {
    if (!currentAssetName || isClearing) return;
    
    setIsClearing(true);
    try {
      await clearCustomMetadataForAsset(currentAssetName);
      setCurrentAssetHasCustomMetadata(false);
      resetCustomMetadataState();
      console.log(`Cleared custom metadata for ${currentAssetName}`);
    } catch (err) {
      console.error("Failed to clear custom metadata:", err);
    } finally {
      setIsClearing(false);
    }
  }, [currentAssetName, isClearing, setCurrentAssetHasCustomMetadata, resetCustomMetadataState]);

  /** Debug: force regenerate preview for current asset */
  const handleRegeneratePreview = useCallback(async () => {
    setGeneratingPreview(true);
    try {
      const currentIndex = getCurrentAssetIndex();
      const assetList = getAssetList();
      const asset = assetList[currentIndex];
      
      if (!asset) {
        addLog('[Debug] No current asset to capture preview for');
        return;
      }
      
      addLog(`[Debug] Capturing preview for asset index ${currentIndex}: ${asset.name}`);
      console.log('[Debug] Asset before capture:', { 
        id: asset.id, 
        name: asset.name, 
        preview: asset.preview,
        previewSource: asset.previewSource 
      });
      
      const result = await captureCurrentAssetPreview();
      
      console.log('[Debug] Capture result:', result);
      console.log('[Debug] Asset after capture:', { 
        id: asset.id, 
        name: asset.name, 
        preview: asset.preview,
        previewSource: asset.previewSource 
      });
      
      if (result?.url) {
        addLog(`[Debug] Preview captured: ${result.url.substring(0, 50)}...`);
        
        // Force update the store directly
        console.log('[Debug] Calling updateAssetPreview with index:', currentIndex, 'preview:', asset.preview);
        updateAssetPreview(currentIndex, asset.preview);
        refreshAssets();
        
        // Also save to IndexedDB
        if (result.blob) {
          await savePreviewBlob(asset.name, result.blob, {
            width: result.width,
            height: result.height,
            format: result.format,
          });
          addLog(`[Debug] Preview saved to IndexedDB`);
        }
      } else {
        addLog('[Debug] Preview capture returned no result');
      }
    } catch (err) {
      console.error('[Debug] Preview regeneration failed:', err);
      addLog(`[Debug] Preview failed: ${err.message}`);
    } finally {
      setGeneratingPreview(false);
    }
  }, [addLog, updateAssetPreview]);

  /** Generate previews for all assets in batch mode */
  const handleGenerateAllPreviews = useCallback(async () => {
    const assetList = getAssetList();
    if (assetList.length === 0) {
      addLog('[BatchPreview] No assets loaded');
      return;
    }

    const confirmed = window.confirm(
      `Generate previews for all ${assetList.length} assets?\n\n` +
      `This will rapidly load each asset without animations and capture a preview image. ` +
      `The UI will be hidden during generation.`
    );
    if (!confirmed) return;

    setGeneratingBatch(true);
    setBatchProgress({ current: 0, total: assetList.length, name: '' });

    try {
      await generateAllPreviews({
        onProgress: (current, total, name) => {
          setBatchProgress({ current, total, name });
        },
        onComplete: (success, failed) => {
          addLog(`[BatchPreview] Done: ${success} succeeded, ${failed} failed`);
        },
      });
    } catch (err) {
      console.error('[BatchPreview] Error:', err);
      addLog(`[BatchPreview] Error: ${err.message}`);
    } finally {
      setGeneratingBatch(false);
      setBatchProgress(null);
      refreshAssets();
    }
  }, [addLog, refreshAssets]);

  /** Abort batch preview generation */
  const handleAbortBatchPreview = useCallback(() => {
    abortBatchPreview();
    addLog('[BatchPreview] Abort requested');
  }, [addLog]);

  const sanitizeFileName = useCallback((name, fallback = 'untitled') => {
    if (!name) return fallback;
    return String(name)
      .replace(/[^a-z0-9._-]+/gi, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 120) || fallback;
  }, []);

  const downloadBlob = useCallback((blob, filename) => {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, []);

  const handleExportCurrentAsset = useCallback(async () => {
    if (!currentAsset) throw new Error('No current asset available');
    const file = currentAsset.file
      ? currentAsset.file
      : (isSourceAsset(currentAsset) ? await loadAssetFile(currentAsset) : null);

    if (!file) throw new Error('Unable to load current asset file');
    downloadBlob(file, file.name || sanitizeFileName(currentAsset.name || 'asset'));
    addLog(`[Export] Downloaded ${file.name || currentAsset.name || 'asset'}`);
  }, [addLog, currentAsset, downloadBlob, sanitizeFileName]);

  const handleExportCollection = useCallback(async () => {
    if (!assets.length) throw new Error('No assets to export');

    const files = {};
    for (let i = 0; i < assets.length; i += 1) {
      const asset = assets[i];
      const assetFile = asset?.file
        ? asset.file
        : (isSourceAsset(asset) ? await loadAssetFile(asset) : null);

      if (!assetFile) {
        throw new Error(`Unable to load asset: ${asset?.name || `#${i + 1}`}`);
      }

      const safeName = sanitizeFileName(assetFile.name || asset?.name || `asset-${i + 1}`);
      const buffer = await assetFile.arrayBuffer();
      files[`assets/${i + 1}-${safeName}`] = new Uint8Array(buffer);
    }

    const zipData = zipSync(files, { level: 6 });
    const blob = new Blob([zipData], { type: 'application/zip' });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const safeCollectionName = sanitizeFileName(collectionInfo.collectionName, 'collection');
    const filename = `${safeCollectionName}-${stamp}.zip`;
    downloadBlob(blob, filename);
    addLog(`[Export] Downloaded collection ZIP (${assets.length} assets)`);
  }, [addLog, assets, collectionInfo.collectionName, downloadBlob, sanitizeFileName]);


  // If fullscreen is exited while stereo is on, disable stereo to avoid misalignment
  useEffect(() => {
    const handleFsChange = () => {
      const fullscreenRoot = document.getElementById('app');
      const inFullscreen = document.fullscreenElement === fullscreenRoot;
      if (stereoEnabled && !inFullscreen) {
        // Restore background images on exit
        const bgContainers = document.querySelectorAll('.bg-image-container');
        bgContainers.forEach(el => el.classList.remove('stereo-hidden'));
        setStereoEffectEnabled(false);
        setStereoEnabled(false);
        requestRender();
        resize();
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, [stereoEnabled, setStereoEnabled]);

  return (
    <>
      <div class="settings-group">
        <button
          class="group-toggle"
          aria-expanded={debugSettingsExpanded}
          onClick={toggleDebugSettingsExpanded}
        >
          <span class="settings-eyebrow">Advanced Settings</span>
          <FontAwesomeIcon icon={faChevronDown} className="chevron" />
        </button>

        <div
          class="group-content"
          style={{ display: debugSettingsExpanded ? 'flex' : 'none' }}
        >
        <div class="settings-divider">
          <span>Viewer</span>
        </div>

        <div class="control-row">
          <span class="control-label">Show FPS</span>
          <label class="switch">
            <input
              type="checkbox"
              checked={showFps}
              onChange={handleFpsToggle}
            />
            <span class="switch-track" aria-hidden="true" />
          </label>
        </div>

        <div class="control-row">
          <span class="control-label">Side-by-side stereo</span>
          <label class="switch">
            <input
              type="checkbox"
              checked={stereoEnabled}
              onChange={handleStereoToggle}
            />
            <span class="switch-track" aria-hidden="true" />
          </label>
        </div>

        <div class="control-row">
          <span class="control-label">Image glow</span>
          <div class="control-track">
            <input
              type="range"
              min="0"
              max="40"
              step="1"
              value={bgBlur}
              onInput={(e) => setBgBlur(Number(e.target.value) || 0)}
            />
            <span class="control-value">{bgBlur}px</span>
          </div>
        </div>

        <div class="settings-divider">
          <span>Cache</span>
        </div>

        <div class="control-row">
          <span class="control-label">Download</span>
          <button
            type="button"
            class="secondary"
            onClick={() => setExportModalOpen(true)}
          >
            Export...
          </button>
        </div>

        <div class="control-row">
          <span class="control-label">Regen preview</span>
          <button
            type="button"
            class={`secondary ${generatingPreview ? 'is-busy' : ''}`}
            onClick={handleRegeneratePreview}
            disabled={generatingPreview}
          >
            {generatingPreview ? 'Capturing...' : 'Capture'}
          </button>
        </div>

        {currentAssetHasCustomMetadata && (
          <div class="control-row">
            <span class="control-label">Clear custom metadata</span>
            <button
              type="button"
              class="secondary danger"
              onClick={handleClearCustomMetadata}
              disabled={isClearing}
            >
              {isClearing ? 'Clearing...' : '🗑️ Clear Custom Metadata'}
            </button>
          </div>
        )}

        <div class="control-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: '8px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span class="control-label">Batch previews</span>
            {generatingBatch ? (
              <button
                type="button"
                class="secondary danger"
                onClick={handleAbortBatchPreview}
              >
                Abort
              </button>
            ) : (
              <button
                type="button"
                class="secondary"
                onClick={handleGenerateAllPreviews}
              >
                Generate All
              </button>
            )}
          </div>
          {batchProgress && (
            <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
              <div style={{ marginBottom: '4px' }}>
                {batchProgress.current}/{batchProgress.total}: {batchProgress.name}
              </div>
              <div
                style={{
                  height: '4px',
                  background: 'var(--color-bg-tertiary)',
                  borderRadius: '2px',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${(batchProgress.current / batchProgress.total) * 100}%`,
                    background: 'var(--color-accent)',
                    transition: 'width 0.2s ease',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        <div class="control-row">
          <span class="control-label">Transfer bundle</span>
          <button
            type="button"
            class="secondary"
            onClick={() => setTransferModalOpen(true)}
          >
            Open
          </button>
        </div>

        <div class="settings-divider">
          <span>Render debug</span>
        </div>

        <div class="control-row">
          <span class="control-label">Stochastic rendering</span>
          <label class="switch">
            <input
              type="checkbox"
              checked={debugStochasticRendering}
              onChange={handleStochasticToggle}
            />
            <span class="switch-track" aria-hidden="true" />
          </label>
        </div>

        <div class="control-row">
          <span class="control-label">Limit FPS (60)</span>
          <label class="switch">
            <input
              type="checkbox"
              checked={debugFpsLimitEnabled}
              onChange={handleFpsLimitToggle}
            />
            <span class="switch-track" aria-hidden="true" />
          </label>
        </div>

        <div class="control-row">
          <span class="control-label">Splat width</span>
          <div class="control-track">
            <input
              type="range"
              min="0.5"
              max="8"
              step="0.1"
              value={debugSparkMaxStdDev}
              onInput={handleSparkStdDevChange}
            />
            <span class="control-value">{debugSparkMaxStdDev.toFixed(2)}</span>
          </div>
        </div>

        </div>
      </div>

      <TransferDataModal
        isOpen={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
        addLog={addLog}
      />
      <ExportChoiceModal
        isOpen={exportModalOpen}
        onClose={() => setExportModalOpen(false)}
        onExportAsset={handleExportCurrentAsset}
        onExportCollection={handleExportCollection}
        assetTitle={currentAsset?.name || 'Current image'}
        assetSubtitle={`Size: ${formatBytes(currentAssetSize)}`}
        collectionTitle={collectionInfo.collectionName}
        collectionSubtitle={
          collectionInfo.allSizesKnown
            ? `${collectionInfo.totalAssets} assets · ${formatBytes(collectionInfo.totalSize)}`
            : `${collectionInfo.totalAssets} assets · ${collectionInfo.estimatedBytes ? `~${formatBytes(collectionInfo.estimatedBytes)} est.` : 'Size unknown'}`
        }
        assetDisabled={!currentAsset}
        collectionDisabled={collectionInfo.totalAssets === 0}
        note={
          collectionInfo.allSizesKnown
            ? ''
            : (collectionInfo.estimatedBytes
              ? `Estimate based on ${collectionInfo.sogCount} .sog file${collectionInfo.sogCount === 1 ? '' : 's'} × 11MB.`
              : '')
        }
      />
    </>
  );
}
export default DebugSettings;
