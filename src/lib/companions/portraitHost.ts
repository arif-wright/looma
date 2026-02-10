// Shared capture host for companion portraits.
// Surfaces that can't (or shouldn't) mount an additional WebGL `model-viewer`
// can request a capture from the single already-mounted model (e.g. CompanionDock).

export type PortraitCaptureFn = () => Promise<string | null>;

let host: PortraitCaptureFn | null = null;

export const PORTRAIT_HOST_EVENT = 'looma:portraitHost';

export const registerPortraitCaptureHost = (fn: PortraitCaptureFn | null) => {
  host = fn;
  if (typeof window !== 'undefined') {
    // Let listeners (e.g. /app/home cards) retry capture once a host is ready.
    window.dispatchEvent(new Event(PORTRAIT_HOST_EVENT));
  }
  return () => {
    if (host === fn) host = null;
  };
};

export const getPortraitCaptureHost = () => host;
