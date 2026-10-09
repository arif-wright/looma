import { writable } from 'svelte/store';
import { fixture } from './runtime';
// Rendered owner remains A when the synthetic Auth source changes identity.
export const page = writable({ data: { user: { id: 'owner-a' } } });
export const goto = async (target: string) => {
  if (!['/app/games', '/app/auth'].includes(target)) throw new Error('Unexpected fixture navigation');
  fixture.navigations.push(target);
  await fixture.unmountAll();
  history.pushState(null, '', target);
};
