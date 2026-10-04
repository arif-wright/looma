<script lang="ts">
  import { onMount, tick } from 'svelte';
  import Inventory from '../../../src/routes/app/(protected)/inventory/+page.svelte';
  import Sanctuary from '../../../src/routes/app/(protected)/sanctuary/+page.svelte';
  import { buildKeepsakeStory } from '$lib/items/story';
  import { navigated } from './navigation';
  const id = (n: number) => `10000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
  const ownerId = id(1), companionId = id(3);
  const item = { id: id(4), item_key: 'care-moss-seat', title: 'Moss Seat', description: 'A soft, moss-covered seat for a quiet moment together.', kind: 'decor', tone: 'care', visual_key: 'moss_seat', capabilities: ['placeable', 'interactive', 'keepsake'] };
  const owned = { id: id(2), owner_id: ownerId, companion_id: companionId, quantity: 2, source_type: 'care_milestone', source_key: 'care_3', acquired_at: '2026-10-03T10:00:00Z', companion: { id: companionId, name: 'Moss' }, item,
    provenance_json: { ruleVersion: 'direct-care-3-v1', careMoments: 3, careEvents: ['feed', 'play', 'groom'].map((action, i) => ({ id: id(10 + i), action, createdAt: `2026-10-0${i + 1}T08:00:00Z` })) } };
  const other = { ...owned, id: id(5), quantity: 1, source_type: 'chapter_reward', provenance_json: {} };
  const placements = [ { id: id(20), owner_id: ownerId, user_item_id: owned.id, item_id: item.id, slot_key: 'left_grove', item }, { id: id(21), owner_id: ownerId, user_item_id: owned.id, item_id: item.id, slot_key: 'near_right', item } ];
  const moments = [
    { id: id(30), owner_id: ownerId, companion_id: id(7), source_type: 'system', source_id: id(90), title: 'A quiet rest with Fern', body: 'Fern settles beside you on the Moss Seat. For a little while, the sanctuary is simply a place to rest together.', created_at: '2026-10-04T08:00:00Z', meta_json: { category: 'sanctuary', interactionType: 'shared_rest', action: 'shared_rest', userItemId: owned.id, itemKey: 'care-moss-seat', placementId: id(19), slot: 'center_glade' } },
    { id: id(31), owner_id: ownerId, companion_id: companionId, source_type: 'system', title: 'Moss Seat found a place', body: 'Moss notices the soft new corner in the grove.', created_at: '2026-10-03T12:00:00Z', meta_json: { category: 'sanctuary', userItemId: owned.id, itemKey: 'care-moss-seat', placementId: id(20), slot: 'left_grove' } }
  ];
  let url = new URL(location.href);
  $: selected = [owned, other].find((value) => value.id === url.searchParams.get('item'));
  $: story = selected ? buildKeepsakeStory({ ownerId, owned: selected, placements: url.searchParams.has('removed') ? [] : placements, journal: moments, historyState: url.searchParams.has('failed') ? 'unavailable' : 'ready' }) : null;
  $: data = { items: [], unifiedItems: [owned, other], companionRewards: [], placements, story, storyStatus: url.searchParams.has('item') ? story ? 'ready' : 'unavailable' : null, storyFromSanctuary: url.searchParams.get('from') === 'sanctuary', storySanctuarySelection: url.searchParams.get('selected'), error: null };
  const sanctuaryData = { companion: { id: companionId, name: 'Moss' }, items: [owned, other], placements, latestReaction: null, restAvailable: false, nextRestAvailableAt: null, error: null };
  onMount(() => {
    const sync = async () => { url = new URL(location.href); await tick(); navigated(); if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView(); };
    const navigate = (event: MouseEvent) => { const link = (event.target as Element).closest('a'); if (!link || link.origin !== location.origin || event.ctrlKey || event.metaKey) return; event.preventDefault(); history.pushState({}, '', link.href); void sync(); };
    document.addEventListener('click', navigate); window.addEventListener('popstate', sync);
    return () => { document.removeEventListener('click', navigate); window.removeEventListener('popstate', sync); };
  });
</script>

{#if url.pathname === '/mobile'}
  <div class="fixture-note">Synthetic 390px viewport · actual page components · no account or database</div>
  <iframe title="Mobile keepsake preview" src={`/app/inventory?item=${owned.id}#keepsake-story`} width="390" height="1100"></iframe>
{:else}
  <div class="fixture-note">LOCAL DESIGN REVIEW · SYNTHETIC FIXTURES · NO DATA WRITES</div>
  <div class="app-preview">
    {#if url.pathname === '/app/sanctuary'}<Sanctuary data={sanctuaryData as any} />
    {:else if url.pathname === '/app/memory'}<h1>Exact Journal destination</h1><p>Companion: {url.searchParams.get('companion')}</p><p>Moment: {url.searchParams.get('moment')}</p><a href={`/app/inventory?item=${owned.id}#keepsake-story`}>Return to story</a>
    {:else}<Inventory {data} />{/if}
  </div>
{/if}
<style>
  :global(*) { box-sizing: border-box; }
  :global(body) { margin: 0; background: #070c1b; color: #e8ecff; font-family: 'Segoe UI', sans-serif; }
  :global(button), :global(input) { font: inherit; }
  :global(.sr-only) { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border-width: 0; }
  :global(.sanctuary-title) { font-family: 'Segoe UI', sans-serif; }
  .fixture-note { font-size: 10px; letter-spacing: .12em; color: #829ab1; padding: 15px; text-align: center; }
  .app-preview { max-width: 1040px; margin: 0 auto; padding: 0 16px; }
  iframe { border: 1px solid #405567; display: block; margin: 0 auto; }
  @media(max-width: 540px) { .app-preview { padding: 0 8px; } }
</style>
