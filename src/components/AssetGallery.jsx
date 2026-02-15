/**
 * Asset gallery component.
 * Displays a scrollable list of loaded assets with thumbnails.
 * Allows switching between multiple loaded files.
 */

import { useCallback } from 'preact/hooks';
import { useStore } from '../store';
import { loadAssetByIndex } from '../fileLoader';

/** Default max length for truncated file names */
const MAX_FILENAME_LENGTH = 18;

/**
 * Truncates a filename while preserving the extension.
 * @param {string} name - Original filename
 * @param {number} maxLength - Maximum total length
 * @returns {string} Truncated filename with ellipsis if needed
 */
const truncateFileName = (name, maxLength = MAX_FILENAME_LENGTH) => {
  if (name.length <= maxLength) return name;
  const ext = name.includes('.') ? name.split('.').pop() : '';
  const base = name.slice(0, name.length - ext.length - 1);
  const truncatedBase = base.slice(0, maxLength - ext.length - 4) + '...';
  return ext ? `${truncatedBase}.${ext}` : truncatedBase;
};

function AssetGallery() {
  // Store state
  const assets = useStore((state) => state.assets);
  const currentAssetIndex = useStore((state) => state.currentAssetIndex);
  const galleryExpanded = useStore((state) => state.galleryExpanded);
  const toggleGalleryExpanded = useStore((state) => state.toggleGalleryExpanded);

  // Only show gallery with multiple assets
  const showGallery = assets.length > 1;

  /**
   * Handles clicking on an asset thumbnail.
   * Loads the selected asset if different from current.
   * @param {number} index - Index of clicked asset
   */
  const handleAssetClick = useCallback((index) => {
    loadAssetByIndex(index);
  }, []);

  if (!showGallery) {
    return null;
  }

  return (
    <div class="settings-group">
      {/* Collapsible header */}
      <button
        class="group-toggle"
        aria-expanded={galleryExpanded}
        onClick={toggleGalleryExpanded}
      >
        <span class="settings-eyebrow">Assets</span>
        <span class="asset-count">
          {currentAssetIndex + 1} / {assets.length}
        </span>
        <span class="chevron" />
      </button>
      
      {/* Gallery content */}
      <div 
        class="group-content asset-list-container" 
        style={{ display: galleryExpanded ? 'flex' : 'none' }}
      >
        {/* Scrollable asset list */}
        <div class="asset-list">
          {assets.map((asset, index) => (
            <button
              key={asset.id || index}
              class={`asset-item ${index === currentAssetIndex ? 'active' : ''}`}
              title={asset.displayName || asset.name}
              onClick={() => handleAssetClick(index)}
            >
              <div class={`asset-preview ${asset.preview ? '' : 'loading'}`}>
                {asset.preview ? (
                  <img src={asset.preview} alt={asset.displayName || asset.name} loading="lazy" />
                ) : (
                  <div class="preview-spinner" />
                )}
              </div>
              <span class="asset-name">{truncateFileName(asset.displayName || asset.name)}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export default AssetGallery;
