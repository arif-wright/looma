<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
  import { browser } from '$app/environment';
  import Portal from '$lib/ui/Portal.svelte';
  import type { CreatureRow } from '$lib/data/creatures';

  export let creature: CreatureRow | null = null;
  export let open = false;

  const dispatch = createEventDispatcher();

  let modalEl: HTMLDivElement | null = null;
  let focusable: HTMLElement[] = [];
  let previouslyFocused: HTMLElement | null = null;

  function onClose() {
    dispatch('close');
  }

  function trapFocus(event: KeyboardEvent) {
    if (!open) return;
    if (focusable.length === 0) {
      event.preventDefault();
      modalEl?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement as HTMLElement | null;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function onKey(event: KeyboardEvent) {
    if (!open) return;
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (event.key === 'Tab') {
      trapFocus(event);
    }
  }

  async function focusModal() {
    if (!browser) return;
    await tick();
    if (!open || !modalEl) return;
    focusable = Array.from(
      modalEl.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      )
    );
    if (focusable.length) {
      focusable[0].focus();
    } else {
      modalEl.focus();
    }
  }

  $: if (browser) {
    if (open) {
      previouslyFocused = (document.activeElement as HTMLElement | null) ?? previouslyFocused;
      document.body.classList.add('modal-open');
      focusModal();
    } else {
      document.body.classList.remove('modal-open');
      focusable = [];
      previouslyFocused?.focus?.();
      previouslyFocused = null;
    }
  }

  onMount(() => {
    if (!browser) return;
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.body.classList.remove('modal-open');
    };
  });

  onDestroy(() => {
    if (!browser) return;
    document.body.classList.remove('modal-open');
  });
</script>

{#if browser && open && creature}
  <Portal target="body">
    <button
      type="button"
      class="fixed inset-0 z-[5000] bg-black/60 backdrop-blur-sm"
      aria-label="Close creature detail"
      on:click={onClose}
    ></button>

    <div
      bind:this={modalEl}
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cd-title"
      aria-describedby="cd-desc"
      class="fixed z-[5001] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
             w-[min(92vw,40rem)] max-h-[85vh] overflow-auto
             rounded-2xl border border-white/10
             bg-gradient-to-b from-white/[0.08] to-white/[0.04] shadow-2xl outline-none
             opacity-0 scale-95 data-[show=true]:opacity-100 data-[show=true]:scale-100 transition-all duration-200 ease-out"
      data-show={open}
    >
      <div class="p-4 border-b border-white/10 flex items-center justify-between gap-4">
        <div class="min-w-0">
          <h2 id="cd-title" class="text-base font-semibold truncate">
            {creature.name ?? 'Unnamed'} <span class="opacity-70 text-sm">({creature.species?.name ?? 'Unknown'})</span>
          </h2>
          <p id="cd-desc" class="text-xs opacity-70 truncate">
            Bonded: {creature.bonded ? 'Yes' : 'No'} · ID: {creature.id.slice(0, 8)}…
          </p>
        </div>
        <button class="text-sm underline opacity-80 hover:opacity-100" on:click={onClose}>Close</button>
      </div>

      <div class="p-4 space-y-4">
        {#if creature.species?.description}
          <div class="text-sm opacity-85 leading-relaxed">{creature.species.description}</div>
        {/if}

        <div class="flex flex-wrap gap-2">
          {#if creature.alignment}
            <span class="text-[11px] px-2 py-1 rounded-full bg-white/10 ring-1 ring-white/10">Alignment: {creature.alignment}</span>
          {/if}
          <span class="text-[11px] px-2 py-1 rounded-full bg-white/10 ring-1 ring-white/10">Bonded: {creature.bonded ? 'Yes' : 'No'}</span>
          {#if creature.traits && Array.isArray(creature.traits) && creature.traits.length}
            {#each creature.traits as t}
              <span class="text-[11px] px-2 py-1 rounded-full bg-white/10 ring-1 ring-white/10">{String(t)}</span>
            {/each}
          {/if}
        </div>

        <div class="h-44 rounded-xl bg-white/5 grid place-items-center">[ Creature Art Placeholder ]</div>

        <div class="flex items-center justify-end gap-3">
          <a class="text-xs underline opacity-80 hover:opacity-100" href={`/app/creatures/${creature.id}`}>Open full page</a>
          <button class="text-xs underline opacity-80 hover:opacity-100" on:click={onClose}>Done</button>
        </div>
      </div>
    </div>
  </Portal>
{/if}
