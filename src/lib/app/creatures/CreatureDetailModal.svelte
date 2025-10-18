<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
  import { browser } from '$app/environment';
  import { speciesAccent } from '$lib/ui/speciesAccent';
  import { speciesIcon } from '$lib/ui/speciesIcon';
  import Portal from '$lib/ui/Portal.svelte';
  import SpeciesProgress from '$lib/ui/SpeciesProgress.svelte';
  import type { CreatureRow } from '$lib/data/creatures';

  export let creature: CreatureRow | null = null;
  export let open = false;

  const dispatch = createEventDispatcher();

  let modalEl: HTMLElement | null = null;
  let focusable: HTMLElement[] = [];
  let previouslyFocused: HTMLElement | null = null;
  let accent = speciesAccent();
  let Icon: typeof Portal | null = null;
  let label = 'Unknown';

  $: accent = speciesAccent(creature?.species?.key, creature?.species?.name);
  $: ({ Icon, label } = speciesIcon(creature?.species?.key, creature?.species?.name));

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
    modalEl.setAttribute('data-show', 'true');
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
  <Portal target="#modal-root">
    <!-- Backdrop -->
    <button
      type="button"
      class="fixed inset-0 z-[2147483646] bg-black/60 backdrop-blur-md transition-opacity"
      aria-label="Close creature detail"
      on:click={onClose}
      on:keydown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onClose();
        }
      }}
    ></button>

    <!-- Dialog -->
    <div
      bind:this={modalEl}
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cd-title"
      aria-describedby="cd-desc"
      class="fixed z-[2147483647] top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2
             w-[min(92vw,56rem)] max-h-[85vh] overflow-auto
             rounded-2xl border border-white/10 shadow-glass
             bg-glass-radial p-6 backdrop-blur-md
             opacity-0 scale-95 data-[show=true]:opacity-100 data-[show=true]:scale-100
             transition-all duration-200 ease-out"
      data-show={open}
    >
      <!-- Content Grid -->
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-6 items-start w-full max-w-4xl mx-auto">
        <!-- LEFT: Hero image -->
        <div class="relative group rounded-xl overflow-hidden border border-white/10 bg-gradient-to-br from-slate-800/60 to-slate-900/50 shadow-xl">
          <div class="aspect-[4/3] grid place-items-center text-sm text-white/70">
            [ Creature Art Placeholder ]
          </div>
          <div
            class={`absolute inset-0 rounded-xl pointer-events-none blur-2xl opacity-60 transition bg-gradient-to-tr ${accent.glow} group-hover:opacity-90`}
          ></div>
        </div>

        <!-- RIGHT: Details -->
        <div class="space-y-4 text-[15px] leading-relaxed">
          <div class="flex items-start justify-between gap-3">
            <div class="flex items-center gap-3 min-w-0">
              {#if Icon}
                <svelte:component
                  this={Icon}
                  className={`h-6 w-6 flex-shrink-0 ${accent.text ?? 'text-white/80'}`}
                  aria-hidden="true"
                />
              {/if}
              <div class="min-w-0">
                <h2 id="cd-title" class="text-xl font-semibold truncate text-white">
                  {creature.name ?? 'Unnamed'}
                </h2>
                <p class="text-sm text-white/70 truncate">{creature.species?.name ?? label}</p>
              </div>
            </div>
            <span
              class={`text-[11px] px-2 py-1 rounded-full ring-1 transition ${accent.chipBg} ${accent.chipRing} ${accent.text ?? 'text-white/80'}`}
            >
              {creature.bonded ? 'Bonded' : 'Unbonded'}
            </span>
          </div>

          <div class="flex flex-wrap items-center gap-2 text-[12px] text-white/70 opacity-80">
            <span class="truncate">ID: {creature.id.slice(0, 8)}…</span>
            {#if creature.created_at}
              <span aria-hidden="true">•</span>
              <span>{new Date(creature.created_at).toLocaleDateString()}</span>
            {/if}
            {#if creature.alignment}
              <span aria-hidden="true">•</span>
              <span>Alignment: {creature.alignment}</span>
            {/if}
          </div>

          {#if creature.species?.description}
            <p class="text-white/90">{creature.species.description}</p>
          {/if}

          {#if creature.traits && Array.isArray(creature.traits) && creature.traits.length}
            <div class="flex flex-wrap gap-2">
              {#each creature.traits as t}
                <span
                  class={`text-[11px] px-2 py-1 rounded-full ring-1 transition ${accent.chipBg} ${accent.chipRing} ${accent.text ?? 'text-white/80'}`}
                >
                  {t}
                </span>
              {/each}
            </div>
          {/if}

          <SpeciesProgress
            value={Math.random() * 100}
            label="Bond Progress"
            speciesKey={creature?.species?.key}
            speciesName={creature?.species?.name}
            showPercent
          />

          <div class="pt-3 flex justify-end items-center gap-4 border-t border-white/5 mt-6">
            <a class="text-sm font-medium text-violet-300 hover:text-violet-200 transition"
               href={`/app/creatures/${creature.id}`}>
               Open full page →
            </a>
            <button
              class="text-sm text-white/70 hover:text-white transition"
              on:click={onClose}>
              Done
            </button>
          </div>
        </div>
      </div>
    </div>
  </Portal>
{/if}
