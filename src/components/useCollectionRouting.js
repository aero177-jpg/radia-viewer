import { useCallback, useEffect, useRef } from 'preact/hooks';
import { useStore } from '../store';
import { loadFromStorageSource } from '../fileLoader';
import { setCurrentMesh, requestRender } from '../viewer';
import { getSource, getSourcesArray } from '../storage/index.js';
import { resetSplatManager } from '../splatManager';
import { clearBackground } from '../backgroundManager';

const normalizeRouteSegment = (value) => {
  const text = String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-');
  return text.replace(/^-+|-+$/g, '');
};

const getCollectionPathFromSource = (source) => {
  const slug = normalizeRouteSegment(source?.name || source?.id || '');
  if (!slug) return '/';
  return `/${encodeURIComponent(slug)}`;
};

const getSinglePathSegment = (pathname) => {
  const trimmed = String(pathname || '/').replace(/^\/+|\/+$/g, '');
  if (!trimmed) return null;
  if (trimmed.includes('/')) return '__invalid__';
  try {
    return decodeURIComponent(trimmed);
  } catch {
    return '__invalid__';
  }
};

const findSourceByRouteSegment = (segment, sources) => {
  const normalizedSegment = normalizeRouteSegment(segment);
  if (!normalizedSegment) return null;

  return sources.find((source) => {
    const byName = normalizeRouteSegment(source?.name || '');
    const byId = normalizeRouteSegment(source?.id || '');
    return normalizedSegment === byName || normalizedSegment === byId;
  }) || null;
};

export const useCollectionRouting = ({
  viewerReady,
  activeSourceId,
  setHasDefaultSource,
  setLandingVisible,
  addLog,
}) => {
  const routeReadyRef = useRef(false);
  const routeSyncInFlightRef = useRef(false);

  const navigateHome = useCallback((replace = false) => {
    if (window.location.pathname !== '/') {
      // Hard redirect so the viewer/canvas is fully reinitialized.
      if (replace) {
        window.location.replace('/');
      } else {
        window.location.assign('/');
      }
      return;
    }

    resetSplatManager();
    setCurrentMesh(null);
    clearBackground();
    const pageEl = document.querySelector('.page');
    if (pageEl) {
      pageEl.classList.remove('has-glow');
    }

    useStore.getState().setAssets([]);
    useStore.getState().setCurrentAssetIndex(-1);
    useStore.getState().clearActiveSource();
    setHasDefaultSource(false);
    setLandingVisible(true);
    requestRender();
  }, [setHasDefaultSource, setLandingVisible]);

  const syncPathToActiveSource = useCallback((source, replace = false) => {
    const targetPath = source ? getCollectionPathFromSource(source) : '/';
    if (window.location.pathname === targetPath) return;

    const state = { ...window.history.state };
    if (replace) {
      window.history.replaceState(state, '', targetPath);
    } else {
      window.history.pushState(state, '', targetPath);
    }
  }, []);

  const applyPathRoute = useCallback(async (replaceInvalid = true) => {
    const segment = getSinglePathSegment(window.location.pathname);
    if (segment === '__invalid__') {
      navigateHome(replaceInvalid);
      return;
    }

    if (!segment) {
      navigateHome(replaceInvalid);
      return;
    }

    const sources = getSourcesArray();
    const matchedSource = findSourceByRouteSegment(segment, sources);
    if (!matchedSource) {
      navigateHome(replaceInvalid);
      return;
    }

    try {
      routeSyncInFlightRef.current = true;
      setLandingVisible(false);
      if (!matchedSource.isConnected()) {
        const result = await matchedSource.connect(false);
        if (!result?.success) {
          navigateHome(true);
          return;
        }
      }

      await loadFromStorageSource(matchedSource);
      syncPathToActiveSource(matchedSource, true);
    } catch (err) {
      addLog('Failed to load route collection: ' + (err?.message || err));
      navigateHome(true);
    } finally {
      routeSyncInFlightRef.current = false;
    }
  }, [addLog, navigateHome, setLandingVisible, syncPathToActiveSource]);

  useEffect(() => {
    if (!viewerReady || routeReadyRef.current) return;

    routeReadyRef.current = true;
    void applyPathRoute(true);

    const handlePopState = () => {
      void applyPathRoute(true);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [viewerReady, applyPathRoute]);

  useEffect(() => {
    if (!routeReadyRef.current || routeSyncInFlightRef.current) return;

    if (!activeSourceId) {
      syncPathToActiveSource(null, false);
      return;
    }

    const source = getSource(activeSourceId);
    if (!source) return;
    syncPathToActiveSource(source, false);
  }, [activeSourceId, syncPathToActiveSource]);
};

export default useCollectionRouting;
