<script lang="ts">
  import { invalidateAll } from '$app/navigation';
  import { page } from '$app/stores';
  import { Armchair, Flower2, LampDesk, Sparkles, Waves, Wind } from 'lucide-svelte';
  import SanctuaryPageFrame from '$lib/components/ui/sanctuary/SanctuaryPageFrame.svelte';
  import EmotionalChip from '$lib/components/ui/sanctuary/EmotionalChip.svelte';
  import type { PageData } from './$types';
  import type { SanctuaryDecor, SanctuarySlot } from '$lib/sanctuary';

  export let data: PageData;

  type Placement = {
    id: string;
    slot_key: SanctuarySlot;
    item:
      | (SanctuaryDecor & { item_key?: string; capabilities?: string[] })
      | (SanctuaryDecor & { item_key?: string; capabilities?: string[] })[]
      | null;
  };
  type OwnedItem = {
    id: string;
    source_type: string;
    source_key: string | null;
    provenance_json: Record<string, unknown> | null;
    acquired_at: string;
    item: (SanctuaryDecor & { item_key?: string }) | (SanctuaryDecor & { item_key?: string })[] | null;
  };

  const slots: Array<{ key: SanctuarySlot; label: string }> = [
    { key: 'left_grove', label: 'Left grove' },
    { key: 'center_glade', label: 'Center glade' },
    { key: 'right_grove', label: 'Right grove' },
    { key: 'near_left', label: 'Near left' },
    { key: 'near_right', label: 'Near right' }
  ];

  const normalizedOwnedItems = (data.items as unknown as OwnedItem[]).map((owned) => ({
    ...owned,
    item: Array.isArray(owned.item) ? owned.item[0] ?? null : owned.item
  }));
  let selectedItemId: string | null = normalizedOwnedItems[0]?.item?.id ?? null;
  let savingSlot: SanctuarySlot | null = null;
  let interactionPending = false;
  let reaction = data.latestReaction?.body ?? null;
  let restMemory: { id: string; title: string } | null = null;
  let restAvailable = Boolean(data.restAvailable);
  let nextRestAvailableAt = data.nextRestAvailableAt ?? null;
  let status: string | null = null;
  let appliedRequestedItem: string | null = null;

  const normalizeItem = (value: Placement['item']) => (Array.isArray(value) ? value[0] ?? null : value);
  const placementFor = (slot: SanctuarySlot) =>
    (data.placements as unknown as Placement[]).find((placement) => placement.slot_key === slot) ?? null;
  const selectedItem = () => normalizedOwnedItems.find((owned) => owned.item?.id === selectedItemId) ?? null;
  $: requestedItem = $page.url.searchParams.get('item');
  $: if (requestedItem && requestedItem !== appliedRequestedItem) {
    const requestedOwnedItem = normalizedOwnedItems.find(
      (owned) => owned.item?.id === requestedItem || owned.item?.item_key === requestedItem
    );
    if (requestedOwnedItem?.item) {
      selectedItemId = requestedOwnedItem.item.id;
      status = `${requestedOwnedItem.item.title} selected. Choose a space.`;
    }
    appliedRequestedItem = requestedItem;
  }
  $: mossSeatPlacement = (data.placements as unknown as Placement[]).find((placement) => {
    const item = normalizeItem(placement.item);
    return item?.item_key === 'care-moss-seat' && item.capabilities?.includes('interactive');
  }) ?? null;

  const iconFor = (visualKey: string) => {
    if (visualKey === 'lantern') return LampDesk;
    if (visualKey === 'moss_seat') return Armchair;
    if (visualKey === 'memory_bloom') return Flower2;
    if (visualKey === 'starglass_pool') return Waves;
    if (visualKey === 'whisper_chimes') return Wind;
    return Sparkles;
  };

  const updateSlot = async (slot: SanctuarySlot, clear = false) => {
    if (savingSlot || (!clear && !selectedItemId)) return;
    savingSlot = slot;
    status = clear ? 'Making space...' : 'Changing the sanctuary...';
    try {
      const response = await fetch('/api/sanctuary/placement', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slot, itemId: selectedItemId, clear })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        status = payload?.error === 'item_not_placeable' ? 'That item cannot be placed here.' : 'The sanctuary could not be changed.';
        return;
      }
      reaction = payload?.reaction ?? reaction;
      status = clear ? 'Space cleared.' : 'The sanctuary remembers this change.';
      await invalidateAll();
    } catch {
      status = 'The sanctuary could not be changed.';
    } finally {
      savingSlot = null;
    }
  };

  const restTogether = async () => {
    if (interactionPending || !mossSeatPlacement) return;
    interactionPending = true;
    status = `Settling in with ${data.companion?.name ?? 'your companion'}...`;
    try {
      const response = await fetch('/api/sanctuary/interact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'shared_rest' })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        status =
          payload?.message ??
          (payload?.error === 'moss_seat_must_be_placed'
            ? 'Place the Moss Seat before resting together.'
            : 'This quiet moment is not available right now.');
        return;
      }
      reaction = payload.reaction ?? reaction;
      restMemory = payload.memory?.id ? { id: payload.memory.id, title: payload.memory.title } : null;
      restAvailable = false;
      nextRestAvailableAt = payload.nextAvailableAt ?? null;
      status = payload.restoredEnergy > 0
        ? `${payload.restoredEnergy} spark restored. ${restMemory ? 'This rest is now in your Journal.' : 'The rest was completed, but the Journal could not hold it.'}`
        : restMemory
          ? 'The quiet itself became a remembered moment.'
          : 'The quiet moment was completed.';
      await invalidateAll();
    } catch {
      status = 'This quiet moment could not be completed.';
    } finally {
      interactionPending = false;
    }
  };
