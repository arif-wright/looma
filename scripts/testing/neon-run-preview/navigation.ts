import { onMount } from 'svelte';
import { writable } from 'svelte/store';
const initialUrl = new URL(typeof location === 'undefined' ? 'http://127.0.0.1:4178/app/games/runner' : location.href);
export const page = writable({ url: initialUrl, data: { user: { id: 'synthetic-owner' } } });
const after = new Set<() => unknown>();
const before = new Set<(navigation: any) => unknown>();
export function afterNavigate(callback: () => unknown) { onMount(() => { after.add(callback); callback(); return () => after.delete(callback); }); }
export function beforeNavigate(callback: (navigation: any) => unknown) { onMount(() => { before.add(callback); return () => before.delete(callback); }); }
export async function goto(href: string, options?: { replaceState?: boolean }) {
  const url = new URL(href, location.href);
  if (url.origin !== location.origin) throw new Error('Fixture navigation must remain local.');
  let cancelled = false;
  for (const callback of before) callback({ to: { url }, cancel: () => { cancelled = true; } });
  if (cancelled) return;
  if (options?.replaceState) history.replaceState({}, '', url); else history.pushState({}, '', url);
  navigated();
}
export function navigated() {
  page.set({ url: new URL(location.href), data: { user: { id: 'synthetic-owner' } } });
  window.dispatchEvent(new Event('fixture:navigation'));
  for (const callback of after) callback();
}
export async function invalidateAll() { throw new Error('Invalidation is not allowed by this isolated fixture.'); }
