import { useCallback, useMemo, useState } from 'preact/hooks';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCloud,
  faCog,
  faExclamationTriangle,
  faFolder,
  faHardDrive,
  faImage,
  faLink,
  faServer,
  faSpinner,
  faTrash,
  faCheck,
  faXmark,
} from '@fortawesome/free-solid-svg-icons';
import {
  CLEAR_DATA_OPTIONS,
  clearSelectedLocalData,
  createInitialClearDataOptions,
} from '../utils/debugTransfer.js';
import Modal from './Modal';
import SelectableOptionItem from './SelectableOptionItem';

const iconByKey = {
  clearUrlCollections: faLink,
  clearSupabaseCollections: faServer,
  clearR2Collections: faServer,
  clearLocalFolderCollections: faFolder,
  clearAppStorageCollections: faHardDrive,
  clearCloudGpuSettings: faCloud,
  clearSupabaseSettings: faCog,
  clearR2Settings: faCog,
  clearViewerPrefs: faCog,
  clearFileSettings: faFolder,
  clearFilePreviews: faImage,
  clearAssetCache: faHardDrive,
};

const formatSummary = (summary) => {
  const parts = [];
  if (summary.sourcesCleared) parts.push(`${summary.sourcesCleared} sources`);
  if (summary.localStorageEntriesCleared) parts.push(`${summary.localStorageEntriesCleared} localStorage entries`);
  if (summary.fileSettingsCleared) parts.push(`${summary.fileSettingsCleared} file settings`);
  if (summary.previewsCleared) parts.push(`${summary.previewsCleared} previews`);
  if (summary.assetCacheBlobsCleared) parts.push(`${summary.assetCacheBlobsCleared} cached assets`);
  if (summary.assetCacheManifestsCleared) parts.push(`${summary.assetCacheManifestsCleared} cache manifests`);
  return parts.length ? parts.join(', ') : 'No matching records found';
};

function ClearDataModal({ isOpen, onClose, addLog }) {
  const [clearOptions, setClearOptions] = useState(() => createInitialClearDataOptions());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const hasSelection = useMemo(() => Object.values(clearOptions).some(Boolean), [clearOptions]);

  const resetState = useCallback(() => {
    setClearOptions(createInitialClearDataOptions());
    setBusy(false);
    setError(null);
    setSuccess(null);
  }, []);

  const handleClose = useCallback(() => {
    resetState();
    onClose();
  }, [onClose, resetState]);

  const toggleOption = useCallback((key) => () => {
    setClearOptions((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }, []);

  const handleClearSelected = useCallback(async () => {
    if (!hasSelection || busy) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const summary = await clearSelectedLocalData(clearOptions);
      const summaryText = formatSummary(summary);
      setSuccess(`Clear complete: ${summaryText}`);
      addLog?.(`[Debug] Clear data complete: ${summaryText}`);
      if (summary.warnings?.length) {
        addLog?.(`[Debug] Clear data warnings: ${summary.warnings.join(' | ')}`);
      }
    } catch (err) {
      const message = err?.message || 'Failed to clear selected data';
      setError(message);
      addLog?.(`[Debug] Clear data failed: ${message}`);
    } finally {
      setBusy(false);
    }
  }, [addLog, busy, clearOptions, hasSelection]);

  if (!isOpen) return null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      maxWidth={520}
    >
      <h2>Clear local data</h2>
      <p class="dialog-subtitle">
        Select persisted localStorage and IndexedDB data to delete from this browser.
      </p>

      <div class="form-info" style={{ marginTop: '16px' }}>
        <FontAwesomeIcon icon={faExclamationTriangle} style={{ color: '#ff6b6b' }} />
        {' '}This action cannot be undone.
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
          marginTop: '16px',
          maxHeight: '46vh',
          overflowY: 'auto',
          paddingRight: '2px',
        }}
      >
        {CLEAR_DATA_OPTIONS.map((option) => (
          <SelectableOptionItem
            key={option.key}
            title={option.title}
            subtitle={`${option.subtitle}${option.scope === 'indexeddb' ? ' (IndexedDB)' : ' (localStorage)'}`}
            icon={iconByKey[option.key] || faTrash}
            selected={Boolean(clearOptions[option.key])}
            onToggle={toggleOption(option.key)}
            indicatorIcon={faXmark}
            selectedIndicatorBackground="rgba(255, 80, 80, 0.9)"
            selectedIndicatorColor="#fff"
          />
        ))}
      </div>

      {error && (
        <div class="form-error" style={{ marginTop: '16px' }}>
          <FontAwesomeIcon icon={faExclamationTriangle} />
          {' '}{error}
        </div>
      )}

      {success && (
        <div class="form-success" style={{ marginTop: '16px' }}>
          <FontAwesomeIcon icon={faCheck} />
          {' '}{success}
        </div>
      )}

      <div
        style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: '8px',
          marginTop: '24px',
        }}
      >
        <button
          class="secondary-button"
          onClick={handleClose}
          style={{ height: '36px', padding: '0 16px', minWidth: '80px', marginTop: 0 }}
        >
          {success ? 'Done' : 'Cancel'}
        </button>
        <button
          class="primary-button danger"
          onClick={handleClearSelected}
          disabled={!hasSelection || busy}
          style={{ height: '36px', padding: '0 16px', minWidth: '140px', fontSize: '14px' }}
        >
          {busy ? (
            <>
              <FontAwesomeIcon icon={faSpinner} spin />
              {' '}Clearing...
            </>
          ) : (
            <>
              <FontAwesomeIcon icon={faTrash} />
              {' '}Clear selected
            </>
          )}
        </button>
      </div>
    </Modal>
  );
}

export default ClearDataModal;
