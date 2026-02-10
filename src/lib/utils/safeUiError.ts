import { dev } from '$app/environment';
import {
  SAFE_COMPLETION_MESSAGE,
  SAFE_LOAD_MESSAGE,
  SAFE_NETWORK_MESSAGE,
  SAFE_UNAUTHORIZED_MESSAGE
} from '$lib/safeMessages';

const KNOWN_SAFE_MESSAGES = new Set<string>([
  SAFE_LOAD_MESSAGE,
  SAFE_UNAUTHORIZED_MESSAGE,
  SAFE_NETWORK_MESSAGE,
  SAFE_COMPLETION_MESSAGE
]);

const isProbablyUnauthorized = (input: unknown) => {
  const status = (input && typeof input === 'object' ? (input as { status?: unknown }).status : null) as unknown;
  if (status === 401) return true;
  const code = (input && typeof input === 'object' ? (input as { code?: unknown }).code : null) as unknown;
  if (code === 'unauthorized') return true;
  const msg = (input && typeof input === 'object' ? (input as { message?: unknown }).message : null) as unknown;
  if (typeof msg === 'string') {
    const lowered = msg.toLowerCase();
    if (lowered.includes('jwt') && lowered.includes('expired')) return true;
    if (lowered.includes('session') && lowered.includes('expired')) return true;
    if (lowered.includes('not authenticated')) return true;
  }
  return false;
};

export const safeUiMessage = (input: unknown, fallback: string = SAFE_LOAD_MESSAGE) => {
  if (input instanceof TypeError) return SAFE_NETWORK_MESSAGE;
  if (isProbablyUnauthorized(input)) return SAFE_UNAUTHORIZED_MESSAGE;

  if (typeof input === 'string' && input.trim()) {
    return KNOWN_SAFE_MESSAGES.has(input) ? input : fallback;
  }

  const msg = (input && typeof input === 'object' ? (input as { message?: unknown }).message : null) as unknown;
  if (typeof msg === 'string' && msg.trim()) {
    return KNOWN_SAFE_MESSAGES.has(msg) ? msg : fallback;
  }

  return fallback;
};

export const safeApiPayloadMessage = (payload: unknown, status?: number) => {
  const msg =
    payload && typeof payload === 'object'
      ? ((payload as { message?: unknown }).message as unknown)
      : null;
  if (typeof msg === 'string' && msg.trim()) return msg;
  if (status === 401) return SAFE_UNAUTHORIZED_MESSAGE;
  return SAFE_LOAD_MESSAGE;
};

export const devLog = (scope: string, err: unknown, extra?: Record<string, unknown>) => {
  if (!dev) return;
  if (extra) {
    console.error(scope, { err, ...extra });
    return;
  }
  console.error(scope, err);
};
