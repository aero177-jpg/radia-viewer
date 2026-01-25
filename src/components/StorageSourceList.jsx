/**
 * Storage Sources List Component
 * 
 * Displays connected storage sources with status indicators.
 * Allows reconnecting, refreshing, and removing sources.
 */

import { useState, useEffect, useCallback, useMemo } from 'preact/hooks';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFolder,
  faCloud,
  faPlus,
  faTrash,
  faSync,
  faCheck,
  faExclamationTriangle,
  faSpinner,
  faChevronDown,
  faUnlock,
  faUpload,
  faLink,
  faPen,
  faEllipsisVertical,
  faDatabase,
} from '@fortawesome/free-solid-svg-icons';
import {
  getSourcesArray,
  onSourceChange,
  deleteSource,
  touchSource,
  setDefaultSource,
  cacheCollectionAssets,
  syncCollectionCache,
  clearCollectionCache,
  loadSourceAssets,
} from '../storage/index.js';
import { useStore } from '../store';
import { getAssetList } from '../assetManager.js';
import { listCachedFileNames } from '../fileStorage.js';
import ConnectStorageDialog from './ConnectStorageDialog';
import { useCollectionUploadFlow } from './useCollectionUploadFlow.js';

const TYPE_ICONS = {
  'local-folder': faFolder,
  'app-storage': faDatabase,
  'supabase-storage': faCloud,
  'public-url': faLink,
};

const TYPE_LABELS = {
  'local-folder': 'Local',
  'app-storage': 'App',
  'supabase-storage': 'Supabase',
  'public-url': 'URL',
};


const formatEta = (seconds) => {
  const remaining = Math.max(0, Math.ceil(seconds));
  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  if (mins > 0) return `${mins}m ${secs}s`;
  return `${secs}s`;
};

/**
 * Individual source item with controls
 */
