<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import {
    togglePostReaction,
    toggleCommentReaction,
    type ReactionCounts,
    type ReactionKind,
    ReactionError
  } from '$lib/lib/reactions';

  export let target: { type: 'post' | 'comment'; id: string } | null = null;
  export let postId: string | null = null;
  export let counts: ReactionCounts = { like: 0, cheer: 0, spark: 0 };
  export let states: Record<ReactionKind, boolean> = {
    like: false,
    cheer: false,
    spark: false
  };
  export let disabled = false;

  const dispatch = createEventDispatcher<{
    change: { counts: ReactionCounts; states: Record<ReactionKind, boolean> };
  }>();

  type ToastState = { kind: 'success' | 'error'; message: string } | null;

  let localCounts: ReactionCounts = { ...counts };
  let localStates: Record<ReactionKind, boolean> = { ...states };
  let pending: ReactionKind | null = null;
  let toast: ToastState = null;
  let toastTimer: ReturnType<typeof setTimeout> | null = null;
  let pulseKind: ReactionKind | null = null;

  const motionQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const prefersReducedMotion = motionQuery?.matches ?? false;
  const toggleDelegates = {
    post: togglePostReaction,
    comment: toggleCommentReaction
  } as const;

  $: resolvedTarget = target ?? (postId ? { type: 'post' as const, id: postId } : null);
  $: groupLabel = resolvedTarget?.type === 'comment' ? 'Comment reactions' : 'Post reactions';

  $: if (!pending) {
    localCounts = { ...counts };
    localStates = { ...states };
  }

  onDestroy(() => {
    if (toastTimer) clearTimeout(toastTimer);
  });

  function showToast(next: ToastState, duration = 2600) {
    if (toastTimer) clearTimeout(toastTimer);
    toast = next;
    if (next) {
      toastTimer = setTimeout(() => {
        toast = null;
      }, duration);
    }
  }

  function applyPulse(kind: ReactionKind) {
    if (prefersReducedMotion) return;
    pulseKind = kind;
    setTimeout(() => {
      if (pulseKind === kind) pulseKind = null;
    }, 400);
  }

  async function handleToggle(kind: ReactionKind) {
    if (disabled || pending || !resolvedTarget?.id) return;

    const nextState = !localStates[kind];
    const countsBefore = { ...localCounts };
    const statesBefore = { ...localStates };

    localStates = { ...localStates, [kind]: nextState };
    localCounts = {
      ...localCounts,
      [kind]: Math.max(0, localCounts[kind] + (nextState ? 1 : -1))
    };

    if (nextState) applyPulse(kind);

    pending = kind;

    try {
      const toggle = toggleDelegates[resolvedTarget.type];
      const result = await toggle(resolvedTarget.id, kind);
      localCounts = { ...result.counts };
      localStates = { ...localStates, [kind]: result.toggledOn };
      pending = null;
      dispatch('change', { counts: { ...localCounts }, states: { ...localStates } });

      showToast({ kind: 'success', message: result.toggledOn ? 'Reaction added' : 'Reaction removed' }, 1800);
    } catch (error) {
      localCounts = countsBefore;
      localStates = statesBefore;
      pending = null;

      if (error instanceof ReactionError && error.status === 401) {
        showToast({ kind: 'error', message: 'Please sign in to react.' });
      } else {
        showToast({ kind: 'error', message: 'Unable to update reaction.' });
      }
      console.error('[ReactionBar] toggle failed', error);
    }
  }

  function handleKeydown(event: KeyboardEvent, kind: ReactionKind) {
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      handleToggle(kind);
    }
  }

  const labelMap: Record<ReactionKind, string> = {
    like: 'Like',
    cheer: 'Cheer',
    spark: 'Spark'
  };

  const iconMap: Record<ReactionKind, string> = {
    like: '👍',
    cheer: '🎉',
    spark: '✨'
  };
  const kindOrder: ReactionKind[] = ['like', 'cheer', 'spark'];
