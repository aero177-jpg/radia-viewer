/**
 * Connect to Storage Dialog
 *
 * Modal dialog for adding new collections backed by Local Folder or Supabase Storage.
 */

import { useState, useCallback, useEffect, useMemo } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faFolder,
  faCloud,
  faTimes,
  faCheck,
  faSpinner,
  faExclamationTriangle,
  faChevronRight,
  faPlus,
  faLink,
} from '@fortawesome/free-solid-svg-icons';
import {
  SOURCE_TIERS,
  isFileSystemAccessSupported,
  createLocalFolderSource,
  createPublicUrlSource,
  createSupabaseStorageSource,
  registerSource,
  saveSource,
} from '../storage/index.js';
import { loadSupabaseSettings, saveSupabaseSettings } from '../storage/supabaseSettings.js';
import { getAssetList } from '../assetManager.js';
import { getSupportedExtensions } from '../formats/index.js';

const ICONS = {
  folder: faFolder,
  cloud: faCloud,
  link: faLink,
};

function TierCard({ type, selected, onSelect, disabled }) {
  const info = SOURCE_TIERS[type];
  if (!info) return null;

  return (
    <button
      class={`storage-tier-card ${selected ? 'selected' : ''} ${disabled ? 'disabled' : ''}`}
      onClick={() => !disabled && onSelect(type)}
      disabled={disabled}
    >
      <div class="tier-icon">
        <FontAwesomeIcon icon={ICONS[info.icon] || faFolder} />
      </div>
      <div class="tier-content">
        <div class="tier-header">
          <h4>{info.label}</h4>
          {info.tier === 3 && <span class="tier-badge">Recommended</span>}
        </div>
        <p class="tier-description">{info.description}</p>
        {disabled && (
          <p class="tier-disabled-reason">
            <FontAwesomeIcon icon={faExclamationTriangle} />
            {' '}Not supported in this browser
          </p>
        )}
      </div>
      <FontAwesomeIcon icon={faChevronRight} class="tier-arrow" />
    </button>
  );
}

