import { onMount } from 'svelte';
import { writable } from 'svelte/store';
export const page = writable({ url: new URL(location.href) });
const callbacks = new Set<() => unknown>();
export function afterNavigate(callback: () => unknown) { onMount(() => { callbacks.add(callback); callback(); return () => callbacks.delete(callback); }); }
export async function invalidateAll() { throw new Error('This fixture is read-only.'); }
export function navigated() { page.set({ url: new URL(location.href) }); for (const callback of callbacks) callback(); }
