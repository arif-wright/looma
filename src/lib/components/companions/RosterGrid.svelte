<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import CompanionCard from './CompanionCard.svelte';
  import type { Companion } from '$lib/stores/companions';

  type RosterReorderDetail = { ids: string[]; via: 'pointer' | 'keyboard' };

  export let companions: Companion[] = [];
  export let maxSlots = 3;
  export let activeId: string | null = null;
  export let disableDrag = false;

  const dispatch = createEventDispatcher<{
    select: { companion: Companion };
    reorder: RosterReorderDetail;
    blocked: { reason: 'max_slots' };
  }>();

let gridEl: HTMLDivElement | null = null;
let sortable: any = null;

const restoreOrder = () => {
  if (!sortable) return;
  const order = companions
    .slice(0, maxSlots)
    .map((companion) => companion.id)
    .filter(Boolean);
  if (order.length) {
    sortable.sort(order);
  }
};

  const initSortable = async () => {
    if (disableDrag || typeof window === 'undefined' || sortable || !gridEl) return;
    const sortableModule = await import('sortablejs');
    const SortableCtor = sortableModule.default ?? sortableModule;
    sortable = SortableCtor.create(gridEl, {
      animation: 160,
      handle: '[data-roster-handle]',
      draggable: '[data-roster-item="true"][data-slot-enabled="true"]',
      ghostClass: 'roster-ghost',
      dragClass: 'roster-dragging',
      onEnd: (evt: any) => {
        const newIndex = typeof evt?.newDraggableIndex === 'number' ? evt.newDraggableIndex : evt?.newIndex;
        if (typeof newIndex === 'number' && newIndex >= maxSlots) {
          restoreOrder();
          dispatch('blocked', { reason: 'max_slots' });
          return;
        }

        const ids = collectOrder();
        if (ids.length) {
          dispatch('reorder', { ids, via: 'pointer' });
        }
      }
    });
  };

  const destroySortable = () => {
    if (sortable) {
      sortable.destroy();
      sortable = null;
    }
  };

  onMount(() => {
    void initSortable();
    return () => destroySortable();
  });

  $: if (disableDrag) {
    destroySortable();
  } else {
    void initSortable();
  }

  const collectOrder = () => {
    if (!gridEl) return [] as string[];
    return Array.from(gridEl.querySelectorAll('[data-roster-item="true"]'))
      .filter((node) => (node as HTMLElement).dataset.slotEnabled === 'true')
      .slice(0, maxSlots)
      .map((node) => (node as HTMLElement).dataset.id)
      .filter((id): id is string => Boolean(id));
  };

  const handleKey = (event: KeyboardEvent, index: number) => {
    if (disableDrag) return;
    if (event.metaKey || event.altKey || event.ctrlKey) return;
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    const delta = event.key === 'ArrowUp' ? -1 : 1;
    if (index < 0 || index >= maxSlots) return;
    const nextIndex = index + delta;
    if (nextIndex < 0 || nextIndex >= Math.min(maxSlots, companions.length)) return;
    event.preventDefault();
    const working = companions.slice(0, maxSlots);
    const temp = working[index];
    const target = working[nextIndex];
    if (!temp || !target) return;
    working[index] = target;
    working[nextIndex] = temp;
    const ids = working.map((companion) => companion.id);
    dispatch('reorder', { ids, via: 'keyboard' });
  };

  const isSlotEnabled = (index: number) => index < maxSlots;
</script>

<div class="roster-grid" bind:this={gridEl}>
  {#if companions.length === 0}
    <p class="roster-empty">No companions yet. Visit the shop to adopt one.</p>
  {:else}
    {#each companions as companion, index (companion.id)}
      <div
        class={`roster-item ${isSlotEnabled(index) ? '' : 'roster-item--locked'}`}
        data-roster-item="true"
        data-id={companion.id}
        data-slot-enabled={isSlotEnabled(index) ? 'true' : 'false'}
        aria-disabled={isSlotEnabled(index) ? 'false' : 'true'}
        title={isSlotEnabled(index) ? undefined : 'Unlock more slots to activate this companion'}
        on:keydown={(event) => handleKey(event as KeyboardEvent, index)}
      >
        <CompanionCard
          {companion}
          compact={true}
          showActions={false}
          context="roster"
          stateLabel={companion.state ?? null}
          slotIndex={typeof companion.slot_index === 'number' ? companion.slot_index : index}
          isActive={activeId === companion.id}
          disabled={!isSlotEnabled(index)}
          on:open={() => dispatch('select', { companion })}
        />
        {#if !isSlotEnabled(index)}
          <span class="slot-locked" aria-live="polite">Unlock more slots soon</span>
        {/if}
      </div>
    {/each}
  {/if}
</div>

<style>
  .roster-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 1.5rem;
  }

  .roster-item {
    position: relative;
  }

  .roster-item--locked {
    opacity: 0.55;
    pointer-events: none;
  }

  .slot-locked {
    position: absolute;
    top: 10px;
    right: 16px;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.65);
  }

  .roster-empty {
    grid-column: 1 / -1;
    padding: 2rem;
    border-radius: 18px;
    border: 1px dashed rgba(255, 255, 255, 0.2);
    text-align: center;
    color: rgba(255, 255, 255, 0.7);
  }

  .roster-ghost {
    opacity: 0.45 !important;
  }

  .roster-dragging {
    cursor: grabbing;
  }

  @media (max-width: 900px) {
    .roster-grid {
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1rem;
    }
  }

  @media (max-width: 600px) {
    .roster-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