function LocalFolderForm({ onConnect, onBack }) {
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [collectionName, setCollectionName] = useState('');

  const handleSelect = useCallback(async () => {
    setStatus('connecting');
    setError(null);

    try {
      const source = createLocalFolderSource();
      const result = await source.connect(true);

      if (result.success) {
        if (collectionName.trim()) {
          source.name = collectionName.trim();
          source.config.name = collectionName.trim();
        }
        registerSource(source);
        setStatus('success');
        setTimeout(() => onConnect(source), 500);
      } else {
        setError(result.error || 'Failed to connect');
        setStatus('error');
      }
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }, [onConnect, collectionName]);

  return (
    <div class="storage-form">
      <button class="back-button" onClick={onBack}>
        {'<- Back'}
      </button>

      <h3>Create local collection</h3>

      <div class="form-field">
        <label>Collection name</label>
        <input
          type="text"
          placeholder="My local splats"
          value={collectionName}
          onInput={(e) => setCollectionName(e.target.value)}
        />
      </div>

      <div class="form-info">
        <p>Select a folder containing splat files (.ply, .sog).</p>
        <ul class="feature-list">
          <li><FontAwesomeIcon icon={faCheck} /> Works offline after selection</li>
          <li><FontAwesomeIcon icon={faCheck} /> Fast loading from local disk</li>
          <li><FontAwesomeIcon icon={faCheck} /> Folder access persists across sessions</li>
          <li><FontAwesomeIcon icon={faCheck} /> Preview images matched automatically</li>
        </ul>
      </div>

      {error && (
        <div class="form-error">
          <FontAwesomeIcon icon={faExclamationTriangle} />
          {' '}{error}
        </div>
      )}

      <button
        class="primary-button"
        onClick={handleSelect}
        disabled={status === 'connecting'}
      >
        {status === 'connecting' ? (
          <>
            <FontAwesomeIcon icon={faSpinner} spin />
            {' '}Selecting...
          </>
        ) : status === 'success' ? (
          <>
            <FontAwesomeIcon icon={faCheck} />
            {' '}Connected!
          </>
        ) : (
          <>
            <FontAwesomeIcon icon={faFolder} />
            {' '}Select Folder
          </>
        )}
      </button>

      <p class="form-note">
        Your browser will ask for permission to access the folder.
        The app only reads files and never uploads data.
      </p>
    </div>
  );
}

function UrlCollectionForm({ onConnect, onBack }) {
  const [urls, setUrls] = useState(['']);
  const [collectionName, setCollectionName] = useState('');
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);

  const updateUrl = useCallback((index, value) => {
    setUrls((prev) => prev.map((u, i) => (i === index ? value : u)));
  }, []);

  const addRow = useCallback(() => {
    setUrls((prev) => [...prev, '']);
  }, []);

  const removeRow = useCallback((index) => {
    setUrls((prev) => (prev.length === 1 ? [''] : prev.filter((_, i) => i !== index)));
  }, []);

  const handleConnect = useCallback(async () => {
    const cleaned = urls.map((u) => u.trim()).filter(Boolean);
    if (cleaned.length === 0) {
      setError('Add at least one URL');
      return;
    }

    // Basic URL validation
    for (const u of cleaned) {
      try {
        const parsed = new URL(u);
        if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
          throw new Error('URL must be http/https');
        }
      } catch (err) {
        setError(`Invalid URL: ${u}`);
        return;
      }
    }

    setStatus('connecting');
    setError(null);

    try {
      const source = createPublicUrlSource({
        assetPaths: cleaned,
        name: collectionName.trim() || 'URL collection',
      });

      const result = await source.connect();

      if (result.success) {
        registerSource(source);
        await saveSource(source.toJSON());
        setStatus('success');
        setTimeout(() => onConnect(source), 500);
      } else {
        setError(result.error || 'Failed to connect');
        setStatus('error');
      }
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }, [urls, collectionName, onConnect]);

  return (
    <div class="storage-form">
      <button class="back-button" onClick={onBack}>
        {'<- Back'}
      </button>

      <h3>Create URL collection</h3>
      <p class="dialog-subtitle">Fallback: provide direct public URLs to assets (read-only).</p>

      <div class="form-info">
        <ul class="feature-list">
          <li><FontAwesomeIcon icon={faCheck} /> No setup or credentials required</li>
          <li><FontAwesomeIcon icon={faCheck} /> Direct HTTP/HTTPS links only, read-only</li>
          <li><FontAwesomeIcon icon={faCheck} /> Best for quick demos or hosted files</li>
        </ul>
      </div>

      <div class="form-field">
        <label>Collection name</label>
        <input
          type="text"
          placeholder="Public URLs"
          value={collectionName}
          onInput={(e) => setCollectionName(e.target.value)}
        />
      </div>

      <div class="form-field">
        <label>Asset URLs</label>
        <div class="url-list">
          {urls.map((url, index) => (
            <div class="url-row" key={`url-${index}`}>
              <input
                type="url"
                placeholder="https://example.com/scene.sog"
                value={url}
                onInput={(e) => updateUrl(index, e.target.value)}
              />
              <button
                class="icon-button"
                onClick={() => removeRow(index)}
                title="Remove URL"
                type="button"
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
            </div>
          ))}
        </div>
        <button class="secondary-button" onClick={addRow} type="button">
          <FontAwesomeIcon icon={faPlus} /> Add URL
        </button>
        <span class="field-hint">Provide direct links to .sog/.ply files. No uploads or deletes supported.</span>
      </div>

      {error && (
        <div class="form-error">
          <FontAwesomeIcon icon={faExclamationTriangle} />
          {' '}{error}
        </div>
      )}

      <button
        class="primary-button"
        onClick={handleConnect}
        disabled={status === 'connecting'}
      >
        {status === 'connecting' ? (
          <>
            <FontAwesomeIcon icon={faSpinner} spin />
            {' '}Saving...
          </>
        ) : status === 'success' ? (
          <>
            <FontAwesomeIcon icon={faCheck} />
            {' '}Connected!
          </>
        ) : (
          'Save URL collection'
        )}
      </button>
    </div>
  );
}

