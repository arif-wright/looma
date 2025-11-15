<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import type { CompanionRitual } from '$lib/companions/rituals';

  export let rituals: CompanionRitual[] = [];
  export let emptyCopy = 'Pick an active companion to start daily rituals.';

  let reduceMotion = false;
  let highlightKeys = new Set<string>();
  const highlightTimers = new Map<string, ReturnType<typeof setTimeout>>();
  let previousStatuses = new Map<string, CompanionRitual['status']>();

  const setReduceMotion = (next: boolean) => {
    reduceMotion = next;
  };

  onMount(() => {
    if (typeof window === 'undefined') return;
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduceMotion(media.matches);
    const listener = (event: MediaQueryListEvent) => setReduceMotion(event.matches);
    media.addEventListener?.('change', listener);
    return () => {
      media.removeEventListener?.('change', listener);
    };
  });

  const triggerHighlight = (key: string) => {
    if (highlightTimers.has(key)) {
      const existing = highlightTimers.get(key);
      if (existing) clearTimeout(existing);
    }
    highlightKeys = new Set(highlightKeys).add(key);
    const timeout = setTimeout(() => {
      highlightTimers.delete(key);
      const next = new Set(highlightKeys);
      next.delete(key);
      highlightKeys = next;
    }, reduceMotion ? 2600 : 900);
    highlightTimers.set(key, timeout);
  };

  onDestroy(() => {
    highlightTimers.forEach((timer) => clearTimeout(timer));
    highlightTimers.clear();
  });

  $: {
    const nextStatuses = new Map<string, CompanionRitual['status']>();
    const newlyCompleted: string[] = [];
    for (const ritual of rituals) {
      nextStatuses.set(ritual.key, ritual.status);
      const prevStatus = previousStatuses.get(ritual.key);
      if (prevStatus && prevStatus !== 'completed' && ritual.status === 'completed') {
        newlyCompleted.push(ritual.key);
      }
    }
    previousStatuses = nextStatuses;
    newlyCompleted.forEach((key) => triggerHighlight(key));
  }
</script>

{#if rituals.length === 0}
  <p class="rituals__empty">{emptyCopy}</p>
{:else}
  <ul class="rituals">
    {#each rituals as ritual}
      <li class={`ritual ${ritual.status} ${highlightKeys.has(ritual.key) ? 'ritual--flash' : ''}`.trim()}>
        <div class="ritual__meta">
          <div>
            <p class="ritual__title">{ritual.title}</p>
            <p class="ritual__desc">{ritual.description}</p>
          </div>
          <span class="ritual__progress">{ritual.progress}/{ritual.progressMax}</span>
        </div>
        <div class="ritual__status">
          {#if ritual.status === 'completed'}
            <span class="ritual__badge">Done</span>
          {:else if ritual.status === 'in_progress'}
            <span class="ritual__badge ritual__badge--progress">In progress</span>
          {:else}
            <span class="ritual__badge ritual__badge--pending">Locked</span>
          {/if}
          <span class="ritual__rewards">+{ritual.xpReward} XP · +{ritual.shardReward} shards</span>
        </div>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .rituals {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.75rem;
  }

  .ritual {
    border-radius: 1rem;
    border: 1px solid rgba(255, 255, 255, 0.08);
    padding: 0.75rem 0.85rem;
    background: rgba(255, 255, 255, 0.02);
  }

  .ritual--flash {
    animation: ritualGlow 0.5s ease;
    box-shadow: 0 0 0 rgba(147, 197, 253, 0.35);
  }

  .ritual.completed {
    border-color: rgba(147, 197, 253, 0.4);
    background: rgba(147, 197, 253, 0.08);
  }

  .ritual__meta {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    align-items: flex-start;
  }

  .ritual__title {
    margin: 0;
    font-weight: 600;
    color: rgba(255, 255, 255, 0.95);
  }

  .ritual__desc {
    margin: 0.15rem 0 0;
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .ritual__progress {
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    color: rgba(255, 255, 255, 0.75);
  }

  .ritual__status {
    margin-top: 0.5rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.8rem;
  }

  .ritual__badge {
    border-radius: 999px;
    padding: 0.2rem 0.8rem;
    font-size: 0.72rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    border: 1px solid rgba(94, 234, 212, 0.4);
    color: rgba(94, 234, 212, 0.95);
  }

  .ritual__badge--pending {
    border-color: rgba(148, 163, 184, 0.4);
    color: rgba(148, 163, 184, 0.85);
  }

  .ritual__badge--progress {
    border-color: rgba(250, 204, 21, 0.5);
    color: rgba(250, 204, 21, 0.95);
  }

  .ritual__rewards {
    color: rgba(255, 255, 255, 0.65);
  }

  .rituals__empty {
    margin: 0;
    font-size: 0.9rem;
    color: rgba(255, 255, 255, 0.65);
  }

  @keyframes ritualGlow {
    0% {
      box-shadow: 0 0 0 rgba(147, 197, 253, 0.25);
      background: rgba(147, 197, 253, 0.08);
    }
    50% {
      box-shadow: 0 0 25px rgba(147, 197, 253, 0.25);
      background: rgba(147, 197, 253, 0.16);
    }
    100% {
      box-shadow: 0 0 0 rgba(147, 197, 253, 0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ritual--flash {
      animation: none;
      background: rgba(147, 197, 253, 0.12);
      border-color: rgba(147, 197, 253, 0.5);
    }
  }
</style>
