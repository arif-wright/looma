<script lang="ts">
  export let data: any;
  const p = data.profile;
  const feed = data.feed ?? [];
</script>

<main class="wrap">
  <header class="hero">
    <img class="avatar" src={p.avatar_url ?? '/avatar.svg'} alt="" />
    <div>
      <h1>{p.display_name ?? p.handle}</h1>
      <p class="sub">@{p.handle}</p>
      <p class="meta">Level {p.level} • {p.bonded_count} bonded</p>
    </div>
  </header>
  <section class="feed">
    <h2>Recent activity</h2>
    {#if feed.length === 0}
      <p class="empty">No recent public activity.</p>
    {:else}
      <ul>
        {#each feed as r (r.id)}
          <li><span class="when">{new Date(r.created_at).toLocaleString()}</span> — {r.message}</li>
        {/each}
      </ul>
    {/if}
  </section>
</main>

<style>
  .wrap { max-width: 840px; margin: 0 auto; padding: 20px; }
  .hero { display:flex; gap:14px; align-items:center; margin-bottom: 16px; }
  .avatar { width:56px; height:56px; border-radius:999px; border:1px solid rgba(255,255,255,.1); }
  h1 { margin:0; }
  .sub { opacity:.8; margin:2px 0 4px; }
  .meta { opacity:.9; font-size:14px; }
  .feed h2 { margin-top: 8px; font-size: 16px; }
  .feed ul { padding-left: 18px; }
  .when { opacity:.7; font-size: 12px; }
  .empty { opacity:.7; }
</style>
