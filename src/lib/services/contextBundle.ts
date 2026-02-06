import type { ContextBundle } from '$lib/types/contextBundle';

export class ContextBundleError extends Error {
  status: number;
  constructor(message: string, status = 500) {
    super(message);
    this.name = 'ContextBundleError';
    this.status = status;
  }
}

export const fetchContextBundle = async (fetcher: typeof fetch = fetch): Promise<ContextBundle> => {
  const res = await fetcher('/api/context/bundle');
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    const message = payload?.error ?? 'Unable to fetch context bundle.';
    throw new ContextBundleError(message, res.status);
  }

  return (await res.json()) as ContextBundle;
};
