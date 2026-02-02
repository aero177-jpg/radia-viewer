/**
 * Export Choice Modal
 * Lets the user pick between exporting current asset or the current collection.
 */

import { useEffect, useMemo, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faDownload, faTimes } from '@fortawesome/free-solid-svg-icons';
import { CollectionIcon, ImageIcon } from '../icons/customIcons';
import usePortalTarget from '../utils/usePortalTarget';

function ExportOptionItem({ title, subtitle, icon: Icon, selected, onSelect, onConfirm, disabled }) {
  const selectedStyle = selected ? {
    borderColor: 'rgba(110, 231, 255, 0.4)',
    background: 'rgba(110, 231, 255, 0.1)',
    boxShadow: '0 0 0 1px rgba(110, 231, 255, 0.2), 0 0 15px rgba(110, 231, 255, 0.15)',
  } : {};
  const disabledStyle = disabled ? {
    opacity: 0.55,
    cursor: 'not-allowed',
    borderColor: 'rgba(255, 255, 255, 0.08)',
    boxShadow: 'none',
  } : {};
  const combinedStyle = { ...selectedStyle, ...disabledStyle };

  const handleClick = () => {
    if (disabled) return;
    if (selected) {
      onConfirm?.();
      return;
    }
    onSelect?.();
  };

  return (
    <button
      class={`existing-collection-item ${selected ? 'selected' : ''}`}
      onClick={handleClick}
      type="button"
      style={combinedStyle}
      disabled={disabled}
    >
      <div class="collection-info">
        <div class="collection-icon" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={20} />
        </div>
        <div class="collection-details">
          <span class="collection-name" style={{ marginBottom: '4px' }}>{title}</span>
          <span class="collection-meta">{subtitle}</span>
        </div>
      </div>
      {selected && <FontAwesomeIcon icon={faCheck} className="collection-arrow" />}
    </button>
  );
}

function ExportChoiceModal({
  isOpen,
  onClose,
  onExportAsset,
  onExportCollection,
  title = 'Export files',
  subtitle = 'Choose what you want to export.',
  assetTitle = 'Current image',
  assetSubtitle,
  collectionTitle = 'Current collection',
  collectionSubtitle,
  note = '',
  assetDisabled = false,
  collectionDisabled = false,
}) {
  const portalTarget = usePortalTarget();
  const defaultMode = useMemo(() => {
    if (!assetDisabled) return 'asset';
    if (!collectionDisabled) return 'collection';
    return 'asset';
  }, [assetDisabled, collectionDisabled]);
  const [mode, setMode] = useState(defaultMode);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState('');

  useEffect(() => {
    setMode(defaultMode);
  }, [defaultMode, isOpen]);

  if (!isOpen || !portalTarget) return null;

  const handleExport = async () => {
    if (exportBusy) return;
    setExportError('');
    setExportBusy(true);
    try {
      if (mode === 'asset') {
        await onExportAsset?.();
      } else {
        await onExportCollection?.();
      }
      onClose?.();
    } catch (err) {
      setExportError(err?.message || 'Export failed');
    } finally {
      setExportBusy(false);
    }
  };

  return createPortal(
    <div class="modal-overlay storage-dialog-overlay">
      <div
        class="modal-content storage-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '420px' }}
      >
        <button class="modal-close" onClick={onClose}>
          <FontAwesomeIcon icon={faTimes} />
        </button>

        <h2>{title}</h2>
        <p class="dialog-subtitle">{subtitle}</p>

        <div class="upload-options-list" style={{ marginTop: '20px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <ExportOptionItem
            title={assetTitle}
            subtitle={assetSubtitle}
            icon={ImageIcon}
            selected={mode === 'asset'}
            onSelect={() => setMode('asset')}
            onConfirm={handleExport}
            disabled={assetDisabled}
          />
          <ExportOptionItem
            title={collectionTitle}
            subtitle={collectionSubtitle}
            icon={CollectionIcon}
            selected={mode === 'collection'}
            onSelect={() => setMode('collection')}
            onConfirm={handleExport}
            disabled={collectionDisabled}
          />
        </div>

        {note && (
          <p class="dialog-subtitle" style={{ marginTop: '12px', color: 'var(--text-muted, #888)' }}>
            {note}
          </p>
        )}

        {exportError && (
          <div class="form-error" style={{ marginTop: '16px' }}>
            {exportError}
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '24px' }}>
          <button
            class="secondary-button"
            onClick={onClose}
            style={{ height: '36px', padding: '0 16px', minWidth: '80px', marginTop: '0' }}
          >
            Cancel
          </button>
          <button
            class="primary-button"
            onClick={handleExport}
            disabled={exportBusy || (mode === 'asset' ? assetDisabled : collectionDisabled)}
            style={{ height: '36px', padding: '0 16px' }}
          >
            <FontAwesomeIcon icon={faDownload} />
            {' '}{exportBusy ? 'Exporting...' : 'Export'}
          </button>
        </div>
      </div>
    </div>,
    portalTarget
  );
}

export default ExportChoiceModal;
