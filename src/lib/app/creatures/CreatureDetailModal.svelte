<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
  import Portal from '$lib/ui/Portal.svelte';
  import type { CreatureRow } from '$lib/data/creatures';

  export let creature: CreatureRow | null = null;
  export let open = false;

  const dispatch = createEventDispatcher();

  function onClose() {
    dispatch('close');
  }

  let modalEl: HTMLDivElement | null = null;
  let focusable: HTMLElement[] = [];
  let previouslyFocused: HTMLElement | null = null;
  let show = false;
  let scrollLocked = false;
  let storedOverflow = '';

  function lockScroll(state: boolean) {
    if (state && !scrollLocked) {
      storedOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      scrollLocked = true;
    } else if (!state && scrollLocked) {
      document.body.style.overflow = storedOverflow;
      scrollLocked = false;
    }
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

  function handleKey(event: KeyboardEvent) {
    if (!open) return;
    if (event.key === 'Escape') {
      onClose();
      return;
    }
    if (event.key === 'Tab') {
      trapFocus(event);
    }
  }

  async function activateModal() {
    await tick();
    if (!open || !modalEl) return;
    focusable = Array.from(
      modalEl.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      )
    );
    show = true;
    if (focusable.length) {
      focusable[0].focus();
    } else {
      modalEl.focus();
    }
  }

  $: if (open) {
    previouslyFocused = (document.activeElement as HTMLElement | null) ?? previouslyFocused;
    lockScroll(true);
    show = false;
    activateModal();
  } else {
    if (scrollLocked) lockScroll(false);
    show = false;
    previouslyFocused?.focus?.();
  }

  onMount(() => {
    document.addEventListener('keydown', handleKey, true);
    return () => {
      document.removeEventListener('keydown', handleKey, true);
      lockScroll(false);
    };
  });

  onDestroy(() => {
    lockScroll(false);
  });
</script>

{#if open && creature}
  <Portal target="body">
    <div
      class="fixed inset-0 z-[1200] grid place-items-center p-4"
      aria-modal="true"
      role="dialog"
      aria-labelledby="cd-title"
      aria-describedby="cd-desc"
    >
      <button
        type="button"
        class="absolute inset-0 bg-black/60 backdrop-blur-sm"
        on:click={onClose}
        aria-label="Close creature detail"
      ></button>
      <div
        bind:this={modalEl}
        tabindex="-1"
        class={`relative w-full max-w-lg rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.08] to-white/[0.04] shadow-2xl outline-none transition-all duration-200 ease-out ${
          show ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`}
      >
        <div class="p-4 border-b border-white/10 flex items-center justify-between">
          <div class="flex items-center gap-3">
          <div class="h-10 w-10 rounded-full bg-white/10 grid place-items-center">✨</div>
          <div>
            <h2 id="cd-title" class="text-base font-semibold leading-none">
              {creature.name ?? 'Unnamed'} <span class="opacity-70 text-sm">({creature.species?.name ?? 'Unknown'})</span>
            </h2>
            <p id="cd-desc" class="text-xs opacity-70">Bonded: {creature.bonded ? 'Yes' : 'No'} · ID: {creature.id.slice(0, 8)}…</p>
          </div>
        </div>
        <button class="text-sm opacity-80 hover:opacity-100 underline" on:click={onClose}>Close</button>
      </div>

      <div class="p-4 space-y-4">
        {#if creature.species?.description}
          <div class="text-sm opacity-85 leading-relaxed">{creature.species.description}</div>
        {/if}

        <div class="flex flex-wrap gap-2">
          {#if creature.alignment}
            <span class="chip">Alignment: {creature.alignment}</span>
          {/if}
          <span class="chip">Bonded: {creature.bonded ? 'Yes' : 'No'}</span>
          {#if creature.traits && Array.isArray(creature.traits) && creature.traits.length}
            {#each creature.traits as t}
              <span class="chip">{String(t)}</span>
            {/each}
          {/if}
        </div>

        <div class="h-40 rounded-xl bg-white/5 grid place-items-center">[ Creature Art Placeholder ]</div>

        <div class="flex items-center justify-end gap-3 pt-2">
          <a
            class="text-xs opacity-80 hover:opacity-100 underline"
            href={`/app/creatures/${creature.id}`}
          >
            Open full page
          </a>
          <button class="text-xs opacity-80 hover:opacity-100 underline" on:click={onClose}>Done</button>
        </div>
      </div>
    </div>
    </div>
  </Portal>
{/if}

<style>
  .chip {
    font-size: 0.7rem;
    padding: 0.25rem 0.6rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.12);
  }
</style>