function SupabaseForm({ onConnect, onBack }) {
  const supportedExtensions = useMemo(() => getSupportedExtensions(), []);
  const queuedAssets = useMemo(() => getAssetList(), []);
  const queueFiles = useMemo(() => {
    return queuedAssets
      .filter((asset) => asset?.file && asset?.file?.name)
      .filter((asset) => {
        const ext = asset.file.name.toLowerCase().match(/\.[^.]+$/)?.[0] || '';
        return supportedExtensions.includes(ext);
      })
      .map((asset) => asset.file);
  }, [queuedAssets, supportedExtensions]);
  const hasQueueFiles = queueFiles.length > 0;

  const initialSettings = loadSupabaseSettings() || { supabaseUrl: '', anonKey: '', bucket: '' };
  const [supabaseUrl, setSupabaseUrl] = useState(initialSettings.supabaseUrl);
  const [anonKey, setAnonKey] = useState(initialSettings.anonKey);
  const [bucket, setBucket] = useState(initialSettings.bucket);
  const [collectionName, setCollectionName] = useState('');
  const [collectionId, setCollectionId] = useState('default');
  const [idTouched, setIdTouched] = useState(false);
  const [showSupabaseConfig, setShowSupabaseConfig] = useState(!initialSettings.supabaseUrl || !initialSettings.anonKey || !initialSettings.bucket);
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [hasManifest, setHasManifest] = useState(null);
  const [uploadExisting, setUploadExisting] = useState(hasQueueFiles);

  const supabaseConfigured = Boolean(supabaseUrl && anonKey && bucket);

  const slugify = useCallback((value) => {
    const slug = value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return slug || 'collection';
  }, []);

  useEffect(() => {
    if (!idTouched && collectionName.trim()) {
      setCollectionId(slugify(collectionName.trim()));
    }
  }, [collectionName, idTouched, slugify]);

  const handleSaveSettings = useCallback(() => {
    if (!supabaseUrl.trim() || !anonKey.trim() || !bucket.trim()) {
      setError('Fill Supabase URL, anon key, and bucket.');
      return;
    }
    saveSupabaseSettings({
      supabaseUrl: supabaseUrl.trim(),
      anonKey: anonKey.trim(),
      bucket: bucket.trim(),
    });
    setShowSupabaseConfig(false);
    setError(null);
  }, [supabaseUrl, anonKey, bucket]);

  const handleConnect = useCallback(async () => {
    if (!supabaseConfigured) {
      setError('Configure Supabase first.');
      setShowSupabaseConfig(true);
      return;
    }
    if (!collectionId.trim()) {
      setError('Collection ID is required');
      return;
    }

    setStatus('connecting');
    setError(null);

    try {
      const source = createSupabaseStorageSource({
        supabaseUrl: supabaseUrl.trim(),
        anonKey: anonKey.trim(),
        bucket: bucket.trim(),
        collectionId: slugify(collectionId.trim()),
        collectionName: collectionName.trim() || undefined,
      });

      const result = await source.connect({ refreshManifest: true, verifyUpload: true });

      if (result.success) {
        setHasManifest(source.config.config.hasManifest);
        registerSource(source);
        await saveSource(source.toJSON());

        if (uploadExisting && queueFiles.length > 0) {
          setStatus('uploading');
          const uploadResult = await source.uploadAssets(queueFiles);
          if (!uploadResult.success) {
            const firstError = uploadResult.failed?.[0]?.error;
            setError(firstError ? `Some uploads failed: ${firstError}` : 'Some uploads failed.');
          }
        }

        setStatus('success');
        setTimeout(() => onConnect(source), 500);
      } else {
        setError(result.error || 'Failed to connect');
        setStatus('error');
      }
    } catch (err) {
      setError(err.message);
      setStatus('error');
    }
  }, [supabaseConfigured, supabaseUrl, anonKey, bucket, collectionId, collectionName, slugify, onConnect, uploadExisting, queueFiles]);

  return (
    <div class="storage-form">
      <button class="back-button" onClick={onBack}>
        {'<- Back'}
      </button>

      <h3>Create Supabase collection</h3>
      <p class="dialog-subtitle">Collections live under collections/{'{'}id{'}'} with manifest-first loading.</p>

      <div class="form-info">
        <ul class="feature-list">
          <li><FontAwesomeIcon icon={faCheck} /> Auto-creates folder and manifest if missing</li>
          <li><FontAwesomeIcon icon={faCheck} /> Uses your bucket directly; no proxy</li>
          <li><FontAwesomeIcon icon={faCheck} /> Rescan anytime to refresh manifest</li>
        </ul>
      </div>

      <div class="form-field">
        <label>Collection name</label>
        <input
          type="text"
          placeholder="My splat gallery"
          value={collectionName}
          onInput={(e) => setCollectionName(e.target.value)}
        />
        <span class="field-hint">Shown in the app; optional.</span>
      </div>

      <div class="form-field">
        <label>Collection ID</label>
        <input
          type="text"
          placeholder="my-room-scan"
          value={collectionId}
          onInput={(e) => { setCollectionId(e.target.value); setIdTouched(true); }}
        />
        <span class="field-hint">Stored under collections/{'{'}collectionId{'}'} in your bucket.</span>
      </div>

      {hasQueueFiles && (
        <div class="form-field">
          <label class="checkbox-inline">
            <input
              type="checkbox"
              checked={uploadExisting}
              onChange={(e) => setUploadExisting(e.target.checked)}
            />
            Upload current images ({queueFiles.length})
          </label>
          <span class="field-hint">Uploads start right after the collection is created; unsupported files are skipped.</span>
        </div>
      )}
      <div class="form-section">
        <div class="form-row">
          <div>
            <strong>Supabase settings</strong>
            <div class="field-hint">
              {supabaseConfigured
                ? <>Using bucket <em>{bucket}</em> at <em>{supabaseUrl}</em></>
                : 'Not configured yet.'}
            </div>
          </div>
          <button class="link-button" onClick={() => setShowSupabaseConfig(!showSupabaseConfig)}>
            {showSupabaseConfig ? 'Hide config' : (supabaseConfigured ? 'Edit config' : 'Configure Supabase')}
          </button>
        </div>

        {showSupabaseConfig && (
          <div class="config-grid">
            <div class="form-field">
              <label>Supabase project URL</label>
              <input
                type="url"
                placeholder="https://abc.supabase.co"
                value={supabaseUrl}
                onInput={(e) => setSupabaseUrl(e.target.value)}
              />
            </div>

            <div class="form-field">
              <label>Anon/public key</label>
              <input
                type="text"
                placeholder="supabase anon key"
                value={anonKey}
                onInput={(e) => setAnonKey(e.target.value)}
              />
              <span class="field-hint">Use the anon/public key; the app is client-only.</span>
            </div>

            <div class="form-field">
              <label>Bucket name</label>
              <input
                type="text"
                placeholder="splat-assets"
                value={bucket}
                onInput={(e) => setBucket(e.target.value)}
              />
            </div>

            <button class="secondary-button" onClick={handleSaveSettings}>
              Save Supabase settings
            </button>
          </div>
        )}
      </div>

      {error && (
        <div class="form-error">
          <FontAwesomeIcon icon={faExclamationTriangle} />
          {' '}{error}
        </div>
      )}

      {status === 'success' && hasManifest !== null && (
        <div class={`form-success ${hasManifest ? '' : 'warning'}`}>
          <FontAwesomeIcon icon={hasManifest ? faCheck : faExclamationTriangle} />
          {' '}
          {hasManifest
            ? 'Found manifest.json - loading is manifest-first'
            : 'Manifest was created for you - you can rescan later'}
        </div>
      )}

      <button
        class="primary-button"
        onClick={handleConnect}
            disabled={status === 'connecting' || status === 'uploading' || !collectionId.trim()}
      >
        {status === 'connecting' ? (
          <>
            <FontAwesomeIcon icon={faSpinner} spin />
            {' '}Creating collection...
          </>
            ) : status === 'uploading' ? (
              <>
                <FontAwesomeIcon icon={faSpinner} spin />
                {' '}Uploading current images...
              </>
        ) : status === 'success' ? (
          <>
            <FontAwesomeIcon icon={faCheck} />
            {' '}Connected!
          </>
        ) : (
          'Create collection'
        )}
      </button>

      <details class="form-details">
        <summary>Bucket layout (auto-created)</summary>
        <pre>{`${bucket || 'your-bucket'}/
└── collections/${slugify(collectionId) || '{collectionId}'}/
    ├── manifest.json
    └── assets/
        ├── scene1.ply
        ├── scene1.preview.jpg
        ├── scene1.meta.json
        └── ...`}</pre>
      </details>

      <p class="form-note">
        Helpful links:{' '}
        <a href="https://supabase.com/dashboard" target="_blank" rel="noreferrer noopener">Supabase dashboard</a>
        {' '}·{' '}
        <a href="https://supabase.com/docs/guides/storage" target="_blank" rel="noreferrer noopener">Storage docs</a>
        {' '}·{' '}
        <a href="https://supabase.com/docs/guides/storage/public-buckets" target="_blank" rel="noreferrer noopener">Public bucket setup</a>
      </p>

      <p class="form-note">
        Make sure your bucket is public or has an anon write policy so manifest.json can be created.
      </p>
    </div>
  );
}

