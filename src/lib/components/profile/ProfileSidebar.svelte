<script lang="ts">
  import AchievementIcon from '$lib/components/games/AchievementIcon.svelte';
  import { getCompanionMoodMeta } from '$lib/companions/moodMeta';

  export let profile: Record<string, any> | null = null;
  export let featuredCompanion: Record<string, any> | null = null;
  export let achievements: Array<Record<string, any>> = [];
  export let stats: Record<string, any> | null = null;
  export let shards: number | null = null;
  export let isOwner = false;
  export let hideCompanionActions = false;
  export let hidePrivate = false;
  export let companionHidden = false;

  const formatNumber = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '—';
    return new Intl.NumberFormat().format(value);
  };

  $: achList = achievements?.length ? achievements : profile?.achievements ?? [];
  $: companionMood = featuredCompanion ? getCompanionMoodMeta(featuredCompanion.mood) : null;
  $: companionSpecies = featuredCompanion?.species ?? null;
</script>

<aside class="profile-sticky space-y-4" aria-label="Profile summary">
  <section class="panel">
    <h3 class="panel-title">{hidePrivate ? 'Companion' : 'Featured Companion'}</h3>
    {#if companionHidden}
      <p class="text-sm text-white/60">Companion info hidden.</p>
    {:else if featuredCompanion}
      {#if hidePrivate}
        <div class="public-companion">
          <div>
            <p class="text-xs uppercase tracking-[0.25em] text-white/50">Bonded with</p>
            <p class="font-semibold text-white">{featuredCompanion.name}</p>
            <p class="text-white/70 text-sm">
              {companionSpecies ? `${companionSpecies}` : 'Unknown species'}
            </p>
          </div>
          {#if companionMood}
            <span class={`mood-pill mood-pill--${companionMood.key}`}>{companionMood.label}</span>
          {/if}
        </div>
      {:else}
        <div class="featured-companion">
          <img
            src={featuredCompanion.avatar_url ?? featuredCompanion.avatar ?? '/avatar.svg'}
            alt=""
            class="featured-companion__avatar"
            aria-hidden="true"
          />
          <div class="featured-companion__body">
            <div class="featured-companion__name">
              <strong>{featuredCompanion.name}</strong>
              <span>{companionSpecies ?? 'Unknown'}</span>
            </div>
            <p class="featured-companion__copy">
              {companionMood?.description ?? 'Steady · content by your side.'}
            </p>
            <div class="featured-companion__stats">
              <span>💗 {featuredCompanion.affection ?? '—'}</span>
              <span>🤝 {featuredCompanion.trust ?? '—'}</span>
            </div>
          </div>
        </div>
        {#if isOwner && !hideCompanionActions}
          <a class="btn-ghost w-full mt-3 text-center" href="/app/companions">Open Companion Panel</a>
        {/if}
      {/if}
    {:else}
      <p class="text-sm text-white/60 mb-3">
        {hidePrivate
          ? 'This explorer hasn’t showcased a companion yet.'
          : 'Invite your first companion to showcase them here.'}
      </p>
      {#if isOwner && !hideCompanionActions}
        <a class="btn-ghost w-full text-center" href="/app/companions">Choose one</a>
      {/if}
    {/if}
  </section>

  <section class="panel">
    <h3 class="panel-title">Recent Achievements</h3>
    {#if achList.length}
      <ul class="space-y-2">
        {#each achList.slice(0, 5) as achievement}
          <li class="flex items-center gap-3">
            <AchievementIcon
              icon={typeof achievement.icon === 'string' ? achievement.icon : 'trophy'}
              label={achievement.title ?? achievement.name ?? 'Achievement'}
              size={20}
              style="--achievement-icon-size:2.5rem"
            />
            <div class="min-w-0">
              <div class="text-sm font-medium truncate">{achievement.title ?? achievement.name ?? 'Achievement'}</div>
              {#if achievement.when_label}
                <div class="text-xs text-white/60 truncate">{achievement.when_label}</div>
              {/if}
            </div>
          </li>
        {/each}
      </ul>
      {#if achList.length > 5}
        <a href="/app/achievements" class="btn-ghost mt-3 w-full text-center">View all</a>
      {/if}
    {:else}
      <p class="text-sm text-white/60">No achievements yet—play missions to unlock your first badge.</p>
    {/if}
  </section>

  {#if !hidePrivate}
    <section class="panel">
      <h3 class="panel-title">Stats</h3>
      <div class="grid grid-cols-3 gap-2 text-center">
        <div class="rounded-xl bg-white/5 p-3">
          <div class="text-xs text-white/60">Level</div>
          <div class="font-semibold">{formatNumber(stats?.level ?? profile?.level ?? 1)}</div>
        </div>
        <div class="rounded-xl bg-white/5 p-3">
          <div class="text-xs text-white/60">XP</div>
          <div class="font-semibold">{formatNumber(stats?.xp ?? profile?.xp ?? null)}</div>
        </div>
        <div class="rounded-xl bg-white/5 p-3">
          <div class="text-xs text-white/60">Shards</div>
          <div class="font-semibold">{formatNumber(shards)}</div>
        </div>
      </div>
    </section>

    <section class="panel">
      <h3 class="panel-title">Quick Links</h3>
      <ul class="grid gap-2">
        <li><a class="btn-ghost w-full text-left" href="/app/companions">My Companions</a></li>
        <li><a class="btn-ghost w-full text-left" href="/app/achievements">Achievements</a></li>
        <li><a class="btn-ghost w-full text-left" href="/app/settings">Settings</a></li>
      </ul>
    </section>
  {/if}
</aside>

<style>
  .featured-companion {
    display: flex;
    gap: 0.9rem;
    align-items: center;
  }

  .featured-companion__avatar {
    width: 64px;
    height: 64px;
    border-radius: 16px;
    object-fit: cover;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(255, 255, 255, 0.05);
  }

  .featured-companion__body {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .featured-companion__name {
    display: flex;
    gap: 0.45rem;
    align-items: baseline;
    flex-wrap: wrap;
  }

  .featured-companion__name span {
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.55);
  }

  .featured-companion__copy {
    margin: 0;
    font-size: 0.9rem;
    color: rgba(255, 255, 255, 0.72);
  }

  .featured-companion__stats {
    display: flex;
    gap: 0.75rem;
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.78);
  }

  .public-companion {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    align-items: center;
  }

  .mood-pill {
    border-radius: 999px;
    padding: 0.25rem 0.75rem;
    border: 1px solid rgba(255, 255, 255, 0.15);
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .mood-pill--radiant {
    border-color: rgba(94, 242, 255, 0.45);
    color: rgba(94, 242, 255, 0.9);
  }

  .mood-pill--curious {
    border-color: rgba(236, 146, 255, 0.4);
    color: rgba(236, 146, 255, 0.9);
  }

  .mood-pill--steady {
    color: rgba(255, 255, 255, 0.75);
  }

  .mood-pill--tired {
    border-color: rgba(255, 196, 120, 0.5);
    color: rgba(255, 196, 120, 0.85);
  }
</style>
