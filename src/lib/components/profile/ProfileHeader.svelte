<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { formatJoined } from '$lib/format/date';
  import Modal from '$lib/components/ui/Modal.svelte';
  import QRCode from '$lib/components/ui/QRCode.svelte';

  export let profile: Record<string, any> | null = null;
  export let coverUrl: string | null = null;
  export let avatarUrl: string | null = null;
  export let canEdit = false;
  export let canShare = false;
  export let shareUrl: string | null = null;

  const dispatch = createEventDispatcher<{ edit: void; share: void }>();

  let compact = false;
  let scrollHandler: ((event: Event) => void) | null = null;
  let shareOpen = false;
  let shareStatus = '';
  let downloading = false;

  $: displayName = profile?.display_name ?? 'Anonymous Explorer';
  $: handle = profile?.handle ?? 'player';
  $: levelLabel = Number.isFinite(profile?.level) ? `LEVEL ${profile?.level}` : 'Explorer';
  $: joinedLabel = formatJoined(profile?.joined_at ?? null);
  $: pulseIntensity = (() => {
    const lvl = Number(profile?.level ?? 0);
    if (lvl >= 20) return 'high';
    if (lvl >= 5) return 'medium';
    return 'low';
  })();

  function handleEdit() {
    if (!canEdit) return;
    dispatch('edit');
  }

  async function handleShare() {
    if (!canShare || !shareUrl) return;
    const payload = {
      title: `${displayName} on Looma`,
      text: profile?.bio?.slice(0, 120) ?? 'View this explorer on Looma',
      url: shareUrl
    };
    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share(payload);
        dispatch('share');
        return;
      }
    } catch (err) {
      console.error('share failed', err);
    }
    shareOpen = true;
  }

  async function copyLink() {
    if (!shareUrl) return;
    try {
      await navigator?.clipboard?.writeText(shareUrl);
      shareStatus = 'Link copied to clipboard';
    } catch (err) {
      console.error('copy failed', err);
      shareStatus = 'Unable to copy link';
    }
  }

  async function downloadCard() {
    if (!profile?.handle) return;
    downloading = true;
    try {
      const res = await fetch(`/api/og/profile?handle=${encodeURIComponent(profile.handle)}`);
      if (!res.ok) {
        throw new Error('Unable to download');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `looma-profile-${profile.handle}.png`;
      anchor.click();
      URL.revokeObjectURL(url);
      shareStatus = 'Image downloaded';
    } catch (err) {
      console.error('download failed', err);
      shareStatus = 'Unable to download card';
    } finally {
      downloading = false;
    }
  }

  function closeShare() {
    shareOpen = false;
    shareStatus = '';
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

<header class="profile-grid relative z-10 -mt-10 sm:-mt-12">
  <div class="panel cover-compact" class:shadow-lg={compact}>
    <div class="flex flex-col gap-6">
      <div class="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div class="flex items-center gap-4">
          <div class="avatar-ring" data-intensity={pulseIntensity}>
            <img
              src={avatarUrl ?? '/avatars/default.png'}
              alt=""
              class="relative z-10 h-16 w-16 rounded-full object-cover ring-2 ring-black/20 sm:h-20 sm:w-20"
              loading="lazy"
            />
          </div>
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

<Modal open={shareOpen} title="Share profile" onClose={closeShare}>
  <div class="share-modal">
    <div class="share-actions">
      <button class="btn btn-sm" type="button" on:click={copyLink} disabled={!shareUrl}>
        Copy link
      </button>
      <button class="btn btn-sm" type="button" on:click={downloadCard} disabled={downloading}>
        {downloading ? 'Preparing…' : 'Download card'}
      </button>
      {#if shareStatus}
        <p class="share-status">{shareStatus}</p>
      {/if}
    </div>
    {#if shareUrl}
      <div class="share-qr">
        <QRCode value={shareUrl} size={140} />
        <span>Scan to view</span>
      </div>
    {/if}
  </div>
</Modal>

<style>
  .share-modal {
    display: flex;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .share-actions {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    flex: 1;
    min-width: 180px;
  }

  .share-status {
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.75);
    margin: 0.2rem 0 0;
  }

  .share-qr {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
    min-width: 140px;
  }

  .share-qr span {
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.6);
  }
</style>