</script>

<div
  class="reaction-bar"
  role="group"
  aria-label={groupLabel}
  data-context={resolvedTarget?.type === 'comment' ? 'comment' : undefined}
>
  {#each kindOrder as kind}
    <div class="reaction-group">
      <button
        type="button"
        class={`reaction-btn ${localStates[kind] ? 'is-active' : ''} ${pulseKind === kind ? 'is-pulsing' : ''}`}
        data-testid={`react-${kind}`}
        aria-pressed={localStates[kind] ? 'true' : 'false'}
        aria-label={labelMap[kind]}
        on:click={() => handleToggle(kind)}
        on:keydown={(event) => handleKeydown(event, kind)}
        disabled={disabled || !!pending}
      >
        <span class="reaction-icon" aria-hidden="true">{iconMap[kind]}</span>
        <span class="reaction-label">{labelMap[kind]}</span>
      </button>
      <span class="reaction-count" data-testid={`count-${kind}`} aria-live="polite" aria-label={`${labelMap[kind]} count`}>
        {localCounts[kind]}
      </span>
    </div>
  {/each}

  {#if toast}
    <div
      class={`reaction-toast ${toast.kind}`}
      data-testid={toast.kind === 'success' ? 'toast-success' : 'toast-error'}
      role="status"
      aria-live="polite"
    >
      {toast.message}
    </div>
  {/if}
</div>

<style>
  .reaction-bar {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.75rem;
    padding: 10px 14px;
    border-radius: 999px;
    border: 1px solid rgba(71, 85, 105, 0.4);
    background: rgba(15, 23, 42, 0.35);
  }

  .reaction-group {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .reaction-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 6px 12px;
    border-radius: 999px;
    border: 1px solid transparent;
    background: transparent;
    color: rgba(226, 232, 240, 0.88);
    font-size: 0.85rem;
    font-weight: 600;
    cursor: pointer;
    transition: border-color 0.2s ease, background 0.2s ease, color 0.2s ease, transform 0.2s ease;
  }

  .reaction-btn:hover:not(:disabled),
  .reaction-btn:focus-visible {
    border-color: rgba(148, 163, 184, 0.4);
    background: rgba(51, 65, 85, 0.35);
  }

  .reaction-btn:disabled {
    opacity: 0.6;
    cursor: progress;
  }

  .reaction-btn.is-active {
    border-color: rgba(56, 189, 248, 0.45);
    background: rgba(56, 189, 248, 0.18);
    color: rgba(240, 249, 255, 0.96);
  }

  .reaction-btn.is-pulsing {
    animation: pulse 0.35s ease-out;
  }

  .reaction-icon {
    font-size: 1rem;
  }

  .reaction-count {
    font-variant-numeric: tabular-nums;
    font-size: 0.8rem;
    color: rgba(148, 163, 184, 0.9);
  }

  .reaction-toast {
    grid-column: 1 / -1;
    justify-self: start;
    margin-top: 6px;
    font-size: 0.78rem;
    padding: 4px 10px;
    border-radius: 8px;
    background: rgba(30, 41, 59, 0.85);
    color: rgba(241, 245, 249, 0.95);
  }

  .reaction-toast.success {
    border: 1px solid rgba(34, 197, 94, 0.4);
  }

  .reaction-toast.error {
    border: 1px solid rgba(248, 113, 113, 0.4);
  }

  @keyframes pulse {
    0% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.05);
    }
    100% {
      transform: scale(1);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .reaction-btn,
    .reaction-btn:hover,
    .reaction-btn:focus-visible {
      transition: none;
    }
    .reaction-btn.is-pulsing {
      animation: none;
    }
  }

  @media (max-width: 640px) {
    .reaction-bar {
      gap: 0.5rem;
      padding: 8px 12px;
    }
    .reaction-btn {
      padding: 5px 10px;
      font-size: 0.8rem;
    }
    .reaction-icon {
      font-size: 0.9rem;
    }
  }
</style>
