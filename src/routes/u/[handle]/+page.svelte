<script lang="ts">
  export let data: {
    profile: {
      id: string;
      handle: string;
      display_name: string | null;
      avatar_url: string | null;
      level: number | null;
      xp: number | null;
      xp_next: number | null;
      bonded_count: number | null;
    };
    feed: Array<{ id: string; created_at: string; type: string; message: string }>;
  };

  const profile = data.profile;
  const feed = data.feed ?? [];
</script>

<main class="wrap">
  <header class="hero">
    <img class="avatar" src={profile.avatar_url ?? '/avatar-fallback.png'} alt="" />
    <div class="hero-text">
      <h1>{profile.display_name ?? profile.handle}</h1>
      <p class="sub">@{profile.handle}</p>
      <p class="meta">
        Level {profile.level ?? '—'}
        <span aria-hidden="true">•</span>
        {profile.bonded_count ?? 0} bonded companions
      </p>
    </div>
  </header>

  <section class="activity">
    <h2>Recent public activity</h2>
    {#if feed.length === 0}
      <p class="empty">No recent public actions.</p>
    {:else}
      <ul>
        {#each feed as entry (entry.id)}
          <li>
            <span class="when">{new Date(entry.created_at).toLocaleString()}</span>
            <span class="msg">{entry.message}</span>
          </li>
        {/each}
      </ul>
    {/if}
  </section>
</main>

<style>
  .wrap {
    max-width: 860px;
    margin: 0 auto;
    padding: 24px 20px 48px;
    display: grid;
    gap: 24px;
  }

  .hero {
    display: flex;
    gap: 16px;
    align-items: center;
  }

  .avatar {
    width: 72px;
    height: 72px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    object-fit: cover;
    background: rgba(255, 255, 255, 0.04);
  }

  .hero-text h1 {
    margin: 0;
    font-size: 1.5rem;
  }

  .sub {
    margin: 4px 0;
    opacity: 0.8;
  }

  .meta {
    margin: 0;
    font-size: 0.95rem;
    opacity: 0.85;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .activity h2 {
    margin-top: 0;
    font-size: 1.1rem;
  }

  .activity ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 8px;
  }

  .activity li {
    padding: 10px 12px;
    border-radius: 12px;
    border: 1px solid rgba(255, 255, 255, 0.06);
    background: rgba(255, 255, 255, 0.03);
    display: flex;
    gap: 12px;
    align-items: baseline;
  }

  .when {
    font-size: 0.78rem;
    opacity: 0.7;
    min-width: 160px;
  }

  .msg {
    flex: 1;
    opacity: 0.92;
  }

  .empty {
    opacity: 0.75;
    font-style: italic;
  }

  @media (max-width: 640px) {
    .hero {
      flex-direction: column;
      align-items: flex-start;
    }

    .hero-text h1 {
      font-size: 1.35rem;
    }

    .activity li {
      flex-direction: column;
      gap: 6px;
    }

    .when {
      min-width: auto;
    }
  }
</style>
