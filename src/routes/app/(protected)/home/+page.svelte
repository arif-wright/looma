<script lang="ts">
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import BackgroundStack from '$lib/ui/BackgroundStack.svelte';
  import LivingFieldHome from '$lib/components/home/LivingFieldHome.svelte';
  import CompanionSheet from '$lib/components/home/CompanionSheet.svelte';
  import BottomSheet from '$lib/components/ui/BottomSheet.svelte';
  import type { HomeMood } from '$lib/components/home/homeLoopTypes';
  import { logEvent } from '$lib/analytics';
  import { computeCompanionEffectiveState } from '$lib/companions/effectiveState';
  import { buildFieldConfig, type HomeState, type PrimaryAction } from '$lib/home/fieldEngine';
  import type { PageData } from './$types';

  export let data: PageData;

  const moodCopy: Record<HomeMood, string> = {
    calm: 'Steady arrival noted. Keep the bond in rhythm.',
    heavy: 'You are carrying weight. Keep this gentle.',
    curious: 'Curiosity registered. Follow one thread.',
    energized: 'High activation detected. Channel it with intention.',
    numb: 'Low signal is valid. Start with one tiny action.'
  };

  const localDateKey = () => {
    const now = new Date();
    const shifted = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
    return shifted.toISOString().slice(0, 10);
  };

  const localMoodKey = (date: string) => `looma_mood_checkin_${date}`;

  const activeCompanion = data.activeCompanion ?? null;
  const quickMission = data.dailyMissions?.[0] ?? data.weeklyMissions?.[0] ?? data.missions?.[0] ?? null;

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

  const deriveCompanionStatus = () => {
    if (!activeCompanion) return 'Steady' as const;
    if (effective?.moodKey === 'distant') return 'Distant' as const;
    if (effective?.moodKey === 'radiant') return 'Resonant' as const;
    if (effective?.moodKey === 'calm') return 'Synced' as const;
    return 'Steady' as const;
  };

  $: companionStatus = deriveCompanionStatus();
  $: companionStatusText =
    companionStatus === 'Distant'
      ? `${activeCompanion?.name ?? 'Your companion'} misses you. Reconnect.`
      : companionStatus === 'Resonant'
        ? `${activeCompanion?.name ?? 'Your companion'} is fully tuned with you.`
        : companionStatus === 'Synced'
          ? `${activeCompanion?.name ?? 'Your companion'} is synced and responsive.`
          : 'Your companion is nearby and listening.';

  let selectedMood: HomeMood | null =
    (typeof data.dailyCheckinToday?.mood === 'string' ? (data.dailyCheckinToday.mood as HomeMood) : null) ?? null;
  let hasCheckedInToday = Boolean(data.dailyCheckinToday);
  let showMoodSeeds = !hasCheckedInToday;
  let moodFading = false;
  let companionSheetOpen = false;
  let reconnectModalOpen = false;
  let microRitualModalOpen = false;
  let rewardToast: string | null = null;
  let rewardTimer: ReturnType<typeof setTimeout> | null = null;

  $: attunementLine = selectedMood ? moodCopy[selectedMood] ?? null : null;

  $: homeState = {
    moodToday: hasCheckedInToday ? selectedMood : null,
    companionStatus,
    companionEnergy: effective?.energy ?? activeCompanion?.energy ?? 0,
    unreadWhispers: data.notificationsUnread ?? 0,
    quickMissionAvailable: Boolean(quickMission),
    energyOk: (data.stats?.energy ?? 0) >= 8
  } satisfies HomeState;

  $: fieldConfig = buildFieldConfig(homeState);
  $: primaryAction = fieldConfig.primaryAction;

  $: primaryLabel =
    primaryAction === 'CHECK_IN'
      ? 'How are you arriving?'
      : primaryAction === 'RECONNECT_30'
        ? 'Reconnect (30 sec)'
        : primaryAction === 'SEND_WARMTH'
          ? 'Send warmth'
          : primaryAction === 'QUICK_SPARK'
            ? 'Quick Spark'
            : 'Micro Ritual';

  const track = (
    kind: 'home_view' | 'mood_checkin_submit' | 'primary_action_click' | 'explore_mode_toggle' | 'orb_open_sheet',
    meta: Record<string, unknown> = {}
  ) => {
    console.debug('[home]', kind, meta);
    void logEvent(kind, meta);
  };

  const submitMood = async (mood: HomeMood) => {
    if (hasCheckedInToday) return;
    selectedMood = mood;
    moodFading = true;
    const today = localDateKey();

    try {
      const response = await fetch('/api/home/checkin', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ mood, date: today })
      });
      if (!response.ok) throw new Error('checkin_failed');
    } catch {
      // Fall back to local key only when API write fails.
    }

    if (browser) {
      window.localStorage.setItem(localMoodKey(today), mood);
    }

    hasCheckedInToday = true;
    setTimeout(() => {
      showMoodSeeds = false;
      moodFading = false;
    }, 260);
    track('mood_checkin_submit', { mood });
  };

  const showReward = (copy = '+XP · +Energy') => {
    rewardToast = copy;
    if (rewardTimer) clearTimeout(rewardTimer);
    rewardTimer = setTimeout(() => {
      rewardToast = null;
      rewardTimer = null;
    }, 2200);
  };

  const handlePrimaryAction = async (intent: PrimaryAction) => {
    track('primary_action_click', { intent, mood: selectedMood });

    if (intent === 'CHECK_IN') {
      showMoodSeeds = true;
      return;
    }

    if (intent === 'RECONNECT_30') {
      reconnectModalOpen = true;
      return;
    }

    if (intent === 'SEND_WARMTH') {
      await goto('/app/circles');
      return;
    }

    if (intent === 'QUICK_SPARK') {
      showReward('+12 XP · +4 Energy');
      await goto('/app/games');
      return;
    }

    microRitualModalOpen = true;
  };

  const executeReconnect = async () => {
    reconnectModalOpen = false;
    showReward('+8 XP · +5 Energy');
    await goto('/app/companions');
  };

  const executeMicroRitual = () => {
    microRitualModalOpen = false;
    showReward('+5 XP · +3 Energy');
  };

  const handleSeedFollow = async (href: string, source: 'tap' | 'magnetic') => {
    track('primary_action_click', { intent: 'SEED_NAV', href, source });
    await goto(href);
  };

  onMount(() => {
    track('home_view', {
      hasMood: hasCheckedInToday,
      companion: activeCompanion?.id ?? null,
      mode: fieldConfig.fieldMode
    });

    const run = async () => {
      const today = localDateKey();

      if (browser && !hasCheckedInToday) {
        const localMood = window.localStorage.getItem(localMoodKey(today));
        if (localMood && ['calm', 'heavy', 'curious', 'energized', 'numb'].includes(localMood)) {
          selectedMood = localMood as HomeMood;
          hasCheckedInToday = true;
          showMoodSeeds = false;
        }
      }

      try {
        const syncRes = await fetch(`/api/home/checkin?date=${encodeURIComponent(today)}`, {
          headers: { 'cache-control': 'no-store' }
        });
        const payload = await syncRes.json().catch(() => ({}));
        if (syncRes.ok && payload?.today?.mood) {
          selectedMood = payload.today.mood as HomeMood;
          hasCheckedInToday = true;
          showMoodSeeds = false;
        }
      } catch {
        // Keep local state.
      }
    };

    void run();

    return () => {
      if (rewardTimer) clearTimeout(rewardTimer);
    };
  });
