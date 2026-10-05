// Synthetic production-render checks. Run after npm run build; no browser or DB.
import assert from 'node:assert/strict';
import { render } from 'svelte/server';
import Inventory from '../../.svelte-kit/output/server/entries/pages/app/(protected)/inventory/_page.svelte.js';
const id = '10000000-0000-0000-0000-000000000002';
const item = { id: 'catalog', item_key: 'care-moss-seat', title: 'Moss Seat', description: 'A quiet seat.', kind: 'decor', tone: 'care', visual_key: 'moss_seat', capabilities: ['placeable', 'interactive'] };
const story = { id, title: item.title, visualKey: item.visual_key, companionName: 'Moss', acquiredAt: '2026-10-03T10:00:00Z', sourceLabel: 'Earned through three care moments', sourceNote: null,
  careEvents: [{ id: 'care-1', label: 'Fed together', occurredAt: '2026-10-01T10:00:00Z' }], placeable: true,
  placements: [{ id: 'place-1', label: 'Left grove' }, { id: 'place-2', label: 'Near right' }], placementsAvailable: true, historyState: 'ready',
  moments: [{ id: 'moment-1', title: '<script>unsafe</script>', body: '<img src=x onerror=alert(1)>', occurredAt: '2026-10-04T10:00:00Z', label: 'Rested together', slotLabel: 'Center glade', href: '/app/memory?companion=recorded&moment=exact#moment-exact' }] };
const data = { items: [], unifiedItems: [{ id, quantity: 2, source_type: 'care_milestone', acquired_at: story.acquiredAt, item }], companionRewards: [], placements: [], story, storyStatus: 'ready', error: null };
const html = render(Inventory, { props: { data } }).body;
assert.match(html, /Your keepsake’s story/);
assert.match(html, /Left grove/); assert.match(html, /Near right/); assert.match(html, /Recorded in center glade/);
assert.match(html, /&lt;script(?:>|&gt;)unsafe&lt;\/script(?:>|&gt;)/); assert.doesNotMatch(html, /<script>unsafe/);
assert.doesNotMatch(html, /<img src=x/);
assert.match(html, /companion=recorded&amp;moment=exact#moment-exact/);
assert.match(html, /id="keepsake-story"/); assert.match(html, /aria-labelledby="keepsake-story-title"/);
const partial = render(Inventory, { props: { data: { ...data, error: 'Some details unavailable' } } }).body;
assert.match(partial, /Some details unavailable/); assert.match(partial, new RegExp(`id="keepsake-${id}"`));
const unknownPlacement = render(Inventory, { props: { data: { ...data, placementsAvailable: false, placements: [],
  story: { ...story, placementsAvailable: false, placements: [] } } } }).body;
assert.match(unknownPlacement, /Current placement could not be checked/);
assert.doesNotMatch(unknownPlacement, /Place this object to unlock|Place in Sanctuary/);
const empty = render(Inventory, { props: { data: { ...data, story: { ...story, moments: [] } } } }).body;
assert.match(empty, /No recent recorded moments are available here/); assert.doesNotMatch(empty, /No recorded moments are linked/);
console.log('PASS: production SSR story markup, escaped authored text, exact links, multiple placements, partial-failure collection and honest filtered-empty state (synthetic fixtures).');
