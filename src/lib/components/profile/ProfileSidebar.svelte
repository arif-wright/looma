<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let profile: Record<string, any> | null = null;
  export let featuredCompanion: Record<string, any> | null = null;
  export let achievements: Array<Record<string, any>> = [];
  export let stats: Record<string, any> | null = null;
  export let shards: number | null = null;
  export let isOwner = false;
  export let hideCompanionActions = false;
  export let hidePrivate = false;

  const dispatch = createEventDispatcher<{ chooseCompanion: void }>();

  const formatNumber = (value: number | null | undefined) => {
    if (value === null || value === undefined) return '—';
    return new Intl.NumberFormat().format(value);
  };

  $: achList = achievements?.length ? achievements : profile?.achievements ?? [];

  function handleChoose() {
    if (!isOwner || hideCompanionActions) return;
    dispatch('chooseCompanion');
  }
</script>

<aside class="profile-sticky space-y-4" aria-label="Profile summary">
  <section class="panel">
    <h3 class="panel-title">Featured Companion</h3>
    {#if featuredCompanion}
      <div class="flex items-center gap-3">
        <img
          src={featuredCompanion.avatar_url ?? featuredCompanion.avatar}
          alt={featuredCompanion.name}
          class="h-12 w-12 rounded-xl ring-1 ring-white/10 object-cover"
        />
        <div>
          <div class="font-medium">{featuredCompanion.name}</div>
          {#if featuredCompanion.mood}
            <div class="text-xs text-white/60">Mood: {featuredCompanion.mood}</div>
          {/if}
        </div>
      </div>
      {#if isOwner && !hideCompanionActions}
        <button class="btn-ghost w-full mt-3" type="button" on:click={handleChoose}>Swap companion</button>
      {/if}
    {:else}
      <p class="text-sm text-white/60 mb-3">Invite your first companion to showcase them here.</p>
      {#if isOwner && !hideCompanionActions}
        <button class="btn-ghost w-full" type="button" on:click={handleChoose}>Choose companion</button>
      {/if}
    {/if}
  </section>

  <section class="panel">
    <h3 class="panel-title">Recent Achievements</h3>
    {#if achList.length}
      <ul class="space-y-2">
        {#each achList.slice(0, 5) as achievement}
          <li class="flex items-center gap-3">
            <img
              src={achievement.icon ?? '/icons/trophy.svg'}
              alt=""
              class="h-8 w-8 rounded-lg ring-1 ring-white/10 object-cover"
              loading="lazy"
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
</aside>