</script>

<div class="home-root bg-neuro">
  <BackgroundStack />

  <main class="home-shell" aria-labelledby="home-title">
    <h1 id="home-title" class="sr-only">Living Field Home</h1>

    <LivingFieldHome
      {fieldConfig}
      companionName={activeCompanion?.name ?? null}
      companionStatus={companionStatus}
      actionLabel={primaryLabel}
      actionIntent={primaryAction}
      {showMoodSeeds}
      {moodFading}
      {selectedMood}
      on:primary={(event) => handlePrimaryAction(event.detail.intent)}
      on:mood={(event) => submitMood(event.detail.mood)}
      on:seed={(event) => handleSeedFollow(event.detail.href, 'tap')}
      on:magnetic={(event) => handleSeedFollow(event.detail.href, 'magnetic')}
      on:orb={() => {
        companionSheetOpen = true;
        track('orb_open_sheet', { companion: activeCompanion?.id ?? null });
      }}
      on:explore={(event) => track('explore_mode_toggle', { enabled: event.detail.enabled })}
    />

    {#if attunementLine}
      <p class="attunement">{attunementLine}</p>
    {/if}

    {#if rewardToast}
      <div class="reward-toast" role="status">{rewardToast}</div>
    {/if}
  </main>
</div>

<CompanionSheet
  open={companionSheetOpen}
  name={activeCompanion?.name ?? null}
  status={companionStatus}
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
  title="Reconnect"
  onClose={() => {
    reconnectModalOpen = false;
  }}
>
  <section class="modal-copy">
    <p>Take one gentle breath, send one warm signal, and return to your companion.</p>
    <button type="button" on:click={executeReconnect}>Complete reconnect</button>
  </section>
</BottomSheet>

<BottomSheet
  open={microRitualModalOpen}
  title="Micro Ritual"
  onClose={() => {
    microRitualModalOpen = false;
  }}
>
  <section class="modal-copy">
    <p>Place attention on one small intention for 20 seconds.</p>
    <button type="button" on:click={executeMicroRitual}>Done</button>
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
  }

  .home-shell {
    position: relative;
    z-index: 5;
    margin: 0 auto;
    width: 100%;
    max-width: 62rem;
    box-sizing: border-box;
    padding: 0.95rem 0.85rem calc(7.3rem + env(safe-area-inset-bottom));
    display: grid;
    gap: 0.72rem;
  }

  .attunement {
    margin: 0;
    text-align: center;
    color: rgba(186, 230, 253, 0.94);
    font-size: 0.88rem;
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

  @media (min-width: 900px) {
    .home-shell {
      padding: 1.25rem 1.2rem 4rem;
      gap: 0.9rem;
    }
  }
</style>
