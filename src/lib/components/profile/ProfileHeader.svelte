<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { formatJoined } from '$lib/format/date';

  export let profile: Record<string, any> | null = null;
  export let coverUrl: string | null = null;
  export let avatarUrl: string | null = null;
  export let canEdit = false;
  export let canShare = false;

  const dispatch = createEventDispatcher<{ edit: void; share: void }>();

  let compact = false;
  let scrollHandler: ((event: Event) => void) | null = null;

  $: displayName = profile?.display_name ?? 'Anonymous Explorer';
  $: handle = profile?.handle ?? 'player';
  $: levelLabel = Number.isFinite(profile?.level) ? `LEVEL ${profile?.level}` : 'Explorer';
  $: joinedLabel = formatJoined(profile?.joined_at ?? null);

  function handleEdit() {
    if (!canEdit) return;
    dispatch('edit');
  }

  function handleShare() {
    if (!canShare) return;
    dispatch('share');
  }

  function updateCompact() {
    if (typeof window === 'undefined') return;
    compact = window.scrollY > 120;
  }

  if (typeof window !== 'undefined') {
    scrollHandler = () => updateCompact();
    window.addEventListener('scroll', scrollHandler, { passive: true });
    updateCompact();
  }

  onDestroy(() => {
    if (scrollHandler && typeof window !== 'undefined') {
      window.removeEventListener('scroll', scrollHandler);
    }
  });
</script>

<section class="mt-4">
  <div class="cover-frame">
    <div class="cover-card">
      {#if coverUrl}
        <img src={coverUrl} alt="" class="cover-media cover-bleed" />
      {:else}
        <div
          class="cover-media cover-bleed bg-[radial-gradient(1200px_400px_at_50%_0%,rgba(80,0,255,0.25),transparent_60%),radial-gradient(900px_300px_at_30%_20%,rgba(0,255,240,0.18),transparent_55%)]"
          aria-hidden="true"
        ></div>
      {/if}
      <div class="cover-scrim" aria-hidden="true"></div>
      <div class="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/25 to-transparent" aria-hidden="true"></div>
    </div>
  </div>
</section>

<header class="cover-frame relative z-10 -mt-10 sm:-mt-12">
  <div class="panel cover-compact" class:shadow-lg={compact}>
    <div class="flex flex-col gap-6">
      <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div class="flex items-center gap-4">
          <img
            src={avatarUrl ?? '/avatars/default.png'}
            alt=""
            class="h-16 w-16 rounded-2xl ring-1 ring-white/20 object-cover sm:h-20 sm:w-20"
            loading="lazy"
          />
          <div>
            <h1 class="text-xl font-semibold sm:text-2xl">{displayName}</h1>
            <div class="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/70">
              <span>@{handle}</span>
              {#if joinedLabel}
                <span class="h-1 w-1 rounded-full bg-white/30" aria-hidden="true"></span>
                <span>Joined {joinedLabel}</span>
              {/if}
            </div>
            <div class="mt-2 flex flex-wrap gap-2 text-xs text-white/70">
              <span class="rounded-full bg-white/10 px-3 py-1">{levelLabel}</span>
              {#if profile?.is_private}
                <span class="rounded-full bg-white/10 px-3 py-1">Private</span>
              {/if}
            </div>
          </div>
        </div>
        {#if canEdit || canShare}
          <div class="action-group self-end md:self-start">
            {#if canShare}
              <button class="btn-ghost" type="button" on:click={handleShare}>Share</button>
            {/if}
            {#if canEdit}
              <button class="btn-ghost" type="button" on:click={handleEdit}>Edit profile</button>
            {/if}
          </div>
        {/if}
      </div>

      <nav class="tabs" aria-label="Profile sections">
        <a class="tab tab-active" href="#overview">Overview</a>
        <a class="tab" href="#companions">Companions</a>
        <a class="tab" href="#achievements">Achievements</a>
        <a class="tab" href="#activity">Activity</a>
      </nav>
    </div>
  </div>
</header>
