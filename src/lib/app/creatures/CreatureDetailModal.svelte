<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher, tick } from 'svelte';
  import { browser } from '$app/environment';
  import Portal from '$lib/ui/Portal.svelte';
  import type { CreatureRow } from '$lib/data/creatures';

  export let creature: CreatureRow | null = null;
  export let open = false;

  const dispatch = createEventDispatcher();

  let modalEl: HTMLElement | null = null;
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
  <Portal>
    <button
      type="button"
      on:click={onClose}
      aria-label="Close creature detail"
      style="position:fixed;inset:0;z-index:2147483646;background:rgba(0,0,0,0.6);backdrop-filter:blur(12px);"
    ></button>

    <section
      bind:this={modalEl}
      tabindex="-1"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cd-title"
      aria-describedby="cd-desc"
      style="position:fixed;z-index:2147483647;top:50%;left:50%;transform:translate(-50%,-50%) scale(1);
             width:min(92vw,56rem);max-width:56rem;max-height:85vh;overflow:auto;opacity:1;
             border-radius:16px;border:1px solid rgba(255,255,255,0.12);
             background:radial-gradient(120% 120% at 0% 0%,rgba(255,255,255,0.12),rgba(255,255,255,0.05) 40%,rgba(255,255,255,0.03) 70%);
             box-shadow:0 24px 48px rgba(0,0,0,0.55);"
      class="relative mx-auto mt-[10vh] overflow-hidden ring-1 ring-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.45)] transition-transform duration-200 ease-out will-change-transform scale-95 opacity-0 data-[show=true]:scale-100 data-[show=true]:opacity-100 bg-gradient-to-b from-slate-900/95 to-slate-950/90 border border-white/10 shadow-[0_0_40px_rgba(0,0,0,0.7)] backdrop-blur-xl transition-all duration-300 ease-out"
    >
      <!-- Card header strip (subtle glow) -->
      <div class="pointer-events-none absolute -inset-px rounded-2xl ring-1 ring-white/10"></div>

      <header class="px-6 pt-6 pb-3 bg-white/3 rounded-t-2xl backdrop-blur-[2px] border-b border-white/10">
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-center gap-3 min-w-0">
            <div class="h-10 w-10 rounded-full bg-white/10 grid place-items-center text-lg shadow-inner">✨</div>
            <div class="min-w-0">
              <h2 id="cd-title" class="text-xl font-semibold leading-tight truncate">
                {creature.name ?? 'Unnamed'}
              </h2>
              <div class="text-sm opacity-75 truncate">{creature.species?.name ?? 'Unknown species'}</div>
            </div>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <span class="text-[11px] px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20">
              {creature.bonded ? 'Bonded' : 'Unbonded'}
            </span>
            <button class="h-8 w-8 grid place-items-center rounded-full hover:bg-white/10 transition" aria-label="Close detail" on:click={onClose}>
              ✕
            </button>
          </div>
        </div>
      </header>

      <!-- Body: image left, details right (stacks on mobile) -->
      <div class="px-6 pb-6">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-8 items-start w-full max-w-none mx-auto">
          <!-- LEFT: Hero image / art -->
          <div class="relative group aspect-[4/3] grid place-items-center rounded-xl overflow-hidden border border-white/10 bg-gradient-to-br from-slate-800/50 to-slate-900/50 shadow-xl transition-transform duration-300 group-hover:scale-[1.02]">
            <div class="text-sm opacity-80 tracking-wide">[ Creature Art Placeholder ]</div>
            <div class="absolute inset-0 rounded-xl bg-gradient-to-tr from-cyan-400/20 via-fuchsia-400/15 to-violet-400/20 blur-2xl opacity-50 group-hover:opacity-90 transition-all pointer-events-none"></div>
          </div>

          <!-- RIGHT: Key facts, description, chips, actions -->
          <div class="space-y-4 min-w-0 text-[15px] leading-relaxed">
            <!-- Meta row -->
            <div class="flex flex-wrap items-center gap-2 text-[12px] opacity-80" id="cd-desc">
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

            <!-- Description (primary text block) -->
            {#if creature.species?.description}
              <p class="text-[15px] leading-relaxed opacity-90">
                {creature.species.description}
              </p>
            {/if}

            <!-- Trait chips -->
            {#if creature.traits && Array.isArray(creature.traits) && creature.traits.length}
              <div class="flex flex-wrap gap-2">
                {#each creature.traits as t}
                  <span class="text-[11px] px-2 py-1 rounded-full bg-white/10 ring-1 ring-white/10">{String(t)}</span>
                {/each}
              </div>
            {/if}

            <!-- Actions -->
            <div class="pt-2 flex justify-end items-center gap-4 border-t border-white/5 mt-4">
              <a class="text-sm font-medium text-violet-300 hover:text-violet-200 transition" href={`/app/creatures/${creature.id}`}>Open full page →</a>
              <button class="text-sm text-white/70 hover:text-white transition" on:click={onClose}>Done</button>
            </div>
          </div>
        </div>
      </div>
    </section>
  </Portal>
{/if}