</script>

<svelte:head>
  <title>Personal Sanctuary | Memvoya</title>
</svelte:head>

<SanctuaryPageFrame
  eyebrow="Personal sanctuary"
  title={data.companion ? `${data.companion.name}'s home with you` : 'Your personal sanctuary'}
  subtitle="Shape one small place together. Your companion will remember what you change."
  class="sanctuary-builder"
>
  <svelte:fragment slot="actions">
    <EmotionalChip tone="warm">{data.placements.length} / {slots.length} spaces shaped</EmotionalChip>
    <a class="journal-link" href="/app/memory">Open journal</a>
  </svelte:fragment>

  <main class="builder-shell">
    {#if data.error}
      <section class="notice notice--error">
        <strong>Sanctuary unavailable</strong>
        <span>The sanctuary foundation may still need its database migration.</span>
      </section>
    {/if}

    <section class="scene-card" aria-label="Personal sanctuary preview">
      <div class="sky" aria-hidden="true"></div>
      <div class="horizon" aria-hidden="true"></div>
      <div class="ground" aria-hidden="true"></div>

      {#each slots as slot}
        {@const placement = placementFor(slot.key)}
        {@const placedDecor = normalizeItem(placement?.item ?? null)}
        <button
          class:occupied={Boolean(placedDecor)}
          class:saving={savingSlot === slot.key}
          class={`scene-slot scene-slot--${slot.key}`}
          type="button"
          aria-label={placedDecor ? `${slot.label}: ${placedDecor.title}. Replace with selected decoration.` : `${slot.label}. Place selected decoration.`}
          on:click={() => updateSlot(slot.key)}
        >
          {#if placedDecor}
            <svelte:component this={iconFor(placedDecor.visual_key)} size={30} strokeWidth={1.7} />
            <span>{placedDecor.title}</span>
          {:else}
            <i aria-hidden="true">+</i>
            <span>{slot.label}</span>
          {/if}
        </button>
      {/each}

      <div class="companion-presence" aria-label={data.companion ? `${data.companion.name} is in the sanctuary` : 'Companion space'}>
        {#if data.companion?.avatar_url}
          <img src={data.companion.avatar_url} alt={data.companion.name} />
        {:else}
          <div class="companion-orb" aria-hidden="true"><Sparkles size={38} /></div>
        {/if}
        <strong>{data.companion?.name ?? 'Your companion'}</strong>
        <span>{data.companion?.mood ? `Feeling ${data.companion.mood}` : 'Watching the sanctuary take shape'}</span>
      </div>
    </section>

    <section class="reaction-card" aria-live="polite">
      <div>
        <span class="reaction-label">{mossSeatPlacement ? 'A shared ritual' : 'Companion response'}</span>
        <p>{reaction ?? `${data.companion?.name ?? 'Your companion'} is waiting to see what you place first.`}</p>
        {#if status}<small>{status}</small>{/if}
        {#if restMemory}
          <a class="rest-memory-link" href="/app/memory">Revisit “{restMemory.title}” in your Journal</a>
        {:else if mossSeatPlacement && !restAvailable && nextRestAvailableAt}
          <small>The Moss Seat is holding your last quiet moment. Rest together again after {new Date(nextRestAvailableAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.</small>
        {:else if mossSeatPlacement}
          <small>Rest together to restore spark and create a durable Journal memory.</small>
        {/if}
      </div>
      {#if mossSeatPlacement && restAvailable}
        <button type="button" disabled={interactionPending} on:click={restTogether}>
          <Armchair size={18} />
          <span>{interactionPending ? 'Resting...' : 'Rest Together'}</span>
        </button>
      {/if}
    </section>

    <section class="decor-panel" aria-labelledby="decor-title">
      <header>
        <div>
          <span>Owned collection</span>
          <h2 id="decor-title">Place something you earned together</h2>
        </div>
        <p>Select a decoration, then choose a space in the sanctuary.</p>
      </header>

      {#if normalizedOwnedItems.length > 0}
      <div class="decor-grid">
        {#each normalizedOwnedItems as owned}
          {@const decor = owned.item}
          {#if decor}
          {@const DecorIcon = iconFor(decor.visual_key)}
          <button
            class:selected={selectedItemId === decor.id}
            type="button"
            aria-pressed={selectedItemId === decor.id}
            on:click={() => (selectedItemId = decor.id)}
          >
            <span class={`decor-art decor-art--${decor.tone}`}><DecorIcon size={25} /></span>
            <strong>{decor.title}</strong>
            <small>{decor.description}</small>
            <em>{owned.source_type === 'care_milestone' ? 'Earned through care' : 'Earned as a chapter keepsake'}</em>
          </button>
          {/if}
        {/each}
      </div>

      {#if selectedItem()}
        <div class="selection-bar">
          <span><strong>{selectedItem()?.item?.title}</strong> selected</span>
          <span>Tap an occupied space to replace it.</span>
        </div>
      {/if}
      {:else}
        <div class="empty-collection">
          <strong>No placeable keepsakes yet</strong>
          <span>Complete three care moments with your companion to earn your first shared object.</span>
          <a href="/app/companions">Care for companion</a>
        </div>
      {/if}
    </section>

    {#if data.placements.length > 0}
      <section class="placed-panel" aria-labelledby="placed-title">
        <h2 id="placed-title">Placed in your sanctuary</h2>
        <div>
          {#each data.placements as placement}
            {@const placedDecor = normalizeItem((placement as unknown as Placement).item)}
            {#if placedDecor}
              <button type="button" disabled={Boolean(savingSlot)} on:click={() => updateSlot((placement as unknown as Placement).slot_key, true)}>
                <span>{placedDecor.title}</span>
                <small>Remove</small>
              </button>
            {/if}
          {/each}
        </div>
      </section>
    {/if}
  </main>
</SanctuaryPageFrame>

<style>
  :global(.sanctuary-builder) {
    min-height: calc(100dvh - 5rem);
  }

  .journal-link {
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 999px;
    padding: 0.55rem 0.85rem;
    color: rgba(247, 244, 255, 0.9);
    text-decoration: none;
    font-size: 0.8rem;
  }

  .rest-memory-link {
    display: inline-flex;
    margin-top: 0.55rem;
    color: rgba(239, 216, 164, 0.94);
    font-size: 0.78rem;
    font-weight: 750;
    text-decoration: none;
  }

  .builder-shell {
    display: grid;
    gap: 1rem;
    padding-bottom: calc(5rem + env(safe-area-inset-bottom));
  }

  .notice,
  .reaction-card,
  .decor-panel,
  .placed-panel {
    border: 1px solid rgba(218, 225, 255, 0.15);
    border-radius: 1.15rem;
    background: rgba(9, 15, 39, 0.56);
    backdrop-filter: blur(18px);
  }

  .notice {
    display: grid;
    gap: 0.2rem;
    padding: 0.85rem 1rem;
  }

  .notice--error {
    border-color: rgba(255, 151, 151, 0.28);
  }

  .scene-card {
    position: relative;
    min-height: clamp(28rem, 62vw, 42rem);
    overflow: hidden;
    border: 1px solid rgba(215, 229, 255, 0.2);
    border-radius: 1.45rem;
    background: #07081c;
    box-shadow: 0 24px 80px rgba(4, 8, 28, 0.42);
  }

  .sky,
  .horizon,
  .ground {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .sky {
    background:
      radial-gradient(circle at 76% 18%, rgba(255, 112, 223, 0.24), transparent 8rem),
      radial-gradient(circle at 22% 20%, rgba(94, 242, 255, 0.2), transparent 14rem),
      linear-gradient(180deg, #111036 0%, #17183e 48%, #17152f 75%, #090b20 100%);
  }

  .horizon {
    top: 38%;
    background:
      radial-gradient(ellipse at 15% 70%, rgba(18, 27, 55, 0.96) 0 25%, transparent 26%),
      radial-gradient(ellipse at 83% 72%, rgba(24, 31, 64, 0.94) 0 27%, transparent 28%),
      radial-gradient(ellipse at 53% 85%, rgba(44, 37, 82, 0.76) 0 28%, transparent 29%);
  }

  .ground {
    top: 57%;
    background:
      radial-gradient(ellipse at 50% 10%, rgba(96, 112, 166, 0.48), transparent 42%),
      linear-gradient(180deg, rgba(31, 39, 78, 0.9), #0a1029);
  }

  .scene-slot {
    position: absolute;
    z-index: 4;
    display: grid;
    min-width: 7rem;
    min-height: 5.8rem;
    place-items: center;
    gap: 0.25rem;
    border: 1px dashed rgba(236, 244, 255, 0.3);
    border-radius: 50%;
    background: rgba(19, 31, 61, 0.25);
    color: rgba(247, 248, 255, 0.86);
    cursor: pointer;
    transition: 160ms ease;
  }

  .scene-slot:hover,
  .scene-slot:focus-visible {
    transform: translateY(-0.2rem);
    border-color: rgba(255, 238, 184, 0.7);
    background: rgba(70, 83, 115, 0.46);
  }

  .scene-slot.occupied {
    border-style: solid;
    background: radial-gradient(circle, rgba(255, 232, 176, 0.22), rgba(20, 38, 58, 0.56));
    box-shadow: 0 0 30px rgba(255, 225, 161, 0.15);
  }

  .scene-slot.saving {
    opacity: 0.55;
  }

  .scene-slot span {
    max-width: 7rem;
    font-size: 0.68rem;
    font-weight: 700;
    text-align: center;
  }

  .scene-slot i {
    font-size: 1.4rem;
    font-style: normal;
  }

  .scene-slot--left_grove { left: 9%; top: 35%; }
  .scene-slot--center_glade { left: 50%; top: 32%; transform: translateX(-50%); }
  .scene-slot--right_grove { right: 9%; top: 35%; }
  .scene-slot--near_left { left: 23%; bottom: 8%; }
  .scene-slot--near_right { right: 23%; bottom: 8%; }
  .scene-slot--center_glade:hover,
  .scene-slot--center_glade:focus-visible { transform: translateX(-50%) translateY(-0.2rem); }

  .companion-presence {
    position: absolute;
    z-index: 5;
    left: 50%;
    bottom: 19%;
    display: grid;
    min-width: 10rem;
    justify-items: center;
    transform: translateX(-50%);
    color: white;
    text-align: center;
    pointer-events: none;
  }

  .companion-presence img,
  .companion-orb {
    width: 6.8rem;
    height: 6.8rem;
    border-radius: 50%;
    object-fit: cover;
    box-shadow: 0 0 46px rgba(151, 233, 255, 0.4);
  }

  .companion-orb {
    display: grid;
    place-items: center;
    background: radial-gradient(circle at 35% 30%, white, #93e8f5 16%, #8d75e7 56%, rgba(58, 35, 118, 0.4) 72%);
  }

  .companion-presence strong {
    margin-top: 0.55rem;
  }

  .companion-presence span {
    margin-top: 0.12rem;
    color: rgba(237, 241, 255, 0.72);
    font-size: 0.7rem;
  }

  .reaction-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    padding: 1rem 1.1rem;
  }

  .reaction-card button {
    display: inline-flex;
    min-height: 2.7rem;
    flex: 0 0 auto;
    align-items: center;
    gap: 0.5rem;
    border: 1px solid rgba(174, 240, 229, 0.38);
    border-radius: 999px;
    background: rgba(111, 203, 194, 0.12);
    padding: 0 0.9rem;
    color: white;
    font: inherit;
    font-size: 0.78rem;
    font-weight: 800;
    cursor: pointer;
  }

  .reaction-card button:disabled {
    opacity: 0.58;
    cursor: wait;
  }

  .reaction-label,
  .decor-panel header span {
    color: rgba(179, 229, 224, 0.78);
    font-size: 0.68rem;
    font-weight: 800;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .reaction-card p {
    margin: 0.35rem 0 0;
    color: rgba(247, 246, 255, 0.92);
    line-height: 1.5;
  }

  .reaction-card small {
    display: block;
    margin-top: 0.45rem;
    color: rgba(207, 217, 242, 0.62);
  }

  .decor-panel,
  .placed-panel {
    padding: 1rem;
  }

  .decor-panel header {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
  }

  .decor-panel h2,
  .placed-panel h2 {
    margin: 0.18rem 0 0;
    color: white;
    font-size: 1.1rem;
  }

  .decor-panel header p {
    max-width: 22rem;
    margin: 0;
    color: rgba(217, 225, 244, 0.68);
    font-size: 0.78rem;
  }

  .decor-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.7rem;
    margin-top: 0.9rem;
  }

  .decor-grid button {
    display: grid;
    justify-items: start;
    gap: 0.32rem;
    border: 1px solid rgba(220, 227, 255, 0.14);
    border-radius: 1rem;
    background: rgba(255, 255, 255, 0.035);
    padding: 0.8rem;
    color: white;
    text-align: left;
  }

  .decor-grid button.selected {
    border-color: rgba(174, 240, 229, 0.58);
    background: rgba(111, 203, 194, 0.12);
    box-shadow: 0 0 0 2px rgba(133, 221, 211, 0.08);
  }

  .decor-art {
    display: grid;
    width: 2.7rem;
    height: 2.7rem;
    place-items: center;
    border-radius: 0.85rem;
    background: rgba(167, 139, 250, 0.18);
  }

  .decor-art--care { color: #fbd38d; }
  .decor-art--memory { color: #dda8ff; }
  .decor-art--play { color: #f9a8d4; }
  .decor-art--wonder { color: #8ce9f1; }
  .decor-art--bond { color: #b7e4c7; }

  .decor-grid small {
    color: rgba(215, 223, 243, 0.62);
    line-height: 1.35;
  }

  .decor-grid em {
    color: rgba(172, 237, 224, 0.74);
    font-size: 0.68rem;
    font-style: normal;
    font-weight: 700;
  }

  .empty-collection {
    display: grid;
    justify-items: start;
    gap: 0.45rem;
    margin-top: 0.9rem;
    border: 1px dashed rgba(220, 227, 255, 0.2);
    border-radius: 1rem;
    padding: 1rem;
    color: rgba(226, 232, 249, 0.76);
  }

  .empty-collection strong {
    color: white;
  }

  .empty-collection a {
    margin-top: 0.3rem;
    border-radius: 999px;
    background: rgba(126, 246, 231, 0.14);
    padding: 0.55rem 0.8rem;
    color: white;
    text-decoration: none;
  }

  .selection-bar {
    display: flex;
    justify-content: space-between;
    gap: 0.6rem;
    margin-top: 0.8rem;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
    padding-top: 0.75rem;
    color: rgba(219, 228, 245, 0.72);
    font-size: 0.75rem;
  }

  .placed-panel > div {
    display: flex;
    flex-wrap: wrap;
    gap: 0.55rem;
    margin-top: 0.75rem;
  }

  .placed-panel button {
    display: flex;
    gap: 0.55rem;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.04);
    padding: 0.58rem 0.75rem;
    color: white;
  }

  .placed-panel small {
    color: rgba(255, 190, 190, 0.74);
  }

  @media (max-width: 760px) {
    .scene-card {
      min-height: 31rem;
    }

    .scene-slot {
      min-width: 5.8rem;
      min-height: 5rem;
    }

    .scene-slot--left_grove { left: 2%; top: 32%; }
    .scene-slot--right_grove { right: 2%; top: 32%; }
    .scene-slot--near_left { left: 5%; bottom: 5%; }
    .scene-slot--near_right { right: 5%; bottom: 5%; }

    .decor-panel header,
    .reaction-card,
    .selection-bar {
      display: grid;
    }

    .decor-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
</style>
