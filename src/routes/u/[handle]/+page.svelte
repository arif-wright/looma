<script lang="ts">
  export let data: any;
  let p = data.profile;
  let feed = data.feed ?? [];
  let loading = false;
  let reachedEnd = feed.length < 12;

  async function loadMore() {
    if (loading || reachedEnd || !p?.id) return;
    if (feed.length === 0) return;
    loading = true;
    const last = feed[feed.length - 1]?.created_at ?? new Date().toISOString();
    try {
      const res = await fetch(`/api/user-feed?user=${p.id}&before=${encodeURIComponent(last)}`);
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
</script>

<main class="wrap">
  <header class="hero">
    <img class="avatar" src={p?.avatar_url || '/avatar.svg'} alt="" />
    <div>
      <h1>{p?.display_name || p?.handle}</h1>
      <p class="sub">@{p?.handle}</p>
      <div class="stats">
        <div class="tile">
          <span class="k">Level</span>
          <b>{p?.level ?? '—'}</b>
        </div>
        <div class="tile">
          <span class="k">XP</span>
          <b>{p?.xp ?? 0} / {p?.xp_next ?? 0}</b>
        </div>
        <div class="tile">
          <span class="k">Bonded</span>
          <b>{p?.bonded_count ?? 0}</b>
        </div>
      </div>
    </div>
  </header>

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
        <button class="btn" on:click={loadMore} disabled={loading || reachedEnd}>
          {loading ? 'Loading…' : reachedEnd ? 'No more activity' : 'Load more'}
        </button>
      </div>
    {/if}
  </section>
</main>

<style>
  .wrap {
    max-width: 920px;
    margin: 0 auto;
    padding: 24px;
    display: grid;
    gap: 24px;
  }

  .hero {
    display: flex;
    gap: 16px;
    align-items: center;
    margin-bottom: 8px;
  }

  .avatar {
    width: 64px;
    height: 64px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    object-fit: cover;
    background: rgba(255, 255, 255, 0.05);
  }

  h1 {
    margin: 0;
    font-size: 1.5rem;
  }

  .sub {
    margin: 4px 0 12px;
    opacity: 0.75;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
  }

  .tile {
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.07);
    padding: 10px 12px;
    border-radius: 12px;
  }

  .tile .k {
    font-size: 12px;
    opacity: 0.7;
    display: block;
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

  @media (max-width: 640px) {
    .hero {
      flex-direction: column;
      align-items: flex-start;
    }

    .timeline {
      gap: 18px;
    }

    .timeline li {
      grid-template-columns: 1fr;
      padding-bottom: 18px;
    }
  }
</style>
