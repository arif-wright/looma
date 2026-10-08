import { onMount } from 'svelte';
import { writable } from 'svelte/store';
import { refresh } from './model';
export const page = writable({ url: new URL(location.href) });
const callbacks = new Set<() => unknown>();
export function afterNavigate(callback: () => unknown) { onMount(() => { callbacks.add(callback); callback(); return () => callbacks.delete(callback); }); }
export const invalidateAll = refresh;
export function navigated() { page.set({ url: new URL(location.href) }); for (const callback of callbacks) callback(); }
