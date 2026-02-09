<script lang="ts">
  import Panel from '$lib/components/ui/Panel.svelte';

  const formatDate = (iso: string) => {
    const date = new Date(iso);
    return Number.isNaN(date.getTime())
      ? ''
      : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  };

  type PinnedPreview = {
    id: string;
    body: string;
    created_at: string;
    slug?: string | null;
  } | null;

  type CompanionMood = {
    name: string;
    mood: string;
  } | null;

  export let pinnedPost: PinnedPreview = null;
  export let companion: CompanionMood = null;
  export let latestAchievement: { label: string; when: string } | null = null;
  export let profileHandle: string;
</script>

<section class="highlights">
  <Panel className="panel-glass highlight-card">
    <p class="label">Pinned</p>
    {#if pinnedPost}
      <h3>{pinnedPost.body || 'Pinned post'}</h3>
      <p class="meta">{formatDate(pinnedPost.created_at)}</p>
      <a
        class="link chip"
        href={profileHandle ? `/app/u/${profileHandle}?post=${pinnedPost.id}` : '#'}
        aria-label="Open pinned post"
      >
        View post
      </a>
    {:else}
      <p class="empty">Add a pinned update to greet visitors.</p>
    {/if}
  </Panel>

  <Panel className="panel-glass highlight-card">
    <p class="label">Mood</p>
    {#if companion}
      <h3>{companion.name}</h3>
      <p class="meta">{companion.mood}</p>
    {:else}
      <p class="empty">No featured companion moods yet.</p>
    {/if}
  </Panel>

  <Panel className="panel-glass highlight-card">
    <p class="label">Latest achievement</p>
    {#if latestAchievement}
      <h3>{latestAchievement.label}</h3>
      <p class="meta">{latestAchievement.when}</p>
    {:else}
      <p class="empty">Achievements will appear here soon.</p>
    {/if}
  </Panel>
</section>

<style>
  .highlights {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 1rem;
  }

  .highlight-card {
    padding: 1.1rem;
    display: grid;
    gap: 0.4rem;
  }

  .label {
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font-size: 0.7rem;
    color: rgba(255, 255, 255, 0.62);
    margin: 0;
  }

  h3 {
    margin: 0;
    font-size: 1.05rem;
  }

  .meta {
    margin: 0;
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .chip {
    margin-top: 0.4rem;
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.35rem 0.9rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.2);
    text-decoration: none;
    font-size: 0.82rem;
  }

  .empty {
    margin: 0;
    font-size: 0.9rem;
    color: rgba(255, 255, 255, 0.65);
  }
</style>
