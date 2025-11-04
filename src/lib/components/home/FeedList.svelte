<script lang="ts">
  import { browser } from '$app/environment';
  import { onDestroy, onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { supabaseBrowser } from '$lib/supabaseClient';
  import FeedItem from './FeedItem.svelte';
  import MissionModal from '$lib/app/missions/MissionModal.svelte';
  import CreatureDetailModal from '$lib/app/creatures/CreatureDetailModal.svelte';
  import { fetchMissionById, type MissionRow } from '$lib/data/missions';
  import { fetchCreatureById, type CreatureRow } from '$lib/data/creatures';
  import type { FeedItem as FeedItemType } from '$lib/social/types';
  import { sortFeed } from '$lib/social/ranking';
  import { sendAnalytics } from '$lib/utils/analytics';

  export let items: FeedItemType[] = [];
  export let prepend: FeedItemType | null = null;
  export let pageSize = 10;

  const supabase = browser ? supabaseBrowser() : null;

  let feed: FeedItemType[] = [];
  let loading = false;
  let errorMsg: string | null = null;
  let exhausted = false;
  let cursor: string | null = null;
  let lastScroll = 0;
  let lastPrependId: string | null = null;

  let missionModalOpen = false;
  let missionModalData: MissionRow | null = null;
  let creatureModalOpen = false;
  let creatureModalData: CreatureRow | null = null;

  const selectColumns = [
    'id',
    'user_id',
    'author_id',
    'slug',
    'body',
    'meta',
    'image_url',
    'is_public',
    'created_at',
    'deep_link_target',
    'author_name',
    'author_handle',
    'author_avatar',
    'comment_count',
    'reaction_like_count',
    'reaction_spark_count',
    'reaction_support_count',
    'current_user_reaction',
    'is_follow',
    'engagement',
    'recency',
    'score'
  ].join(', ');

  const captureScroll = () => {
    if (!browser) return;
    lastScroll = Math.max(0, window.scrollY);
  };

  const persistContext = (trigger = 'navigation', extra: Record<string, unknown> = {}) => {
    if (!browser) return;
    const body = {
      context: 'feed',
      trigger,
      payload: {
        scroll: Math.floor(lastScroll),
        updatedAt: new Date().toISOString(),
        ...extra
      }
    };
    const json = JSON.stringify(body);
    if (typeof navigator.sendBeacon === 'function') {
      const blob = new Blob([json], { type: 'application/json' });
      navigator.sendBeacon('/api/context', blob);
    } else {
      void fetch('/api/context', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: json,
        keepalive: true
      }).catch((err) => console.debug('context update failed', err));
    }
  };

  const handleVisibility = () => {
    if (document.visibilityState === 'hidden') {
      persistContext('navigation');
    }
  };

  const handleBeforeUnload = () => {
    persistContext('navigation');
  };

  function primeFeed(initial: FeedItemType[]) {
    feed = Array.isArray(initial) ? [...initial] : [];
    feed = sortFeed(feed);
    cursor = feed.length > 0 ? feed[feed.length - 1]?.created_at ?? null : null;
    exhausted = feed.length < pageSize;
  }

  async function loadMore(initial = false) {
    if (!browser || !supabase) return;
    if (loading || (exhausted && !initial)) return;
    loading = true;
    errorMsg = null;

    try {
      let query = supabase
        .from('feed_view')
        .select(selectColumns)
        .order('score', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(pageSize);

      if (!initial && cursor) {
        query = query.lt('created_at', cursor);
      }

      const { data, error } = await query;
      if (error) throw error;

      const incoming = (Array.isArray(data) ? (data as FeedItemType[]) : []).filter(Boolean);

      if (initial) {
        feed = sortFeed(incoming);
      } else {
        const existingIds = new Set(feed.map((item) => item.id));
        for (const item of incoming) {
          if (!existingIds.has(item.id)) {
            feed.push(item);
          }
        }
        feed = sortFeed(feed);
      }

      cursor = feed.length > 0 ? feed[feed.length - 1]?.created_at ?? null : cursor;
      exhausted = incoming.length < pageSize;
    } catch (err) {
      console.error('feed load error', err);
      errorMsg = err instanceof Error ? err.message : 'Failed to load feed.';
    } finally {
      loading = false;
    }
  }

  async function handleDeeplink(event: CustomEvent<{ target: Record<string, unknown>; item: FeedItemType }>) {
    const { target } = event.detail;
    const targetType = typeof target?.type === 'string' ? (target.type as string) : null;
    const targetId = typeof target?.id === 'string' ? target.id : null;
    if (!targetType || !targetId) return;

    try {
      if (targetType === 'mission') {
        persistContext('mission_click', { targetType, targetId });
        sendAnalytics('feed_click_deeplink', {
          surface: 'home',
          payload: {
            target_type: targetType,
            target_id: targetId
          }
        });
        const mission = await fetchMissionById(targetId);
        missionModalData = mission;
        missionModalOpen = mission !== null;
      } else if (targetType === 'creature') {
        persistContext('social', { targetType, targetId });
        sendAnalytics('feed_click_deeplink', {
          surface: 'home',
          payload: {
            target_type: targetType,
            target_id: targetId
          }
        });
        const creature = await fetchCreatureById(targetId);
        creatureModalData = creature;
        creatureModalOpen = creature !== null;
      }
    } catch (err) {
      console.error('deeplink fetch error', err);
      errorMsg = err instanceof Error ? err.message : 'Failed to open item.';
    }
  }

  function closeMissionModal() {
    missionModalOpen = false;
    missionModalData = null;
  }

  function handleMissionLaunch(event: CustomEvent<{ missionId: string }>) {
    const missionId = event.detail?.missionId ?? null;
    closeMissionModal();
    if (!missionId) return;
    persistContext('mission_click', { targetType: 'mission', targetId: missionId, action: 'launch' });
    sendAnalytics('feed_click_deeplink', {
      surface: 'home',
      payload: {
        target_type: 'mission',
        target_id: missionId,
        action: 'launch'
      }
    });
    void goto(`/app/missions/${missionId}`);
  }

  function closeCreatureModal() {
    creatureModalOpen = false;
    creatureModalData = null;
  }

  onMount(() => {
    primeFeed(items);
    if (browser && feed.length === 0) {
      void loadMore(true);
    }
    if (browser) {
      lastScroll = window.scrollY;
      window.addEventListener('scroll', captureScroll, { passive: true });
      document.addEventListener('visibilitychange', handleVisibility);
      window.addEventListener('beforeunload', handleBeforeUnload);
    }
  });

  $: if (!browser) {
    primeFeed(items);
  }

  $: if (browser && prepend && prepend.id && prepend.id !== lastPrependId) {
    const existingIds = new Set(feed.map((item) => item.id));
    if (!existingIds.has(prepend.id)) {
      feed = [prepend, ...feed];
    } else {
      feed = [prepend, ...feed.filter((item) => item.id !== prepend.id)];
    }
    feed = sortFeed(feed);
    lastPrependId = prepend.id;
  }

  onDestroy(() => {
    if (!browser) return;
    persistContext('navigation');
    window.removeEventListener('scroll', captureScroll);
    document.removeEventListener('visibilitychange', handleVisibility);
    window.removeEventListener('beforeunload', handleBeforeUnload);
  });
</script>

<section class="feed">
  {#if errorMsg}
    <p class="feed__error" role="alert">{errorMsg}</p>
  {/if}

  {#if feed.length === 0 && loading}
    <div class="feed__skeletons" aria-label="Loading feed">
      {#each Array(pageSize) as _, index}
        <div class="skeleton" style={`animation-delay:${index * 80}ms`}></div>
      {/each}
    </div>
  {/if}

  {#if feed.length === 0 && !loading && !errorMsg}
    <div class="feed__empty">
      <p>No recommendations yet.</p>
      <a href="/app/u/explore">Discover new creators</a>
    </div>
  {/if}

  <ul class="feed__list">
    {#each feed as item (item.id)}
      <li>
        <FeedItem {item} on:deeplink={handleDeeplink} />
      </li>
    {/each}
  </ul>

  <div class="feed__footer">
    {#if !exhausted}
      <button type="button" class="feed__more" on:click={() => loadMore(false)} disabled={loading}>
        {loading ? 'Loading…' : 'Load more'}
      </button>
    {/if}
  </div>

  <MissionModal open={missionModalOpen} mission={missionModalData} on:close={closeMissionModal} on:launch={handleMissionLaunch} />

  <CreatureDetailModal open={creatureModalOpen} creature={creatureModalData} on:close={closeCreatureModal} />
</section>

<style>
  .feed {
    display: grid;
    gap: 20px;
  }

  .feed__error {
    margin: 0;
    font-size: 0.85rem;
    color: #fca5a5;
  }

  .feed__skeletons {
    display: grid;
    gap: 16px;
  }

  .skeleton {
    border-radius: 18px;
    height: 180px;
    background: linear-gradient(90deg, rgba(15, 23, 42, 0.6), rgba(30, 41, 59, 0.7));
    position: relative;
    overflow: hidden;
  }

  .skeleton::after {
    content: '';
    position: absolute;
    inset: 0;
    background: linear-gradient(
      90deg,
      transparent,
      rgba(148, 163, 184, 0.25),
      transparent
    );
    transform: translateX(-100%);
    animation: shimmer 1.6s infinite;
  }

  @keyframes shimmer {
    0% {
      transform: translateX(-100%);
    }
    60% {
      transform: translateX(100%);
    }
    100% {
      transform: translateX(100%);
    }
  }

  .feed__empty {
    border-radius: 18px;
    border: 1px dashed rgba(148, 163, 184, 0.35);
    padding: 32px;
    text-align: center;
    display: grid;
    gap: 12px;
    color: rgba(148, 163, 184, 0.78);
  }

  .feed__empty a {
    color: rgba(125, 211, 252, 0.9);
    text-decoration: none;
  }

  .feed__list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 24px;
  }

  .feed__footer {
    display: flex;
    justify-content: center;
  }

  .feed__more {
    padding: 8px 18px;
    border-radius: 999px;
    border: 1px solid rgba(148, 163, 184, 0.3);
    background: rgba(30, 41, 59, 0.6);
    color: rgba(226, 232, 240, 0.9);
    cursor: pointer;
    font-size: 0.85rem;
    transition: background 0.2s ease, transform 0.2s ease;
  }

  .feed__more:hover:not(:disabled),
  .feed__more:focus-visible {
    background: rgba(56, 189, 248, 0.18);
    transform: translateY(-1px);
  }

  .feed__more:disabled {
    opacity: 0.6;
    cursor: default;
  }

  @media (prefers-reduced-motion: reduce) {
    .feed__more {
      transition: background 0.2s ease;
    }
    .feed__more:hover:not(:disabled),
    .feed__more:focus-visible {
      transform: none;
    }
  }
</style>
