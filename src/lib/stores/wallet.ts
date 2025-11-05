import { writable } from 'svelte/store';

const KEY = 'looma.wallet.shards';

const initial = (() => {
  if (typeof localStorage === 'undefined') return 1000;
  const value = localStorage.getItem(KEY);
  const parsed = value ? Number.parseInt(value, 10) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 1000;
})();

export const shards = writable<number>(initial);

if (typeof window !== 'undefined') {
  shards.subscribe((value) => {
    try {
      localStorage.setItem(KEY, String(value));
    } catch {
      /* ignore */
    }
  });
}
