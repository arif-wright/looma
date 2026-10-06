import { mount } from 'svelte';
import Preview from './Preview.svelte';
import { fixture } from './fake-colyseus';

// The production connection still calls fetch; this fixture answers only its local
// ticket POST and rejects external fetches. No real credentials ever enter the test.
const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(input instanceof Request ? input.url : String(input), location.href);
  if (url.origin !== location.origin) throw new Error(`External fixture fetch forbidden: ${url.origin}`);
  if (url.pathname === '/api/world/ticket') {
    if ((init?.method ?? 'GET') !== 'POST') throw new Error('Expected local ticket POST');
    fixture.tickets += 1;
    return new Response(JSON.stringify({ ticket: 'local-synthetic-ticket-not-a-credential', expiresAt: Date.now() + 60_000 }), {
      status: 200, headers: { 'content-type': 'application/json' }
    });
  }
  return originalFetch(input, init);
};
mount(Preview, { target: document.getElementById('app')! });
