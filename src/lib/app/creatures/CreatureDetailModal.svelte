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
    if (!open || focusable.length === 0) return;
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
    } else if (event.key === 'Tab') {
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
    (focusable[0] ?? modalEl).focus();
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
  <Portal>
    <button
      type="button"
      on:click={onClose}
      aria-label="Close creature detail"
      style="position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,0.6);backdrop-filter:blur(12px);"
    ></button>

    <div
      bind:this={modalEl}
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cd-title"
      aria-describedby="cd-desc"
      style="position:fixed;z-index:2147483647;top:50%;left:50%;transform:translate(-50%,-50%);
             width:min(92vw,42rem);max-height:85vh;overflow:auto;
             border-radius:16px;border:1px solid rgba(255,255,255,0.12);
             background:radial-gradient(120% 120% at 0% 0%,rgba(255,255,255,0.12),rgba(255,255,255,0.05) 40%,rgba(255,255,255,0.03) 70%);
             box-shadow:0 24px 48px rgba(0,0,0,0.55);"
    >
      <header class="sticky top-0 z-10 bg-white/8 backdrop-blur-sm border-b border-white/10 p-4 flex items-center justify-between gap-4 rounded-t-2xl">
        <div class="min-w-0">
          <h2 id="cd-title" class="text-base font-semibold truncate">
            {creature.name ?? 'Unnamed'} <span class="opacity-70 text-sm">({creature.species?.name ?? 'Unknown'})</span>
          </h2>
          <p id="cd-desc" class="text-xs opacity-70 truncate">
            Bonded: {creature.bonded ? 'Yes' : 'No'} · ID: {creature.id.slice(0, 8)}…
          </p>
        </div>
        <button class="text-sm underline opacity-80 hover:opacity-100" on:click={onClose}>Close</button>
      </header>

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
