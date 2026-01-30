/**
 * App Storage Source Adapter
 *
 * Stores collections inside the app's private filesystem in native builds.
 * Not available in the web-only build.
 */

import { AssetSource } from './AssetSource.js';
import { createSourceId, MANIFEST_VERSION } from './types.js';
import { saveSource } from './sourceManager.js';

const BASE_DIR = 'radia';
const COLLECTIONS_DIR = `${BASE_DIR}/collections`;

const stripLeadingSlash = (value) => (value || '').replace(/^\/+/, '');

const getFilename = (path) => {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
};

const base64ToArrayBuffer = () => {
  throw new Error('App storage is not available in the web build');
};

export class AppStorageSource extends AssetSource {
  constructor(config) {
    super(config);
    this._manifest = null;
  }

  getCapabilities() {
    return {
      canList: true,
      canStream: false,
      canReadMetadata: false,
      canReadPreviews: false,
      persistent: true,
      writable: true,
    };
  }

  _collectionRoot() {
    return `${COLLECTIONS_DIR}/${this.config.config.collectionId}`;
  }

  _assetsRoot() {
    return `${this._collectionRoot()}/assets`;
  }

  _manifestPath() {
    return `${this._collectionRoot()}/manifest.json`;
  }

  _assetFsPath(relativePath) {
    const safePath = stripLeadingSlash(relativePath);
    return `${this._collectionRoot()}/${safePath}`;
  }

  _remotePathForFileName(name) {
    return `assets/${name}`;
  }

  async connect() {
    this._connected = false;
    return { success: false, error: 'App storage is not available in the web build' };
  }

  async _loadManifest() {
    this._manifest = null;
    return null;
  }

  async _saveManifest(manifest) {
    this._manifest = manifest;
    await saveSource(this.toJSON());
  }

  async _ensureManifestLoaded() {
    if (!this._manifest) {
      const manifest = {
        version: MANIFEST_VERSION,
        name: this.config.config.collectionName || this.config.name,
        assets: [],
      };
      await this._saveManifest(manifest);
    }
    return this._manifest;
  }

  async listAssets() {
    this._assets = [];
    return this._assets;
  }

  async fetchAssetData(asset) {
    void asset;
    return base64ToArrayBuffer();
  }

  async fetchAssetFile(asset) {
    const data = await this.fetchAssetData(asset);
    const name = asset.name || getFilename(asset.path);
    return new File([data], name, { type: 'application/octet-stream' });
  }

  /**
   * Delete assets from app storage and update manifest.
   * Previews and metadata are stored separately and preserved.
   * @param {Array|string} items
   * @returns {Promise<{success: boolean, removed?: string[], failed?: Array}>}
   */
  async deleteAssets(items) {
    const toDelete = (Array.isArray(items) ? items : [items])
      .map(item => typeof item === 'string' ? item : item?.path)
      .filter(Boolean)
      .map(p => stripLeadingSlash(p));

    return { success: false, removed: [], failed: toDelete.map(path => ({ path, error: 'App storage is not available in the web build' })) };
  }

  /**
   * Import files into app storage and update manifest.
   * @param {File[]} files
   * @returns {Promise<{success: boolean, error?: string, imported?: number}>}
   */
  async importFiles(files) {
    void files;
    return { success: false, error: 'App storage is not available in the web build' };
  }
}

/**
 * Create a new AppStorageSource with a fresh ID.
 * @param {{ id?: string, name?: string, collectionId?: string, collectionName?: string }} options
 * @returns {AppStorageSource}
 */
export const createAppStorageSource = (options = {}) => {
  const sourceId = options.id || createSourceId('app-storage');
  const collectionId = options.collectionId || sourceId;
  const name = options.name || options.collectionName || 'App Storage';

  const config = {
    id: sourceId,
    type: 'app-storage',
    name,
    createdAt: Date.now(),
    lastAccessed: Date.now(),
    isDefault: false,
    config: {
      collectionId,
      collectionName: options.collectionName || name,
    },
  };

  return new AppStorageSource(config);
};

/**
 * Restore an AppStorageSource from persisted config.
 * @param {Object} config
 * @returns {AppStorageSource}
 */
export const restoreAppStorageSource = (config) => {
  return new AppStorageSource(config);
};

export default AppStorageSource;