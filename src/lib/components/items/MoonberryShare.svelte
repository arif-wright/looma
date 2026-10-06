<script lang="ts">
  import { onMount, tick } from 'svelte';
  import {
    forgetShareIntent, MOONBERRY_INTENT_EVENT, readShareIntent, rememberShareIntent,
    sendMoonberryShare, type ShareIntent
  } from '$lib/items/moonberryShareClient';

  export let ownerId: string;
  export let userItemId = '';
  export let quantity = 0;
  export let recoveryOnly = false;
  export let availableItemIds: string[] = [];
  export let companions: Array<{ id: string; name: string }>;
  export let onChanged: () => Promise<void>;
  export let onStockUncertain: (uncertain: boolean) => void = () => {};

  type Phase = 'idle' | 'confirm' | 'pending' | 'uncertain' | 'refreshing' | 'done' | 'refresh-error';
  let phase: Phase = 'idle';
  let selectedId = '';
  let intent: ShareIntent | null = null;
  let confirmedIntent: ShareIntent | null = null;
  let storage: Storage | null = null;
  let storageReady = false;
  let mounted = false;
  let scope = '';
  let epoch = 0;
  let controller: AbortController | null = null;
  let message = '';
  let reaction = '';
  let confirmRegion: HTMLDivElement | undefined;
  let launchButton: HTMLButtonElement | undefined;

  $: stockUncertain = Boolean(intent) || ['pending', 'uncertain', 'refreshing', 'refresh-error'].includes(phase);
  $: onStockUncertain(stockUncertain);
  $: selected = companions.find((companion) => companion.id === selectedId);
  $: intentName = companions.find((companion) => companion.id === intent?.companionId)?.name ?? 'the selected companion';
  $: otherStack = Boolean(intent && intent.userItemId !== userItemId);
  $: showRecovery = Boolean(recoveryOnly && (intent ? !availableItemIds.includes(intent.userItemId) : Boolean(message)));
  const isBusy = () => phase === 'pending' || phase === 'refreshing';
  $: if (mounted && scope !== `${ownerId}:${userItemId}`) resetScope();
  $: if (phase === 'confirm' && (!selected || quantity < 1)) phase = 'idle';

  function syncSaved() {
    if (!storage) { storageReady = false; return; }
    const saved = readShareIntent(storage, ownerId);
    storageReady = saved.state === 'ready';
    if (saved.state !== 'ready') return;
    intent = saved.intent;
    // A restored request never sends itself, even when navigation kept this component mounted.
    if (!isBusy() && intent) { phase = 'uncertain'; selectedId = intent.userItemId === userItemId ? intent.companionId : ''; }
    else if (!isBusy() && phase === 'uncertain' && !intent) phase = 'idle';
  }
  function resetScope() {
    epoch += 1;
    controller?.abort();
    scope = `${ownerId}:${userItemId}`;
    phase = 'idle'; selectedId = ''; message = ''; reaction = ''; intent = null; confirmedIntent = null;
    syncSaved();
  }
  onMount(() => {
    try { storage = window.sessionStorage; } catch { storage = null; }
    mounted = true;
    resetScope();
    window.addEventListener(MOONBERRY_INTENT_EVENT, syncSaved);
    window.addEventListener('storage', syncSaved);
    return () => {
      mounted = false; epoch += 1; controller?.abort();
      window.removeEventListener(MOONBERRY_INTENT_EVENT, syncSaved);
      window.removeEventListener('storage', syncSaved);
    };
  });
  const notify = () => window.dispatchEvent(new Event(MOONBERRY_INTENT_EVENT));

  async function openConfirm() {
    if (isBusy() || intent || !storageReady || !selected || quantity < 1) return;
    phase = 'confirm'; message = ''; reaction = '';
    await tick(); confirmRegion?.focus();
  }
  async function cancel() {
    if (phase !== 'confirm') return;
    phase = 'idle';
    await tick(); launchButton?.focus();
  }
  async function confirm() {
    if (phase !== 'confirm' || !selected || quantity < 1 || !storage) return;
    const next = { requestId: crypto.randomUUID(), userItemId, companionId: selected.id };
    // Save before sending. If storage is blocked, do not create an untraceable mutation.
    if (!rememberShareIntent(storage, ownerId, next)) { syncSaved(); message = 'Sharing could not start safely in this browser session.'; return; }
    intent = next;
    phase = 'pending'; notify();
    await perform(next);
  }
  async function retry() {
    if (phase !== 'uncertain' || !intent || (otherStack && !recoveryOnly) || !storageReady) return;
    phase = 'pending';
    await perform(intent);
  }
  async function perform(request: ShareIntent) {
    const generation = epoch;
    const requestedOwner = ownerId;
    const name = companions.find((companion) => companion.id === request.companionId)?.name ?? 'the selected companion';
    message = ''; reaction = '';
    controller = new AbortController();
    const outcome = await sendMoonberryShare(request, { ownerId: requestedOwner, signal: controller.signal });
    if (!mounted || generation !== epoch) return;
    controller = null;
    if (outcome.kind === 'uncertain' || outcome.kind === 'unauthorized') {
      phase = 'uncertain';
      message = outcome.kind === 'unauthorized' ? 'Sign in again before checking this share. Its result is still unconfirmed.' : '';
      return;
    }
    message = outcome.kind === 'shared'
      ? `${outcome.replayed ? 'Confirmed: you shared' : 'You shared'} one Moonberry with ${name}.`
      : outcome.kind === 'empty' ? 'No Moonberry was shared: this stack was empty.'
      : outcome.code === 'companion_required' ? 'That companion is no longer available for sharing.'
      : outcome.code === 'item_required' ? 'This Moonberry stack is no longer available.'
      : 'This Moonberry could not be shared. Check your collection before trying again.';
    reaction = outcome.kind === 'shared' ? outcome.reaction ?? '' : '';
    phase = 'refreshing';
    const cleared = Boolean(storage && forgetShareIntent(storage, requestedOwner, request));
    confirmedIntent = cleared ? null : request;
    intent = cleared ? null : request; selectedId = ''; notify();
    await refresh(generation);
  }
  async function clearConfirmedRequest() {
    if (isBusy() || !confirmedIntent || !storage) return;
    if (!forgetShareIntent(storage, ownerId, confirmedIntent)) return;
    confirmedIntent = null; intent = null; notify();
    await refresh();
  }
  async function refresh(generation = epoch) {
    if (!mounted) return;
    phase = 'refreshing';
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([onChanged(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('refresh_timeout')), 10_000); })]);
      if (mounted && generation === epoch) phase = intent && !confirmedIntent ? 'uncertain' : 'done';
    } catch {
      if (mounted && generation === epoch) phase = 'refresh-error';
    } finally { clearTimeout(timer); }
  }
