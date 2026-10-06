<script lang="ts">
  import { onMount, tick } from 'svelte';
  import Inventory from '../../../src/routes/app/(protected)/inventory/+page.svelte';
  import { buildKeepsakeStory } from '$lib/items/story';
  import { companions, fixture, ownerId, setRefreshHandler, state } from './model';
  import { navigated } from './navigation';
  let mounted = true;
  let url = new URL(location.href);
  let stacks = structuredClone(state.stacks);
  let journal = structuredClone(state.journal);
  let bindings = structuredClone(state.bindings);
  let currentCompanions = companions;
  let memory = state.memory;
  $: selected = stacks.find((value) => value.id === url.searchParams.get('item'));
  $: story = selected ? buildKeepsakeStory({ ownerId, owned: selected, placements: [], journal, moonberryShares: bindings, historyState: memory ? 'ready' : 'disabled' }) : null;
  $: data = { ownerId, companions: currentCompanions, companionsAvailable: true, items: [], unifiedItems: stacks, companionRewards: [], placements: [], story, storyStatus: url.searchParams.has('item') ? story ? 'ready' : 'unavailable' : null, error: null };
  onMount(() => {
    setRefreshHandler(async () => { stacks = structuredClone(state.stacks); journal = structuredClone(state.journal); bindings = structuredClone(state.bindings); memory = state.memory; await tick(); });
    fixture.unmount = async () => { mounted = false; await tick(); };
    fixture.mount = async () => { mounted = true; await tick(); };
    fixture.setCompanions = async (ids) => { currentCompanions = companions.filter((row) => ids.includes(row.id)); await tick(); };
    fixture.hideMemory = async () => { memory = false; await tick(); };
    const sync = async () => { url = new URL(location.href); await tick(); navigated(); if (location.hash) document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView(); };
    const navigate = (event: MouseEvent) => { const link = (event.target as Element).closest('a'); if (!link || link.origin !== location.origin || event.ctrlKey || event.metaKey) return; event.preventDefault(); history.pushState({}, '', link.href); void sync(); };
    document.addEventListener('click', navigate); window.addEventListener('popstate', sync);
    return () => { document.removeEventListener('click', navigate); window.removeEventListener('popstate', sync); };
  });
</script>
<div class="fixture-note">SYNTHETIC LOCAL TEST · REAL UI COMPONENTS · NO ACCOUNT OR DATABASE</div>
<div class="app-preview">
  {#if !mounted}<p>Fixture unmounted. Synthetic state retained.</p>
  {:else if url.pathname === '/app/memory'}<h1>Exact synthetic Journal destination</h1><p>Companion: {url.searchParams.get('companion')}</p><p>Moment: {url.searchParams.get('moment')}</p>
  {:else}<Inventory {data} />{/if}
</div>
<style>
  :global(*) { box-sizing: border-box; }
  :global(body) { margin: 0; background: #070c1b; color: #e8ecff; font-family: 'Segoe UI', sans-serif; }
  :global(button), :global(input) { font: inherit; }
  :global(.sr-only) { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border-width: 0; }
  :global(.sanctuary-title) { font-family: 'Segoe UI', sans-serif; }
  .fixture-note { position: sticky; top: 0; z-index: 100; background: #102337; color: #c6eceb; font-size: 10px; letter-spacing: .1em; padding: 12px; text-align: center; }
  .app-preview { max-width: 1040px; margin: 0 auto; padding: 0 16px; }
  @media(max-width: 540px) { .app-preview { padding: 0 8px; } }
</style>
