<script lang="ts">
  import { onMount } from 'svelte';
  import HomeSanctuaryV1 from '$lib/components/home/HomeSanctuaryV1.svelte';
  import CompanionSheet from '$lib/components/home/CompanionSheet.svelte';
  import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
  import { logEvent } from '$lib/analytics';
  import { computeCompanionEffectiveState } from '$lib/companions/effectiveState';
  import type { PageData } from './$types';

  export let data: PageData;

  const activeCompanion = data.activeCompanion ?? null;

  const activeAsInstance =
    activeCompanion
      ? ({
          id: activeCompanion.id,
          name: activeCompanion.name,
          species: activeCompanion.species ?? 'Muse',
          rarity: 'common',
          level: 1,
          xp: 0,
          affection: activeCompanion.affection ?? 0,
          trust: activeCompanion.trust ?? 0,
          energy: activeCompanion.energy ?? 0,
          mood: activeCompanion.mood ?? 'steady',
          avatar_url: activeCompanion.avatar_url ?? null,
          created_at: new Date().toISOString(),
          updated_at: activeCompanion.updated_at ?? new Date().toISOString(),
          stats: activeCompanion.stats ?? null
        } as any)
      : null;

  $: effective = activeAsInstance ? computeCompanionEffectiveState(activeAsInstance) : null;

  const deriveClosenessState = () => {
    if (!activeCompanion) return 'Near' as const;
    if (effective?.moodKey === 'distant') return 'Distant' as const;
    if (effective?.moodKey === 'radiant') return 'Resonant' as const;
    return 'Near' as const;
  };

  $: closenessState = deriveClosenessState();
  $: companionName = activeCompanion?.name ?? 'Mirae';
  $: companionSpecies = activeCompanion?.species ?? 'Muse';
  $: statusLine =
    closenessState === 'Distant'
      ? `${companionName} feels distant.`
      : closenessState === 'Resonant'
        ? `${companionName} feels deeply connected.`
        : `${companionName} is near.`;

  $: statusReason =
    !data.dailyCheckinToday
      ? `${companionName} hasn't heard from you today.`
      : (effective?.energy ?? activeCompanion?.energy ?? 0) < 35
        ? `${companionName} could use a quick check-in right now.`
        : (data.notificationsUnread ?? 0) > 0
          ? 'You have new moments waiting together.'
          : 'Your bond is steady right now.';

  $: needsReconnectToday = closenessState === 'Distant' || !data.dailyCheckinToday;

  let companionSheetOpen = false;
  let reconnectModalOpen = false;
  let rewardToast: string | null = null;
  let rewardTimer: ReturnType<typeof setTimeout> | null = null;

  const track = (
    kind: 'home_view' | 'primary_action_click' | 'orb_open_sheet',
    meta: Record<string, unknown> = {}
  ) => {
    console.debug('[home]', kind, meta);
    void logEvent(kind, meta);
  };

  const showReward = (copy = "You're connected. +8 XP · +5 Energy") => {
    rewardToast = copy;
    if (rewardTimer) clearTimeout(rewardTimer);
    rewardTimer = setTimeout(() => {
      rewardToast = null;
      rewardTimer = null;
    }, 2200);
  };

  const handlePrimaryReconnect = () => {
    track('primary_action_click', { intent: 'RECONNECT_30' });
    reconnectModalOpen = true;
  };

  const executeReconnect = () => {
    reconnectModalOpen = false;
    showReward();
  };

  onMount(() => {
    track('home_view', {
      companion: activeCompanion?.id ?? null,
      closenessState,
      hasMood: Boolean(data.dailyCheckinToday)
    });

    return () => {
      if (rewardTimer) clearTimeout(rewardTimer);
    };
  });
</script>

