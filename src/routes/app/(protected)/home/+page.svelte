<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import BackgroundStack from '$lib/ui/BackgroundStack.svelte';
  import HomeSanctuaryV1 from '$lib/components/home/HomeSanctuaryV1.svelte';
  import CompanionSheet from '$lib/components/home/CompanionSheet.svelte';
  import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
  import { logEvent } from '$lib/analytics';
  import { computeCompanionEffectiveState } from '$lib/companions/effectiveState';
  import type { QuickNavItem } from '$lib/components/home/quickNavTypes';
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

  const quickNavItems: QuickNavItem[] = [
    { id: 'circles', label: 'Circles', href: '/app/circles' },
    { id: 'messages', label: 'Messages', href: '/app/messages' },
    { id: 'games', label: 'Games', href: '/app/games' },
    { id: 'companion', label: 'Companion', href: '/app/companions' }
  ];

  let companionSheetOpen = false;
  let reconnectModalOpen = false;
  let rewardToast: string | null = null;
  let rewardTimer: ReturnType<typeof setTimeout> | null = null;

  const track = (
    kind: 'home_view' | 'primary_action_click' | 'orb_open_sheet' | 'home_quick_nav_click',
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

  const handleQuickNav = async (id: QuickNavItem['id'], href: string) => {
    track('home_quick_nav_click', { id, href });
    await goto(href);
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

<div class="home-root bg-neuro">
  <BackgroundStack />

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
      primaryLabel="Reconnect (30 sec)"
      primaryCopy="A quick check-in to bring Mirae closer."
      {quickNavItems}
      on:primary={handlePrimaryReconnect}
      on:companion={() => {
        companionSheetOpen = true;
        track('orb_open_sheet', { companion: activeCompanion?.id ?? null });
      }}
      on:navigate={(event) => handleQuickNav(event.detail.id, event.detail.href)}
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
    min-height: 100vh;
    position: relative;
    overflow: clip;
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
    box-shadow: 0 14px 28px rgba(20, 184, 166, 0.3);
  }

  .modal-copy {
    display: grid;
    gap: 0.7rem;
  }

  .modal-copy p {
    margin: 0;
    color: rgba(226, 232, 240, 0.9);
    font-size: 0.9rem;
    line-height: 1.45;
  }

  .modal-copy button {
    min-height: 2.7rem;
    border-radius: 0.76rem;
    border: none;
    background: linear-gradient(135deg, rgba(45, 212, 191, 0.95), rgba(56, 189, 248, 0.95));
    color: rgba(7, 17, 36, 0.96);
    font-weight: 700;
  }
</style>
