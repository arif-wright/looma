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

    <section
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
      class="ring-1 ring-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
    >
      <header class="sticky top-0 z-10 bg-white/5 backdrop-blur-sm border-b border-white/10 px-5 py-4 rounded-t-2xl">
        <div class="flex items-start justify-between gap-4">
          <div class="flex items-center gap-3 min-w-0">
            <div class="h-10 w-10 rounded-full bg-white/10 grid place-items-center text-lg">✨</div>
            <div class="min-w-0">
              <h2 id="cd-title" class="text-lg font-semibold truncate">
                {creature.name ?? 'Unnamed'}
                <span class="opacity-70 text-sm">({creature.species?.name ?? 'Unknown'})</span>
              </h2>
              <div class="flex flex-wrap items-center gap-2 text-[11px] opacity-75" id="cd-desc">
                <span class="truncate">ID: {creature.id.slice(0, 8)}…</span>
                {#if creature.created_at}
                  <span aria-hidden="true">•</span>
                  <span class="truncate">{new Date(creature.created_at).toLocaleDateString()}</span>
                {/if}
              </div>
            </div>
          </div>

          <div class="flex items-center gap-2 shrink-0">
            <span class="text-[11px] px-2 py-1 rounded-full bg-emerald-500/15 text-emerald-300 ring-1 ring-emerald-400/20">
              {creature.bonded ? 'Bonded' : 'Unbonded'}
            </span>
            <button
              class="h-8 w-8 grid place-items-center rounded-full hover:bg-white/10 transition"
              aria-label="Close creature detail"
              on:click={onClose}
            >
              ✕
            </button>
          </div>
        </div>
      </header>

      <div class="px-5 py-4">
        <p class="sr-only" aria-hidden="true">
          {creature.species?.description ?? 'Creature detail'}
        </p>
        <!-- Responsive body grid -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
          <!-- LEFT: description + chips -->
          <div class="space-y-4 min-w-0">
            {#if creature.species?.description}
              <p class="text-sm leading-relaxed opacity-90">{creature.species.description}</p>
            {/if}

            <div class="flex flex-wrap gap-2">
              {#if creature.alignment}
                <span class="text-[11px] px-2 py-1 rounded-full bg-white/10 ring-1 ring-white/10">
                  Alignment: {creature.alignment}
                </span>
              {/if}
              <span class="text-[11px] px-2 py-1 rounded-full bg-white/10 ring-1 ring-white/10">
                Bonded: {creature.bonded ? 'Yes' : 'No'}
              </span>
              {#if creature.traits && Array.isArray(creature.traits) && creature.traits.length}
                {#each creature.traits as t}
                  <span class="text-[11px] px-2 py-1 rounded-full bg-white/10 ring-1 ring-white/10">{String(t)}</span>
                {/each}
              {/if}
            </div>
          </div>

          <!-- RIGHT: image block -->
          <div class="rounded-xl border border-white/10 bg-white/[0.04] aspect-[4/3] grid place-items-center">
            <div class="text-sm opacity-80">[ Creature Art Placeholder ]</div>
          </div>
        </div>

        <!-- Footer actions -->
        <div class="mt-6 flex items-center justify-end gap-3">
          <a class="text-sm underline opacity-80 hover:opacity-100" href={`/app/creatures/${creature.id}`}>Open full page</a>
          <button class="text-sm underline opacity-80 hover:opacity-100" on:click={onClose}>Done</button>
        </div>
      </div>
    </section>
  </Portal>
{/if}