<div class="home-root">
  <main class="home-shell" aria-labelledby="home-title">
    <h1 id="home-title" class="sr-only">Companion Home</h1>

    <HomeSanctuaryV1
      companionName={companionName}
      companionSpecies={companionSpecies}
      companionAvatarUrl={activeCompanion?.avatar_url ?? null}
      {closenessState}
      {statusLine}
      {statusReason}
      needsReconnectToday={needsReconnectToday}
      primaryLabel="Reflect & Share"
      primaryCopy={`A quick check-in to bring ${companionName} closer.`}
      on:primary={handlePrimaryReconnect}
      on:companion={() => {
        companionSheetOpen = true;
        track('orb_open_sheet', { companion: activeCompanion?.id ?? null });
      }}
    />

    {#if rewardToast}
      <div class="reward-toast" role="status">{rewardToast}</div>
    {/if}
  </main>
</div>

<CompanionSheet
  open={companionSheetOpen}
  name={activeCompanion?.name ?? null}
  status={closenessState === 'Near' ? 'Synced' : closenessState}
  bondTier={`Bond Tier ${activeCompanion?.bondLevel ?? 1}`}
  evolutionTag={activeCompanion?.species ? `${activeCompanion.species} form` : 'Base form'}
  imageUrl={activeCompanion?.avatar_url ?? null}
  energy={effective?.energy ?? activeCompanion?.energy ?? 0}
  onClose={() => {
    companionSheetOpen = false;
  }}
/>

<BottomSheet
  open={reconnectModalOpen}
  title="Reconnect Ritual"
  onClose={() => {
    reconnectModalOpen = false;
  }}
>
  <section class="modal-copy">
    <p>Take one soft breath and call {companionName} closer for 30 seconds.</p>
    <button type="button" on:click={executeReconnect}>Done</button>
  </section>
</BottomSheet>

<style>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .home-root {
    --home-font-display: 'Sora', 'Avenir Next', 'Segoe UI', sans-serif;
    --home-font-body: 'Manrope', 'Avenir Next', 'Segoe UI', sans-serif;

    --home-bg-base: rgba(6, 11, 27, 0.98);
    --home-bg-deep: rgba(4, 7, 19, 1);
    --home-surface-soft: rgba(9, 15, 34, 0.56);
    --home-text-primary: rgba(245, 250, 255, 0.98);
    --home-text-secondary: rgba(189, 208, 232, 0.88);
    --home-text-tertiary: rgba(186, 210, 237, 0.84);
    --home-cta-start: rgba(86, 232, 220, 0.96);
    --home-cta-end: rgba(119, 175, 255, 0.95);
    --home-cta-text: rgba(6, 16, 35, 0.96);
    --home-radius-sm: 0.56rem;
    --home-radius-lg: 0.95rem;
    --home-shadow-soft: 0 14px 28px rgba(20, 184, 166, 0.3);

    min-height: 100vh;
    position: relative;
    overflow: clip;
    font-family: var(--home-font-body);
  }

  .home-shell {
    position: relative;
    z-index: 5;
    margin: 0;
    width: 100%;
    max-width: none;
    box-sizing: border-box;
    padding: 0;
    display: grid;
    gap: 0;
  }

  .reward-toast {
    position: fixed;
    left: 50%;
    bottom: calc(5.4rem + env(safe-area-inset-bottom));
    transform: translateX(-50%);
    border-radius: 999px;
    border: 1px solid rgba(45, 212, 191, 0.44);
    background: rgba(13, 148, 136, 0.95);
    color: rgba(240, 253, 250, 0.96);
    padding: 0.48rem 0.9rem;
    font-size: 0.8rem;
    font-weight: 700;
    box-shadow: var(--home-shadow-soft);
  }

  .modal-copy {
    display: grid;
    gap: 0.7rem;
  }

  .modal-copy p {
    margin: 0;
    color: var(--home-text-secondary);
    font-size: 0.9rem;
    line-height: 1.45;
  }

  .modal-copy button {
    min-height: 2.7rem;
    border-radius: var(--home-radius-lg);
    border: none;
    background: linear-gradient(135deg, var(--home-cta-start), var(--home-cta-end));
    color: var(--home-cta-text);
    font-weight: 700;
  }
</style>
