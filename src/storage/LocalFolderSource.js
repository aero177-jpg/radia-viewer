/**
 * Local Folder Source Adapter
 * 
 * Uses the File System Access API to read assets from a user-selected folder.
 * Directory handle is persisted in IndexedDB for reconnection across sessions.
 */

import { AssetSource } from './AssetSource.js';
import { createSourceId, isFileSystemAccessSupported } from './types.js';
import { saveSource, saveDirectoryHandle, loadDirectoryHandle } from './sourceManager.js';
import { getSupportedExtensions } from '../formats/index.js';

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];

/**
 * Get file extension in lowercase with dot
 * @param {string} filename
 * @returns {string}
 */
const getExtension = (filename) => {
  const parts = filename.split('.');
  return parts.length > 1 ? `.${parts.pop().toLowerCase()}` : '';
};

/**
 * Get base filename without extension
 * @param {string} filename
 * @returns {string}
 */
const getBaseName = (filename) => {
  const lastDot = filename.lastIndexOf('.');
  return lastDot > 0 ? filename.slice(0, lastDot) : filename;
};

/**
 * Local folder asset source using File System Access API.
 */
export class LocalFolderSource extends AssetSource {
  /**
   * @param {Object} config - Source configuration
   * @param {FileSystemDirectoryHandle} [handle] - Directory handle (if already obtained)
   */
  constructor(config, handle = null) {
    super(config);
    this._handle = handle;
    this._fileHandles = new Map(); // Map of asset path to FileSystemFileHandle
    this._previewHandles = new Map(); // Map of asset base name to preview file handle
  }

  getCapabilities() {
    return {
      canList: true,
      canStream: false, // File API doesn't support streaming
      canReadMetadata: false, // Could be extended to read .meta.json files
      canReadPreviews: true, // Can read matching image files
      persistent: true,
      writable: false,
    };
  }

  /**
   * Connect to the folder by validating the stored handle or prompting for selection.
   * @param {boolean} [promptIfNeeded=true] - Whether to show picker if handle is invalid
   * @returns {Promise<{success: boolean, error?: string, needsPermission?: boolean}>}
   */
  async connect(promptIfNeeded = true) {
    if (!isFileSystemAccessSupported()) {
      return { 
        success: false, 
        error: 'File System Access API is not supported in this browser' 
      };
    }

    try {
      // Try to load persisted handle if we don't have one
      if (!this._handle) {
        try {
          this._handle = await loadDirectoryHandle(this.id);
        } catch (error) {
          console.warn('Failed to load persisted directory handle:', error);
          this._handle = null;
        }
      }

      if (this._handle) {
        // Verify permission on existing handle
        try {
          const permission = await this._handle.queryPermission({ mode: 'read' });
          if (permission === 'granted') {
            this._connected = true;
            return { success: true };
          }

          // Only request permission if we're allowed to prompt (requires user gesture)
          if (promptIfNeeded) {
            const requested = await this._handle.requestPermission({ mode: 'read' });
            if (requested === 'granted') {
              this._connected = true;
              return { success: true };
            }
          }

          // Permission not granted - need user interaction
          return { 
            success: false, 
            needsPermission: true,
            error: 'Click "Grant Access" to reconnect to this folder.' 
          };
        } catch (error) {
          // Handle might be stale or rejected
          console.warn('Directory handle validation failed:', error);
          this._handle = null;
        }
      }

      // No valid handle - prompt for folder selection
      if (promptIfNeeded) {
        return this.selectFolder();
      }

      return { 
        success: false, 
        needsPermission: true,
        error: 'No folder selected' 
      };
    } catch (error) {
      console.warn('LocalFolderSource.connect failed:', error);
      this._handle = null;
      return {
        success: false,
        needsPermission: true,
        error: error?.message || 'Failed to connect to local folder',
      };
    }
  }