function SourceItem({ source, onSelect, onRemove, onEditSource, expanded, onToggleExpand, isActive, onOpenCloudGpu }) {
  const [status, setStatus] = useState('checking');
  const [assetCount, setAssetCount] = useState(source.getAssets().length);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);

  const activeSourceId = useStore((state) => state.activeSourceId);
  const setAssets = useStore((state) => state.setAssets);
  const setUploadState = useStore((state) => state.setUploadState);

  const allowAssets = source.type !== 'local-folder';
  const allowImages = true;

  const handleAssetsUpdated = useCallback(async ({ source: updatedSource }) => {
    if (!updatedSource || activeSourceId !== updatedSource.id) return;
    try {
      const adapted = await loadSourceAssets(updatedSource);
      setAssets(adapted);
    } catch (err) {
      console.warn('Failed to sync assets after upload:', err);
    }
  }, [activeSourceId, setAssets]);

  const refreshCacheFlagsForSource = useCallback(async () => {
    try {
      const cachedNames = await listCachedFileNames();
      const cachedSet = new Set(cachedNames);
      const assetList = getAssetList();
      let changed = false;

      assetList.forEach((asset) => {
        if (asset?.sourceId !== source.id) return;
        const next = cachedSet.has(asset.name);
        if (asset.isCached !== next) {
          asset.isCached = next;
          changed = true;
        }
      });

      if (changed && activeSourceId === source.id) {
        setAssets([...assetList]);
      }
    } catch (err) {
      console.warn('[Storage] Failed to refresh cache flags', err);
    }
  }, [activeSourceId, setAssets, source.id]);


  const refreshAssets = useCallback(async () => {
    setIsLoading(true);
    try {
      if (source.type === 'supabase-storage' && typeof source.rescan === 'function') {
        const applied = await source.rescan({ applyChanges: true });
        if (!applied?.success) {
          setStatus('error');
          return false;
        }
      }

      const assets = await source.listAssets();
      setAssetCount(assets.length);
      setStatus('connected');

      // Best-effort: sync local cache manifest with remote assets
      syncCollectionCache(source, assets)
        .then(() => refreshCacheFlagsForSource())
        .catch((err) => console.warn('[Storage] Cache sync failed', err));
      return true;
    } catch (err) {
      console.error('Refresh failed:', err);
      setStatus('error');
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [refreshCacheFlagsForSource, source]);

  const {
    uploadInputRef: flowInputRef,
    uploadAccept,
    openUploadPicker,
    handleUploadChange: handleFlowUploadChange,
    uploadModal,
  } = useCollectionUploadFlow({
    source,
    allowAssets,
    allowImages,
    onOpenCloudGpu,
    onRefreshAssets: refreshAssets,
    onAssetsUpdated: handleAssetsUpdated,
    onLoadingChange: setIsLoading,
    onUploadingChange: setIsUploading,
    onUploadProgress: setUploadProgress,
    onUploadState: setUploadState,
    onStatus: setStatus,
  });

  const handleCacheAll = useCallback(async (e) => {
    e.stopPropagation();
    setIsLoading(true);
    try {
      if (!source.isConnected()) {
        const result = await source.connect(false);
        if (!result.success) {
          setStatus('error');
          return;
        }
      }

      const assets = await source.listAssets();
      setAssetCount(assets.length);
      await cacheCollectionAssets(source, assets);
      await refreshCacheFlagsForSource();
    } catch (err) {
      console.error('Cache all failed:', err);
      setStatus('error');
    } finally {
      setIsLoading(false);
    }
  }, [refreshCacheFlagsForSource, source]);

  const handleClearCache = useCallback(async (e) => {
    e.stopPropagation();
    setIsLoading(true);
    try {
      await clearCollectionCache(source.id);
      await refreshCacheFlagsForSource();
    } catch (err) {
      console.error('Clear cache failed:', err);
      setStatus('error');
    } finally {
      setIsLoading(false);
    }
  }, [refreshCacheFlagsForSource, source.id]);


  // Check connection status on mount
  useEffect(() => {
    let cancelled = false;

    const checkStatus = async () => {
      // For local folders, NEVER try to auto-connect after browser restart.
      // Loading handles from IndexedDB can crash Chrome.
      // Just show "needs permission" and let user click to reconnect.
      if (source.type === 'local-folder') {
        // Only check if we have an in-memory handle from this session
        if (source.isConnected()) {
          if (!cancelled) {
            setStatus('connected');
            setAssetCount(source.getAssets().length);
          }
        } else {
          // Don't call connect() - that's safe now but still unnecessary.
          // Just show needs-permission and let user click to reconnect.
          if (!cancelled) {
            setStatus('needs-permission');
          }
        }
        return;
      }

      // For other source types (Supabase, URL), use normal flow
      try {
        if (source.isConnected()) {
          if (!cancelled) {
            setStatus('connected');
            setAssetCount(source.getAssets().length);
          }
          return;
        }

        const result = await source.connect(false);
        if (cancelled) return;

        if (result.success) {
          setStatus('connected');
          try {
            const assets = await source.listAssets();
            if (!cancelled) {
              setAssetCount(assets.length);
            }
          } catch (e) {
            console.warn('Failed to list assets:', e);
          }
        } else if (result.needsPermission) {
          setStatus('needs-permission');
        } else {
          setStatus('disconnected');
        } 
      } catch (err) {
        console.warn('Source status check failed:', err);
        if (!cancelled) {
          setStatus('needs-permission');
        }
      }
    };

    // Small delay to let component mount properly
    const timeoutId = setTimeout(checkStatus, 50);

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [source]);

  const handleReconnect = useCallback(async (e) => {
    e.stopPropagation();
    setIsLoading(true);
    setStatus('connecting');

    try {
      // For local folders, reconnect should request permission since this is a user gesture
      if (source.type === 'local-folder' && typeof source.requestPermission === 'function') {
        const result = await source.requestPermission();
        if (result.success) {
          setStatus('connected');
          const assets = await source.listAssets();
          setAssetCount(assets.length);
          await touchSource(source.id);
        } else if (result.needsPermission) {
          setStatus('needs-permission');
        } else {
          setStatus('error');
          if (result?.error) {
            alert(result.error);
          }
        }
      } else {
        // For other source types, use regular connect
        const result = await source.connect(false);
        if (result.success) {
          setStatus('connected');
          const assets = await source.listAssets();
          setAssetCount(assets.length);
          await touchSource(source.id);
        } else if (result.needsPermission) {
          setStatus('needs-permission');
        } else {
          setStatus('error');
        }
      }
    } catch (err) {
      console.error('Reconnect failed:', err);
      setStatus('error');
    } finally {
      setIsLoading(false);
    }
  }, [source]);

  const handleRequestPermission = useCallback(async (e) => {
    e.stopPropagation();
    setIsLoading(true);

    try {
      if (source.type === 'local-folder') {
        if (!('showDirectoryPicker' in window)) {
          alert('Local folder access is not supported in this browser. Try Chrome or Edge.');
          setStatus('error');
          return;
        }

        if (typeof source.requestPermission === 'function') {
          const result = await source.requestPermission();
          if (result.success) {
            setStatus('connected');
            const assets = await source.listAssets();
            setAssetCount(assets.length);
            await touchSource(source.id);
          } else {
            setStatus('error');
            if (result?.error) {
              alert(result.error);
            }
          }
        }
      }
    } catch (err) {
      console.error('Permission request failed:', err);
      alert('Could not grant access. Please try again or re-add the folder.');
      setStatus('error');
    } finally {
      setIsLoading(false);
    }
  }, [source]);

  const handleRefresh = useCallback(async (e) => {
    e.stopPropagation();
    if (!source.isConnected()) return;

    await refreshAssets();
  }, [refreshAssets, source]);

  const handleUploadClick = useCallback((e) => {
    e.stopPropagation();
    openUploadPicker();
  }, [openUploadPicker]);

  const handleUploadChange = useCallback(async (e) => {
    e.stopPropagation();
    await handleFlowUploadChange(e);
  }, [handleFlowUploadChange]);

  const handleAppStoragePick = useCallback((e) => {
    e.stopPropagation();
    if (source.type !== 'app-storage') return;
    openUploadPicker();
  }, [openUploadPicker, source.type]);

  const handleRemove = useCallback(async (e) => {
    e.stopPropagation();
    if (confirm(`Remove "${source.name}" from connected sources?`)) {
      await deleteSource(source.id);
      onRemove?.(source.id);
    }
  }, [source, onRemove]);

  const handleClick = useCallback(() => {
    if (source.isConnected()) {
      onSelect?.(source);
    }
  }, [source, onSelect]);

  const isConnected = status === 'connected';
  const needsPermission = status === 'needs-permission';
  const isDefault = Boolean(source?.config?.isDefault);
  const showUploadProgress = isUploading && uploadProgress;

  // ETA countdown state: set when progress updates, tick down every second while uploading
  const [etaSeconds, setEtaSeconds] = useState(0);
  useEffect(() => {
    if (!showUploadProgress || !uploadProgress) {
      setEtaSeconds(0);
      return;
    }

    const remaining = Math.max(0, (uploadProgress.total - (uploadProgress.completed || 0)) * 40);
    setEtaSeconds(remaining);

    const intervalId = setInterval(() => {
      setEtaSeconds((s) => {
        if (s <= 1) {
          clearInterval(intervalId);
          return 0;
        }
        return s - 1;
      });
    }, 1000);

    return () => clearInterval(intervalId);
  }, [showUploadProgress, uploadProgress?.completed, uploadProgress?.total]);

  const etaLabel = showUploadProgress ? formatEta(etaSeconds) : '';

  const handleSetDefault = useCallback(async (e) => {
    e.stopPropagation();

    setIsLoading(true);
    try {
      // Toggle: if already default, clear it; otherwise set it
      await setDefaultSource(isDefault ? null : source.id);
    } catch (err) {
      console.warn('Failed to set default source:', err);
    } finally {
      setIsLoading(false);
    }
  }, [isDefault, source?.id]);

  const handleEditPublicUrl = useCallback((e) => {
    e.stopPropagation();
    if (source.type !== 'public-url') return;
    onEditSource?.(source);
  }, [onEditSource, source]);

  return (
    <>
      <input
        ref={flowInputRef}
        type="file"
        multiple
        accept={uploadAccept}
        style={{ display: 'none' }}
        onChange={handleUploadChange}
      />
      <div 
        class={`source-item ${isConnected ? 'connected' : ''} ${status} ${isActive ? 'active' : ''}`}
        onClick={handleClick}
        style={{ display: 'flex', flexDirection: 'column' }}
      >
        <div style={{ display: 'flex', alignItems: 'center', width: '100%', minHeight: '32px' }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', minWidth: 0, paddingLeft: '4px', paddingRight: '0px' }}>
            <div class="source-info" style={{ flex: 1 }}>
              <div class="source-name">
                <span class="source-name-text">{source.name}</span>
              </div>
              <div class="source-meta">
                <FontAwesomeIcon icon={TYPE_ICONS[source.type] || faFolder} className="source-type-icon" />
                <span class="source-type">{TYPE_LABELS[source.type]}</span>
                {isConnected && assetCount > 0 && (
                  <span class="source-count">{assetCount}</span>
                )}
              </div>
            </div>

            <div class="source-status">
              {isLoading ? (
                <div class="status-loading">
                  {showUploadProgress && (
                    <span class="upload-progress">
                      {uploadProgress?.completed}/{uploadProgress?.total}  {etaLabel}
                    </span>
                  )}
                  <FontAwesomeIcon icon={faSpinner} spin />
                </div>
              ) : isConnected ? (
                <></>
              ) : needsPermission ? (
                <FontAwesomeIcon icon={faUnlock} className="status-warning" />
              ) : (
                <FontAwesomeIcon icon={faExclamationTriangle} className="status-error" />
              )}
            </div>
          </div>

          <div class="expand-wrapper" style={{ position: 'relative', display: 'flex', alignItems: 'center', paddingLeft: '2px', flexShrink: 0 }}>
            <div
              class="expand-hit-area"
              style={{ width: "40px", height: "40px", position: 'absolute', top: '50%', right: '-4px', transform: 'translateY(-50%)', background: 'transparent', zIndex: 1, cursor: 'pointer' }}
              onClick={(e) => { e.stopPropagation(); onToggleExpand?.(); }}
            />
            <button 
              class="source-expand"
              onClick={(e) => { e.stopPropagation(); onToggleExpand?.(); }}
              style={{ position: 'relative', zIndex: 2 }}
            >
              <FontAwesomeIcon icon={faEllipsisVertical} />
            </button>
          </div>
        </div>

      {expanded && (
        <div class="source-actions" onClick={(e) => e.stopPropagation()}>
          {needsPermission ? (
            <button 
              class="source-action-btn" 
              onClick={handleRequestPermission}
              title="Grant permission"
            >
              <FontAwesomeIcon icon={faUnlock} />
              <span>Grant Access</span>
            </button>
          ) : !isConnected ? (
            <button 
              class="source-action-btn" 
              onClick={handleReconnect}
              title="Reconnect"
            >
              <FontAwesomeIcon icon={faSync} />
              <span>Reconnect</span>
            </button>
          ) : (
            <button 
              class="source-action-btn" 
              onClick={handleRefresh}
              title="Refresh assets"
            >
              <FontAwesomeIcon icon={faSync} />
              <span>Refresh</span>
            </button>
          )}
          <button
            class={`source-action-btn ${isDefault ? 'default' : ''}`}
            onClick={handleSetDefault}
            title={isDefault ? 'Clear default collection' : 'Set as default collection'}
          >
            {isDefault && <FontAwesomeIcon icon={faCheck} />}
            <span>{isDefault ? 'Default' : 'Set Default'}</span>
          </button>
          {source.type === 'public-url' && (
            <button
              class="source-action-btn"
              onClick={handleEditPublicUrl}
              title="Edit URLs"
            >
              <FontAwesomeIcon icon={faPen} />
              <span>Edit</span>
            </button>
          )}
             {source.type === 'app-storage' && (
            <button
              class="source-action-btn"
              onClick={handleAppStoragePick}
              title="Add files to app storage"
            >
              <FontAwesomeIcon icon={faUpload} />
              <span>Add files</span>
            </button>
          )}
          {source.type !== 'public-url' && (
            <button
              class="source-action-btn"
              onClick={handleUploadClick}
              title={source.type === 'supabase-storage' ? 'Upload files to Supabase' : 'Convert images with Cloud GPU'}
            >
              <FontAwesomeIcon icon={faUpload} />
              <span>Upload</span>
            </button>
          )}
          <button
            class="source-action-btn"
            onClick={handleCacheAll}
            title="Cache all assets locally"
          >
            <FontAwesomeIcon icon={faDatabase} />
            <span>Cache</span>
          </button>
          <button
            class="source-action-btn"
            onClick={handleClearCache}
            title="Clear cached assets for this collection"
          >
            <FontAwesomeIcon icon={faTrash} />
            <span>Clear Cache</span>
          </button>
          <button 
            class="source-action-btn danger" 
            onClick={handleRemove}
            title="Remove source"
          >
            <FontAwesomeIcon icon={faTrash} />
            <span>Remove</span>
          </button>
        </div>
      )}
      </div>

      {uploadModal}
    </>
  );
}

/**
 * Storage sources list with collapsible toggle and add button
 */
function StorageSourceList({ onAddSource, onSelectSource, onOpenCloudGpu }) {
  const [sources, setSources] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [isListExpanded, setIsListExpanded] = useState(true);
  const [editSource, setEditSource] = useState(null);
  const activeSourceId = useStore((state) => state.activeSourceId);

  // Load sources on mount and subscribe to changes
  useEffect(() => {
    setSources(getSourcesArray());

    const unsubscribe = onSourceChange((event, sourceId) => {
      setSources(getSourcesArray());
    });

    return unsubscribe;
  }, []);

  const handleToggleExpand = useCallback((sourceId) => {
    setExpandedId(prev => prev === sourceId ? null : sourceId);
  }, []);

  const handleRemove = useCallback((sourceId) => {
    if (expandedId === sourceId) {
      setExpandedId(null);
    }
  }, [expandedId]);

  const handleEditSource = useCallback((source) => {
    setEditSource(source);
  }, []);

  const handleCloseEdit = useCallback(() => {
    setEditSource(null);
  }, []);

  return (
    <div class="settings-group">
      <div 
        class="group-toggle" 
        aria-expanded={isListExpanded}
        onClick={() => setIsListExpanded(!isListExpanded)}
      >
        <span class="settings-eyebrow">Collections</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginRight: '-8px' }}>
          <button 
            class="add-source-btn" 
            onClick={(e) => { e.stopPropagation(); onAddSource(); }} 
            title="Add storage source"
            style={{ width: '28px', height: '22px', fontSize: '11px' }}
          >
            <FontAwesomeIcon icon={faPlus} />
          </button>
          <FontAwesomeIcon icon={faChevronDown} class="chevron" />
        </div>
      </div>

      <div class="group-content" style={{ display: isListExpanded ? 'flex' : 'none' }}>
        {sources.length === 0 ? (
          <div class="sources-empty">
            <p>No storage sources connected</p>
            <button class="add-source-link" onClick={onAddSource}>
              <FontAwesomeIcon icon={faPlus} /> Connect storage
            </button>
          </div>
        ) : (
          <div class="sources-list">
            {sources.map((source) => (
              <SourceItem
                key={source.id}
                source={source}
                isActive={source.id === activeSourceId}
                expanded={expandedId === source.id}
                onToggleExpand={() => handleToggleExpand(source.id)}
                onSelect={onSelectSource}
                onEditSource={handleEditSource}
                onRemove={handleRemove}
                onOpenCloudGpu={onOpenCloudGpu}
              />
            ))}
          </div>
        )}
      </div>

      {editSource && (
        <ConnectStorageDialog
          isOpen={!!editSource}
          onClose={handleCloseEdit}
          onConnect={handleCloseEdit}
          editSource={editSource}
        />
      )}
    </div>
  );
}

export default StorageSourceList;
