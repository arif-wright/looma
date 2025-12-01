import { writable, type Readable } from 'svelte/store';

type FullscreenMode = 'native' | 'fallback' | null;

type FullscreenOptions = {
  autoEnter?: boolean;
};

export type FullscreenController = {
  enter(): Promise<void>;
  exit(): Promise<void>;
  destroy(): void;
  isActive: Readable<boolean>;
};

const getRequestFn = (element: HTMLElement) => {
  return (
    element.requestFullscreen ||
    (element as any).webkitRequestFullscreen ||
    (element as any).webkitEnterFullscreen ||
    (element as any).mozRequestFullScreen ||
    (element as any).msRequestFullscreen ||
    null
  );
};

export const createFullscreenController = (
  target: HTMLElement,
  options: FullscreenOptions = {}
): FullscreenController => {
  const { autoEnter = true } = options;
  const isBrowser = typeof window !== 'undefined';
  const isActive = writable(false);
  let mode: FullscreenMode = null;
  let destroyed = false;
  let locked = false;
  let scrollY = 0;
  const savedBody: Record<string, string> = {
    overflow: '',
    position: '',
    width: '',
    top: ''
  };
  let savedDocOverflow = '';

  const updateViewportUnit = () => {
    if (!isBrowser) return;
    document.documentElement.style.setProperty('--looma-game-vh', `${window.innerHeight * 0.01}px`);
  };

  const lockBody = () => {
    if (!isBrowser || locked) return;
    locked = true;
    scrollY = window.scrollY || window.pageYOffset;
    savedBody.overflow = document.body.style.overflow;
    savedBody.position = document.body.style.position;
    savedBody.width = document.body.style.width;
    savedBody.top = document.body.style.top;
    savedDocOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.top = `-${scrollY}px`;
    document.body.classList.add('looma-game-fullscreen');
    updateViewportUnit();
    window.addEventListener('resize', updateViewportUnit);
    window.addEventListener('orientationchange', updateViewportUnit);
    requestAnimationFrame(() => window.scrollTo(0, 1));
  };

  const unlockBody = () => {
    if (!isBrowser || !locked) return;
    locked = false;
    document.documentElement.style.overflow = savedDocOverflow;
    document.body.style.overflow = savedBody.overflow;
    document.body.style.position = savedBody.position;
    document.body.style.width = savedBody.width;
    document.body.style.top = savedBody.top;
    document.documentElement.style.removeProperty('--looma-game-vh');
    document.body.classList.remove('looma-game-fullscreen');
    window.removeEventListener('resize', updateViewportUnit);
    window.removeEventListener('orientationchange', updateViewportUnit);
    window.scrollTo(0, scrollY);
  };

  const handleNativeChange = () => {
    if (!document.fullscreenElement && mode === 'native') {
      mode = null;
      isActive.set(false);
      unlockBody();
      document.removeEventListener('fullscreenchange', handleNativeChange);
    }
  };

  const enter = async () => {
    if (!target || mode || destroyed || !isBrowser) return;
    lockBody();
    const request = getRequestFn(target);
    if (request) {
      try {
        await request.call(target, { navigationUI: 'hide' });
        mode = 'native';
        isActive.set(true);
        document.addEventListener('fullscreenchange', handleNativeChange);
        return;
      } catch (err) {
        console.warn('[fullscreen] native request failed, falling back', err);
      }
    }
    mode = 'fallback';
    isActive.set(true);
  };

  const exit = async () => {
    if (!mode || !isBrowser) return;
    if (mode === 'native' && document.fullscreenElement) {
      try {
        await document.exitFullscreen?.();
      } catch (err) {
        console.warn('[fullscreen] exit failed', err);
      }
      document.removeEventListener('fullscreenchange', handleNativeChange);
    }
    mode = null;
    isActive.set(false);
    unlockBody();
  };

  if (autoEnter && isBrowser) {
    requestAnimationFrame(() => {
      void enter();
    });
  }

  return {
    enter,
    exit,
    destroy() {
      destroyed = true;
      document.removeEventListener('fullscreenchange', handleNativeChange);
      void exit();
    },
    isActive
  };
};
