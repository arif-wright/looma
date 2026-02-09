const isBrowser = typeof document !== 'undefined';

const isIOS = () =>
  typeof navigator !== 'undefined' && /iPad|iPhone|iPod/.test(navigator.userAgent);

const isAndroid = () =>
  typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

type InlineSnapshot = Partial<
  Pick<CSSStyleDeclaration, 'position' | 'inset' | 'width' | 'height' | 'touchAction'>
>;

let fallbackActive = false;
let fallbackTarget: HTMLElement | null = null;
let previousBodyOverflow: string | null = null;
let previousStyles: InlineSnapshot = {};

const applyFallbackLayout = () => {
  if (!isBrowser || !fallbackTarget) return;
  const el = fallbackTarget;
  el.style.position = 'fixed';
  el.style.inset = '0';
  el.style.width = '100vw';
  el.style.height = '100vh';
  if (!el.style.touchAction || el.style.touchAction === 'auto') {
    el.style.touchAction = 'none';
  }
  if (document.body) {
    document.body.style.overflow = 'hidden';
  }
};

const activateFallback = (el: HTMLElement) => {
  if (!isBrowser) return;
  fallbackActive = true;
  fallbackTarget = el;
  previousStyles = {
    position: el.style.position,
    inset: el.style.inset,
    width: el.style.width,
    height: el.style.height,
    touchAction: el.style.touchAction
  };
  previousBodyOverflow = document.body?.style?.overflow ?? null;
  applyFallbackLayout();
};

const releaseFallback = () => {
  if (!fallbackTarget) return;
  const el = fallbackTarget;
  el.style.position = previousStyles.position ?? '';
  el.style.inset = previousStyles.inset ?? '';
  el.style.width = previousStyles.width ?? '';
  el.style.height = previousStyles.height ?? '';
  el.style.touchAction = previousStyles.touchAction ?? '';
  if (document.body && previousBodyOverflow !== null) {
    document.body.style.overflow = previousBodyOverflow;
  }
  fallbackActive = false;
  fallbackTarget = null;
  previousStyles = {};
  previousBodyOverflow = null;
};

const getRequestFn = (el: HTMLElement) => {
  const anyEl = el as HTMLElement & {
    webkitRequestFullscreen?: () => Promise<void>;
    mozRequestFullScreen?: () => Promise<void>;
    msRequestFullscreen?: () => Promise<void>;
  };

  return (
    el.requestFullscreen?.bind(el) ??
    anyEl.webkitRequestFullscreen?.bind(el) ??
    anyEl.mozRequestFullScreen?.bind(el) ??
    anyEl.msRequestFullscreen?.bind(el) ??
    null
  );
};

const getExitFn = () => {
  if (!isBrowser) return null;
  const anyDoc = document as Document & {
    webkitExitFullscreen?: () => Promise<void>;
    mozCancelFullScreen?: () => Promise<void>;
    msExitFullscreen?: () => Promise<void>;
  };

  return (
    document.exitFullscreen?.bind(document) ??
    anyDoc.webkitExitFullscreen?.bind(document) ??
    anyDoc.mozCancelFullScreen?.bind(document) ??
    anyDoc.msExitFullscreen?.bind(document) ??
    null
  );
};

export const enterFullscreen = async (el: HTMLElement): Promise<void> => {
  if (!isBrowser || !el) return;

  const request = getRequestFn(el);
  const shouldFallback = isIOS() || !request;

  if (shouldFallback) {
    activateFallback(el);
    return;
  }

  try {
    await request();
  } catch (err) {
    console.warn('[fullscreen] requestFullscreen failed, falling back', err);
    activateFallback(el);
  }
};

export const exitFullscreen = async (): Promise<void> => {
  if (!isBrowser) return;

  if (fallbackActive) {
    releaseFallback();
    return;
  }

  const exit = getExitFn();
  if (exit) {
    try {
      await exit();
    } catch (err) {
      console.warn('[fullscreen] exitFullscreen failed', err);
    }
  }
};

export const isFullscreen = (): boolean => {
  if (!isBrowser) return false;
  const anyDoc = document as Document & {
    webkitFullscreenElement?: Element | null;
    mozFullScreenElement?: Element | null;
    msFullscreenElement?: Element | null;
  };
  return Boolean(
    document.fullscreenElement ||
      anyDoc.webkitFullscreenElement ||
      anyDoc.mozFullScreenElement ||
      anyDoc.msFullscreenElement ||
      fallbackActive
  );
};

export const ensureFallbackLayout = () => {
  if (fallbackActive) {
    applyFallbackLayout();
  }
};

export const requestLandscape = async (): Promise<void> => {
  if (!isBrowser || isIOS() || !isAndroid()) return;
  const orientation = window.screen?.orientation as (ScreenOrientation & { lock?: (mode: string) => Promise<void> }) | undefined;
  if (!orientation || typeof orientation.lock !== 'function') return;
  try {
    await orientation.lock('landscape');
  } catch (err) {
    console.info('[fullscreen] orientation lock unavailable', err);
  }
};

export type FullscreenController = {
  exit: () => Promise<void>;
  destroy: () => void;
};

const setViewportVar = () => {
  if (!isBrowser) return;
  const vh = window.innerHeight * 0.01;
  document.documentElement.style.setProperty('--looma-game-vh', `${vh}px`);
};

export const createFullscreenController = (target: HTMLElement): FullscreenController => {
  if (!isBrowser || !target) {
    return {
      exit: async () => {},
      destroy: () => {}
    };
  }

  setViewportVar();
  const onResize = () => setViewportVar();
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);
  document.body?.classList.add('looma-game-fullscreen');

  return {
    exit: () => exitFullscreen(),
    destroy: () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      document.body?.classList.remove('looma-game-fullscreen');
      document.documentElement.style.removeProperty('--looma-game-vh');
    }
  };
};
