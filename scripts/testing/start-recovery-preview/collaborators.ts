import { fixture, type AuthCallback } from './runtime';

// Synthetic collaborators only. No Supabase client, account or credentials exist here.
export const createSupabaseBrowserClient = () => ({ auth: {
  onAuthStateChange(callback: AuthCallback) {
    fixture.authSubscriptions++;
    if (fixture.auth === 'unavailable') throw new Error('Synthetic unavailable Auth');
    fixture.callbacks.add(callback);
    if (fixture.auth !== 'hold') void Promise.resolve().then(() => {
      if (!fixture.callbacks.has(callback)) return;
      fixture.authNotifications++;
      callback('INITIAL_SESSION', fixture.owner ? { user: { id: fixture.owner } } : null);
    });
    return { data: { subscription: { unsubscribe: () => fixture.callbacks.delete(callback) } } };
  }
} });
export const applyPlayerState = (value: unknown) => { fixture.playerStates.push(value); };
export const getPlayerProgressSnapshot = (): { xp?: number; currency?: number } => ({});
export const getActiveCompanionSnapshot = (): { mood?: string } | null => null;
export const applyRitualUpdate = (value: unknown) => { fixture.rituals.push(value); };
export const pushCompanionReaction = (value: unknown) => { fixture.reactions.push(value); };
export const sendAnalytics = (name: string, payload: unknown) => { fixture.analytics.push({ name, payload }); };
export const sendEvent = async (name: string, payload: Record<string, unknown>, options?: unknown): Promise<{ output?: { suppressed?: boolean; reaction?: unknown } } | null> => {
  fixture.events.push({ name, payload, options });
  return null;
};
export const playSound = (..._args: unknown[]) => {};
export const stopSound = (..._args: unknown[]) => {};
export const isAudioEnabled = () => false;
export const toggleAudioEnabled = () => false;
