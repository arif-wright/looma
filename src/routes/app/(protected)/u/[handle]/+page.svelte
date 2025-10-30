<script lang="ts">
  import ProfileHero from '$lib/profile/ProfileHero.svelte';
  import PostComposer from '$lib/social/PostComposer.svelte';
  import PostList from '$lib/social/PostList.svelte';
  import type { ProfileSummary } from '$lib/profile/types';

  export let data: {
    profile: ProfileSummary;
    feed: any[];
    viewerId: string | null;
    highlightPostId: string | null;
  };

  const profile = data.profile;
  let feed = data.feed ?? [];
  const viewerId = data.viewerId ?? null;

  let loading = false;
  let reachedEnd = feed.length < 12;
  let tab: 'activity' | 'posts' = 'activity';
  let postsRefreshToken = 0;
  let postListRef: any = null;

  const isSelf = !!viewerId && profile?.id === viewerId;

  async function loadMoreActivity() {
    if (loading || reachedEnd || !profile?.id) return;
    if (feed.length === 0) return;
    loading = true;
    const last = feed[feed.length - 1]?.created_at ?? new Date().toISOString();
    try {
      const res = await fetch(`/api/user-feed?user=${profile.id}&before=${encodeURIComponent(last)}`);
      if (!res.ok) {
        console.error('user-feed load more failed', await res.text());
        reachedEnd = true;
      } else {
        const more = await res.json();
        if (Array.isArray(more) && more.length > 0) {
          const existing = new Set(feed.map((item: any) => item.id));
          const additions = more.filter((item: any) => !existing.has(item.id));
          feed = [...feed, ...additions];
          reachedEnd = additions.length === 0 || more.length < 12;
        } else {
          reachedEnd = true;
        }
      }
    } catch (err) {
      console.error('user-feed load more error', err);
      reachedEnd = true;
    } finally {
      loading = false;
    }
  }

  function refreshPosts() {
    postsRefreshToken += 1;
    postListRef?.refresh?.();
  }
</script>

<main class="wrap">
  <ProfileHero {profile} />

  <div class="tabs" role="tablist">
    <button
      role="tab"
      type="button"
      class:active={tab === 'activity'}
      aria-selected={tab === 'activity'}
      on:click={() => (tab = 'activity')}
    >
      Activity
    </button>
    <button
      role="tab"
      type="button"
      class:active={tab === 'posts'}
      aria-selected={tab === 'posts'}
      on:click={() => (tab = 'posts')}
    >
      Posts
    </button>
  </div>

  {#if tab === 'activity'}
    <section class="feed">
      <h2>Recent activity</h2>
      {#if !feed || feed.length === 0}
        <p class="empty">No recent public activity.</p>
      {:else}
        <ul class="timeline">
          {#each feed as r (r.id)}
            <li>
              <span class="when">{new Date(r.created_at).toLocaleString()}</span>
              <span class="msg">{r.message ?? ''}</span>
            </li>
          {/each}
        </ul>
        <div class="more">
          <button class="btn" on:click={loadMoreActivity} disabled={loading || reachedEnd}>
            {loading ? 'Loading…' : reachedEnd ? 'No more activity' : 'Load more'}
          </button>
        </div>
      {/if}
    </section>
  {:else}
    <section class="posts-panel">
      {#if isSelf}
        <PostComposer on:posted={refreshPosts} />
      {/if}
      <PostList
        userId={profile?.id}
        pageSize={10}
        refreshToken={postsRefreshToken}
        emptyMessage={isSelf ? 'No posts yet — share something uplifting!' : 'No posts yet.'}
        highlightPostId={data.highlightPostId}
        bind:this={postListRef}
      />
    </section>
  {/if}
</main>

<style>
  .wrap {
    max-width: 920px;
    margin: 0 auto;
    padding: 24px;
    display: grid;
    gap: 24px;
  }

  .tabs {
    display: inline-flex;
    gap: 8px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding-bottom: 6px;
  }

  .tabs button {
    padding: 6px 14px;
    border-radius: 999px;
    border: 1px solid transparent;
    background: transparent;
    color: inherit;
    font-size: 0.9rem;
    cursor: pointer;
  }

  .tabs button.active {
    border-color: rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.08);
  }

  .feed h2 {
    margin: 0;
    font-size: 1.1rem;
  }

  .timeline {
    list-style: none;
    padding: 0;
    margin: 14px 0 0;
    display: grid;
    gap: 12px;
  }

  .timeline li {
    display: grid;
    gap: 8px;
    grid-template-columns: minmax(140px, 180px) 1fr;
    align-items: start;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }

  .timeline .when {
    font-size: 12px;
    opacity: 0.65;
  }

  .timeline .msg {
    opacity: 0.95;
  }

  .more {
    display: flex;
    justify-content: center;
    margin-top: 12px;
  }

  .btn {
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    padding: 6px 14px;
    border-radius: 999px;
    font-size: 0.85rem;
    cursor: pointer;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: default;
  }

  .empty {
    opacity: 0.7;
  }

  .posts-panel {
    display: grid;
    gap: 16px;
  }

  @media (max-width: 640px) {
    .timeline {
      gap: 18px;
    }

    .timeline li {
      grid-template-columns: 1fr;
      padding-bottom: 18px;
    }
  }
</style>
