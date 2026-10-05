import { mount } from 'svelte';
import Preview from './Preview.svelte';
import { fixture } from './runtime';

// This synthetic component fixture must never contact an API, account or database.
window.fetch = async (input) => {
  fixture.blocked.push(`fetch: ${String(input)}`);
  throw new Error('Orbfield preview forbids network API calls.');
};
XMLHttpRequest.prototype.open = function () {
  fixture.blocked.push('XMLHttpRequest');
  throw new Error('Orbfield preview forbids XMLHttpRequest.');
};
navigator.sendBeacon = () => {
  fixture.blocked.push('sendBeacon');
  return false;
};
mount(Preview, { target: document.getElementById('app')! });