</script>

{#if !recoveryOnly || showRecovery}
<section class="moonberry-share" aria-label={recoveryOnly ? 'Recover a Moonberry share' : 'Share a Moonberry'}>
  {#if !recoveryOnly && quantity === 0 && !stockUncertain}<p class="stock-empty">No Moonberries left</p>{/if}
  {#if message || reaction}
    <div class="share-result" role="status"><p>{message}</p>{#if reaction}<p class="reaction">{reaction}</p>{/if}</div>
  {/if}
  {#if phase === 'pending'}
    <p role="status">Checking your share with {intentName}…</p>
    <button type="button" disabled aria-busy="true">Sharing…</button>
    <p class="quiet">Leaving this page won’t cancel a share already sent.</p>
  {:else if phase === 'refreshing'}
    <p role="status">Refreshing your collection…</p>
  {:else if phase === 'refresh-error'}
    <p role="status">Your current quantity couldn’t be refreshed. Refresh before sharing again.</p>
    <button type="button" on:click={() => refresh()}>Refresh collection</button>
  {:else if confirmedIntent}
    <p role="status">This share’s result is confirmed, but this browser couldn’t clear its saved request.</p>
    <button type="button" on:click={clearConfirmedRequest}>Clear saved request</button>
    <p class="quiet">This only clears the saved request in this tab. It won’t send another share.</p>
  {:else if intent}
    <div class="uncertain" role="status">
      <p>A previous Moonberry share is unconfirmed.</p>
      {#if otherStack && !recoveryOnly}
        <p class="quiet">Return to the original Moonberry stack to check it before starting another share.</p>
      {:else}
        {#if recoveryOnly}<p class="quiet">The original stack is no longer available in this collection. This checks only its saved request.</p>{/if}
        <p class="quiet">Check the same share with {intentName}. This may finish the original one-Moonberry share; it won’t start a second one.</p>
        <button type="button" on:click={retry} disabled={!storageReady}>Check same share</button>
      {/if}
      <p class="quiet">Leaving keeps this result unconfirmed. No share is sent automatically.</p>
    </div>
  {:else if !storageReady}
    <p class="quiet" role="status">Sharing is unavailable in this browser session. Try opening Keepsakes in a new tab.</p>
  {:else if !recoveryOnly && quantity > 0}
    {#if companions.length === 0}
      <p class="quiet">An owned companion is needed to share a Moonberry.</p>
    {:else if phase === 'confirm'}
      <div class="confirmation" bind:this={confirmRegion} tabindex="-1" role="group" aria-label="Confirm Moonberry share">
        <p>Share one Moonberry with <strong>{selected?.name}</strong>?</p>
        <p class="quiet">This uses 1 Moonberry from this stack.</p>
        <div class="actions">
          <button type="button" on:click={confirm}>Confirm share</button>
          <button type="button" class="secondary" on:click={cancel}>Cancel</button>
        </div>
      </div>
    {:else}
      <label for={`moonberry-companion-${userItemId}`}>Choose a companion</label>
      <select id={`moonberry-companion-${userItemId}`} bind:value={selectedId}>
        <option value="" disabled>Choose a companion</option>
        {#each companions as companion (companion.id)}<option value={companion.id}>{companion.name}</option>{/each}
      </select>
      <button type="button" bind:this={launchButton} disabled={!selected} on:click={openConfirm}>Share one Moonberry</button>
    {/if}
  {/if}
</section>
{/if}

<style>
  .moonberry-share { display: grid; gap: .6rem; margin-top: .8rem; padding-top: .85rem; border-top: 1px solid rgba(184, 204, 223, .15); color: #e3edf7; font-size: .82rem; line-height: 1.6; }
  p { margin: 0; overflow-wrap: anywhere; }
  label { color: #c5d5e7; font-size: .77rem; }
  button, select { box-sizing: border-box; min-height: 44px; max-width: 100%; border: 1px solid rgba(166, 218, 202, .4); border-radius: .65rem; font: inherit; }
  select { width: 100%; background: #142638; color: #edf7ff; padding: .55rem .65rem; }
  button { width: fit-content; padding: .55rem .8rem; background: #c0e4d5; color: #142b28; font-weight: 650; cursor: pointer; }
  button:hover:not(:disabled) { background: #ddf5e9; }
  button:disabled { opacity: .5; cursor: default; }
  .secondary { color: #dbe8f6; background: transparent; border-color: #637a8f; }
  .secondary:hover:not(:disabled) { background: #263e4e; }
  button:focus-visible, select:focus-visible, .confirmation:focus-visible { outline: 2px solid #a9e8df; outline-offset: 3px; }
  .quiet { color: #adbed0; font-size: .76rem; }
  .confirmation, .uncertain, .share-result { display: grid; gap: .55rem; }
  .confirmation { border-radius: .5rem; }
  .actions { display: flex; gap: .6rem; flex-wrap: wrap; }
  .stock-empty { color: #c2cedd; }
  .reaction { color: #c6e6d8; }
</style>
