import { createHash } from 'node:crypto';
import type { RequestEvent } from '@sveltejs/kit';

type MaybeEvent = Pick<RequestEvent, 'request'> | { request: Request } | null | undefined;

const getHeader = (request: Request, name: string) => request.headers.get(name) ?? '';

export const getDeviceHash = (event: MaybeEvent): string | null => {
  if (!event) return null;
  const request = event.request;
  if (!request) return null;

  const ua = getHeader(request, 'user-agent');
  const language = getHeader(request, 'accept-language');
  const platform =
    getHeader(request, 'sec-ch-ua-platform') ||
    getHeader(request, 'sec-ch-ua-platform-full') ||
    getHeader(request, 'x-client-platform');

  if (!ua && !language && !platform) {
    return null;
  }

  const raw = `${ua}|${language}|${platform}`.toLowerCase();
  return createHash('sha256').update(raw).digest('hex');
};
