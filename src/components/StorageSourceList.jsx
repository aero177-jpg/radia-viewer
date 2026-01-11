/**
 * Storage Sources List Component
 * 
 * Displays connected storage sources with status indicators.
 * Allows reconnecting, refreshing, and removing sources.
 */

import { useState, useEffect, useCallback, useRef, useMemo } from 'preact/hooks';
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
  faChevronRight,
  faUnlock,
  faUpload,
  faSearch,
  faLink,
} from '@fortawesome/free-solid-svg-icons';
import {
  getSourcesArray,
  onSourceChange,
  deleteSource,
  touchSource,
  setDefaultSource,
} from '../storage/index.js';
import { useStore } from '../store';
import { getSupportedExtensions, getFormatAccept } from '../formats/index.js';

const TYPE_ICONS = {
  'local-folder': faFolder,
  'supabase-storage': faCloud,
  'public-url': faLink,
};

const TYPE_LABELS = {
  'local-folder': 'Local',
  'supabase-storage': 'Supabase',
  'public-url': 'URL',
};

/**
 * Individual source item with controls
 */
function SourceItem({ source, onSelect, onRemove, expanded, onToggleExpand, isActive }) {
  const [status, setStatus] = useState('checking');
  const [assetCount, setAssetCount] = useState(source.getAssets().length);
  const [isLoading, setIsLoading] = useState(false);
  const uploadInputRef = useRef(null);
  const supportedExtensions = useMemo(() => getSupportedExtensions(), []);
  const acceptString = useMemo(() => getFormatAccept(), []);

  const isSupportedFile = useCallback((file) => {
    if (!file?.name) return false;
    const ext = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] || '';
    return supportedExtensions.includes(ext);
  }, [supportedExtensions]);

  const processUploads = useCallback(async (files) => {
    if (!files?.length || source.type !== 'supabase-storage' || typeof source.uploadAssets !== 'function') return;

    const valid = files.filter(isSupportedFile);
    const skipped = files.length - valid.length;

    if (valid.length === 0) {
      alert(`No supported files. Supported: ${supportedExtensions.join(', ')}`);
      return;
    }

    setIsLoading(true);
    try {
      const result = await source.uploadAssets(valid);
      if (result?.success) {
        const assets = await source.listAssets();
        setAssetCount(assets.length);
        setStatus('connected');
      } else {
        setStatus('error');
      }

      if (skipped > 0) {
        console.warn(`Skipped ${skipped} unsupported files during upload.`);
      }
    } catch (err) {
      console.error('Upload failed:', err);
      setStatus('error');
    } finally {
      setIsLoading(false);
    }
  }, [isSupportedFile, source, supportedExtensions]);

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

    setIsLoading(true);
    try {
      const assets = await source.listAssets();
      setAssetCount(assets.length);
    } catch (err) {
      console.error('Refresh failed:', err);
    } finally {
      setIsLoading(false);
    }
  }, [source]);

  const handleRescan = useCallback(async (e) => {
    e.stopPropagation();
    if (source.type !== 'supabase-storage' || typeof source.rescan !== 'function') return;

    setIsLoading(true);
    try {
      const preview = await source.rescan({ applyChanges: false });
      if (!preview?.success) {
        setStatus('error');
        return;
      }

      const summary = `Found ${preview.added.length} new, ${preview.missing.length} missing. Apply updates to manifest?`;
      const apply = confirm(summary);

      if (apply) {
        const applied = await source.rescan({ applyChanges: true });
        if (applied?.success) {
          const assets = await source.listAssets();
          setAssetCount(assets.length);
          setStatus('connected');
        }
      }
    } catch (err) {
      console.error('Rescan failed:', err);
      setStatus('error');
    } finally {
      setIsLoading(false);
    }
  }, [source]);

  const handleUploadClick = useCallback(async (e) => {
    e.stopPropagation();
    if (source.type !== 'supabase-storage') return;

    // Prefer the native file picker API to avoid "recent files" shortcuts in some browsers
    if (typeof window.showOpenFilePicker === 'function') {
      try {
        const handles = await window.showOpenFilePicker({
          multiple: true,
          types: [
            {
              description: 'Supported splat assets',
              accept: { 'application/octet-stream': supportedExtensions },
            },
          ],
          excludeAcceptAllOption: false,
        });

        const files = await Promise.all(handles.map((handle) => handle.getFile()));
        await processUploads(files);
        return;
      } catch (err) {
        if (err?.name === 'AbortError') return; // user cancelled
        console.warn('showOpenFilePicker failed, falling back to input:', err);
      }
    }

    uploadInputRef.current?.click();
  }, [source.type, supportedExtensions, processUploads]);

  const handleUploadChange = useCallback(async (e) => {
    e.stopPropagation();
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    await processUploads(files);
  }, [processUploads]);

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

  return (
    <>
      <input
        ref={uploadInputRef}
        type="file"
        multiple
        accept={acceptString}
        style={{ display: 'none' }}
        onChange={handleUploadChange}
      />
      <div 
        class={`source-item ${isConnected ? 'connected' : ''} ${status} ${isActive ? 'active' : ''}`}
        onClick={handleClick}
      >
      <button 
        class="source-expand"
        onClick={(e) => { e.stopPropagation(); onToggleExpand?.(); }}
      >
        <FontAwesomeIcon icon={expanded ? faChevronDown : faChevronRight} />
      </button>

      <div class="source-info">
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
          <FontAwesomeIcon icon={faSpinner} spin />
        ) : isConnected ? (
          <></>
        ) : needsPermission ? (
          <FontAwesomeIcon icon={faUnlock} className="status-warning" />
        ) : (
          <FontAwesomeIcon icon={faExclamationTriangle} className="status-error" />
        )}
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
          {source.type === 'supabase-storage' && (
            <>
              <button
                class="source-action-btn"
                onClick={handleUploadClick}
                title="Upload files to Supabase"
              >
                <FontAwesomeIcon icon={faUpload} />
                <span>Upload</span>
              </button>
              <button
                class="source-action-btn"
                onClick={handleRescan}
                title="Rescan storage and update manifest"
              >
                <FontAwesomeIcon icon={faSearch} />
                <span>Rescan</span>
              </button>
            </>
          )}
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
    </>
  );
}

/**
 * Storage sources list with collapsible toggle and add button
 */
function StorageSourceList({ onAddSource, onSelectSource }) {
  const [sources, setSources] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [isListExpanded, setIsListExpanded] = useState(true);
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
                onRemove={handleRemove}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default StorageSourceList;
