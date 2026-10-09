import { fixture, type AuthCallback } from './runtime';
export const createSupabaseBrowserClient = () => ({ auth: {
  onAuthStateChange(callback: AuthCallback) {
    fixture.callbacks.add(callback);
    void Promise.resolve().then(() => {
      if (fixture.callbacks.has(callback)) callback('INITIAL_SESSION', fixture.owner ? { user: { id: fixture.owner } } : null);
    });
    return { data: { subscription: { unsubscribe: () => fixture.callbacks.delete(callback) } } };
  }
} });
export const applyPlayerState = (value: unknown) => { fixture.rewardMutations.push({ type: 'player', value }); };
export const recordRewardResult = (value: unknown) => { fixture.rewardMutations.push({ type: 'reward', value }); };
export const applyRitualUpdate = (value: unknown) => { fixture.rewardMutations.push({ type: 'ritual', value }); };
export const getPlayerProgressSnapshot = (): { xp?: number; currency?: number } => ({});
export const getActiveCompanionSnapshot = (): { mood?: string } | null => null;
export const sendAnalytics = (..._args: unknown[]) => {};
export const sendEvent = async (..._args: unknown[]): Promise<{ output?: { suppressed?: boolean; reaction?: unknown } } | null> => null;
export const achievementsUI = { focusAchievement(..._args: unknown[]) {}, open(..._args: unknown[]) {} };

export const pushCompanionReaction = (value: unknown) => { fixture.rewardMutations.push({ type: 'reaction', value }); };
