import { dev } from '$app/environment';
import type { PortableStateBundle } from '$lib/types/contextBundle';

export type PortableSyncArgs = {
  userId: string;
  sessionId?: string | null;
  eventType: 'session.start' | 'session.end';
  portableState: PortableStateBundle | null | undefined;
};

// Integration point for future cross-app portability sync providers.
// Intentionally no-op in production for now.
export const syncPortableState = async (args: PortableSyncArgs): Promise<void> => {
  if (!dev) return;
  console.info('[portable-sync] stub', {
    userId: args.userId,
    sessionId: args.sessionId ?? null,
    eventType: args.eventType,
    hasPortableState: Boolean(args.portableState)
  });
};

