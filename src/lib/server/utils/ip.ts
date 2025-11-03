import type { RequestEvent } from '@sveltejs/kit';

type MaybeEvent = Pick<RequestEvent, 'request' | 'getClientAddress'> | {
  request: Request;
  getClientAddress?: () => string;
} | null | undefined;

const extractForwarded = (header: string | null) => {
  if (!header) return null;
  const first = header.split(',')[0]?.trim();
  return first && first.length > 0 ? first : null;
};

export const getClientIp = (event: MaybeEvent): string | null => {
  if (!event) return null;
  const xfwd = extractForwarded(event.request?.headers?.get?.('x-forwarded-for') ?? null);
  if (xfwd) return xfwd;
  const realIp = extractForwarded(event.request?.headers?.get?.('x-real-ip') ?? null);
  if (realIp) return realIp;
  if (typeof event.getClientAddress === 'function') {
    try {
      const addr = event.getClientAddress();
      if (addr && addr !== '::1') {
        return addr;
      }
    } catch {
      // ignore getClientAddress errors
    }
  }
  return null;
};
