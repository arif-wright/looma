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
const fullscreenAttempts = new WeakMap<HTMLElement, { token: symbol; signal: AbortSignal | undefined }>();

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
  if (fallbackActive && fallbackTarget === el) {
    applyFallbackLayout();
    return;
  }
  if (fallbackActive) releaseFallback();
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

const nativeFullscreenElement = (): Element | null => {
  if (!isBrowser) return null;
  const anyDoc = document as Document & {
    webkitFullscreenElement?: Element | null;
    mozFullScreenElement?: Element | null;
    msFullscreenElement?: Element | null;
  };
  return document.fullscreenElement || anyDoc.webkitFullscreenElement ||
    anyDoc.mozFullScreenElement || anyDoc.msFullscreenElement || null;
};

export const enterFullscreen = async (
  el: HTMLElement,
  options: { signal?: AbortSignal } = {}
): Promise<void> => {
  if (!isBrowser || !el || options.signal?.aborted) return;
  const attempt = Symbol('fullscreen-attempt');
  fullscreenAttempts.set(el, { token: attempt, signal: options.signal });
  const ownsTarget = () => fullscreenAttempts.get(el)?.token === attempt;
  const cancelled = () => options.signal?.aborted || !ownsTarget();
  const releaseOwnTarget = async () => {
    const latest = fullscreenAttempts.get(el);
    // Preserve a newer live attempt, but do not strand a target after both attempts were cancelled.
    if (!ownsTarget() && !latest?.signal?.aborted) return;
    if (fallbackTarget === el) releaseFallback();
    if (nativeFullscreenElement() === el) {
      try {
        await getExitFn()?.();
      } catch (err) {
        console.info('[fullscreen] cancelled target could not exit fullscreen', err);
      }
    }
  };
  options.signal?.addEventListener('abort', () => { void releaseOwnTarget(); }, { once: true });

  const request = getRequestFn(el);
  const shouldFallback = isIOS() || !request;
  if (shouldFallback) {
    if (!cancelled()) activateFallback(el);
    return;
  }

  try {
    await request();
    if (options.signal?.aborted) await releaseOwnTarget();
  } catch (err) {
    if (cancelled()) return;
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

export const isFullscreen = (): boolean => Boolean(nativeFullscreenElement() || fallbackActive);

export const ensureFallbackLayout = () => {
  if (fallbackActive) {
    applyFallbackLayout();
  }
};

let landscapeAttempt: { active: boolean } | null = null;
let landscapeCleanupPending = false;

export const requestLandscape = async (options: { signal?: AbortSignal } = {}): Promise<void> => {
  if (!isBrowser || isIOS() || !isAndroid() || options.signal?.aborted) return;
  const orientation = window.screen?.orientation as (ScreenOrientation & { lock?: (mode: string) => Promise<void> }) | undefined;
  if (!orientation || typeof orientation.lock !== 'function') return;
  const attempt = { active: true };
  landscapeAttempt = attempt;
  const releaseOwnLock = () => {
    if (landscapeAttempt !== attempt && landscapeAttempt?.active) {
      landscapeCleanupPending = true;
      return;
    }
    landscapeCleanupPending = false;
    try {
      orientation.unlock?.();
    } catch (err) {
      console.info('[fullscreen] cancelled orientation lock could not be released', err);
    }
  };
  options.signal?.addEventListener('abort', () => {
    attempt.active = false;
    releaseOwnLock();
  }, { once: true });
  try {
    await orientation.lock('landscape');
    if (options.signal?.aborted) releaseOwnLock();
  } catch (err) {
    attempt.active = false;
    if (landscapeCleanupPending && !landscapeAttempt?.active) releaseOwnLock();
    if (!options.signal?.aborted) console.info('[fullscreen] orientation lock unavailable', err);
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