function ConnectStorageDialog({ isOpen, onClose, onConnect }) {
  const [selectedTier, setSelectedTier] = useState(null);
  const localSupported = isFileSystemAccessSupported();

  const handleConnect = useCallback((source) => {
    onConnect?.(source);
    onClose();
    setSelectedTier(null);
  }, [onConnect, onClose]);

  const handleBack = useCallback(() => {
    setSelectedTier(null);
  }, []);

  const handleClose = useCallback(() => {
    onClose();
    setSelectedTier(null);
  }, [onClose]);

  if (!isOpen) return null;

  const content = (
    <div class="modal-overlay storage-dialog-overlay" onClick={handleClose}>
      <div class="modal-content storage-dialog" onClick={(e) => e.stopPropagation()}>
        <button class="modal-close" onClick={handleClose}>
          <FontAwesomeIcon icon={faTimes} />
        </button>

        {selectedTier === null ? (
          <>
            <h2>Create a collection</h2>
            <p class="dialog-subtitle">
              Pick where your collection lives. Files stay in your storage; manifests load fast in the viewer.
            </p>

            <div class="storage-tiers">
              <TierCard
                type="local-folder"
                selected={false}
                onSelect={setSelectedTier}
                disabled={!localSupported}
              />
              <TierCard
                type="supabase-storage"
                selected={false}
                onSelect={setSelectedTier}
              />
              <TierCard
                type="public-url"
                selected={false}
                onSelect={setSelectedTier}
              />
            </div>
          </>
        ) : selectedTier === 'local-folder' ? (
          <LocalFolderForm onConnect={handleConnect} onBack={handleBack} />
        ) : selectedTier === 'supabase-storage' ? (
          <SupabaseForm onConnect={handleConnect} onBack={handleBack} />
        ) : selectedTier === 'public-url' ? (
          <UrlCollectionForm onConnect={handleConnect} onBack={handleBack} />
        ) : null}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

export default ConnectStorageDialog;
