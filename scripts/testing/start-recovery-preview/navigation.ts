import { writable } from 'svelte/store';
import { fixture } from './runtime';
// The rendered owner deliberately stays A even when synthetic Auth reports B/null.
export const page = writable({ data: { user: { id: 'owner-a' } } });
export const pathname = writable(location.pathname);
export const goto = async (target: string) => {
  if (!['/app/games', '/app/auth'].includes(target)) throw new Error(`Unexpected synthetic navigation: ${target}`);
  fixture.navigations.push(target);
  history.pushState(null, '', target);
  pathname.set(target);
};