  /**
   * Show folder picker dialog and connect.
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async selectFolder() {
    if (!isFileSystemAccessSupported()) {
      return { 
        success: false, 
        error: 'File System Access API is not supported' 
      };
    }

    try {
      // @ts-ignore - showDirectoryPicker is not in TS types yet
      this._handle = await window.showDirectoryPicker({
        mode: 'read',
      });

      // Update config with folder name
      this.config.config.path = this._handle.name;
      this.name = this._handle.name;
      this.config.name = this._handle.name;

      // Persist handle and config
      await saveDirectoryHandle(this.id, this._handle);
      await saveSource(this.toJSON());

      this._connected = true;
      return { success: true };
    } catch (error) {
      if (error.name === 'AbortError') {
        return { success: false, error: 'Folder selection cancelled' };
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * Request permission on the stored handle (after user gesture).
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async requestPermission() {
    if (!this._handle) {
      return this.selectFolder();
    }

    try {
      const permission = await this._handle.requestPermission({ mode: 'read' });
      if (permission === 'granted') {
        this._connected = true;
        return { success: true };
      }
      return { success: false, error: 'Permission denied' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * List all supported assets in the folder.
   * @returns {Promise<import('./types.js').RemoteAssetDescriptor[]>}
   */
  async listAssets() {
    if (!this._connected || !this._handle) {
      throw new Error('Not connected to folder');
    }

    const supportedExtensions = getSupportedExtensions();
    const assets = [];
    const imageFiles = new Map(); // baseName -> file handle

    this._fileHandles.clear();
    this._previewHandles.clear();

    // First pass: collect all files
    for await (const entry of this._handle.values()) {
      if (entry.kind !== 'file') continue;

      const ext = getExtension(entry.name);
      const baseName = getBaseName(entry.name).toLowerCase();

      if (supportedExtensions.includes(ext)) {
        this._fileHandles.set(entry.name, entry);
      } else if (IMAGE_EXTENSIONS.includes(ext)) {
        imageFiles.set(baseName, entry);
      }
    }

    // Second pass: create asset descriptors with preview matching
    for (const [filename, fileHandle] of this._fileHandles) {
      const baseName = getBaseName(filename).toLowerCase();
      const previewHandle = imageFiles.get(baseName);

      if (previewHandle) {
        this._previewHandles.set(baseName, previewHandle);
      }

      const asset = {
        id: `${this.id}/${filename}`,
        name: filename,
        path: filename,
        sourceId: this.id,
        sourceType: this.type,
        preview: null,
        previewSource: previewHandle ? 'pending' : null,
        loaded: false,
      };

      assets.push(asset);
    }

    // Sort by name
    assets.sort((a, b) => a.name.localeCompare(b.name));
    this._assets = assets;

    return assets;
  }

  /**
   * Fetch asset data as ArrayBuffer.
   * @param {import('./types.js').RemoteAssetDescriptor} asset
   * @returns {Promise<ArrayBuffer>}
   */
  async fetchAssetData(asset) {
    const fileHandle = this._fileHandles.get(asset.path);
    if (!fileHandle) {
      throw new Error(`File not found: ${asset.path}`);
    }

    const file = await fileHandle.getFile();
    return file.arrayBuffer();
  }

  /**
   * Fetch asset as File object.
   * @param {import('./types.js').RemoteAssetDescriptor} asset
   * @returns {Promise<File>}
   */
  async fetchAssetFile(asset) {
    const fileHandle = this._fileHandles.get(asset.path);
    if (!fileHandle) {
      throw new Error(`File not found: ${asset.path}`);
    }

    return fileHandle.getFile();
  }

  /**
   * Fetch preview image for an asset.
   * @param {import('./types.js').RemoteAssetDescriptor} asset
   * @returns {Promise<string | null>} Data URL
   */
  async fetchPreview(asset) {
    const baseName = getBaseName(asset.path).toLowerCase();
    const previewHandle = this._previewHandles.get(baseName);

    if (!previewHandle) {
      return null;
    }

    try {
      const file = await previewHandle.getFile();
      return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => resolve(null);
        reader.readAsDataURL(file);
      });
    } catch (error) {
      console.warn(`Failed to load preview for ${asset.name}:`, error);
      return null;
    }
  }

  /**
   * Get directory handle (for debugging/testing).
   * @returns {FileSystemDirectoryHandle | null}
   */
  getHandle() {
    return this._handle;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      config: {
        ...this.config.config,
        // Don't serialize the handle - it's stored separately
        handle: undefined,
      },
    };
  }

  disconnect() {
    super.disconnect();
    this._fileHandles.clear();
    this._previewHandles.clear();
    // Keep handle for potential reconnection
  }
}

/**
 * Create a new LocalFolderSource with a fresh ID.
 * @returns {LocalFolderSource}
 */
export const createLocalFolderSource = () => {
  const id = createSourceId('local-folder');
  const config = {
    id,
    type: 'local-folder',
    name: 'Local Folder',
    createdAt: Date.now(),
    lastAccessed: Date.now(),
    config: {
      path: '',
    },
  };
  return new LocalFolderSource(config);
};

/**
 * Restore a LocalFolderSource from persisted config.
 * @param {Object} config - Persisted source config
 * @returns {LocalFolderSource}
 */
export const restoreLocalFolderSource = (config) => {
  return new LocalFolderSource(config);
};

export default LocalFolderSource;
