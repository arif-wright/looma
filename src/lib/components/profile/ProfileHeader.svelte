<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import { formatJoined } from '$lib/format/date';
  import Modal from '$lib/components/ui/Modal.svelte';
  import QRCode from '$lib/components/ui/QRCode.svelte';
  import FollowListModal from '$lib/components/profile/FollowListModal.svelte';
  import ReportModal from '$lib/components/modals/ReportModal.svelte';

  type FollowCounts = { followers: number; following: number };

  export let profile: Record<string, any> | null = null;
  export let coverUrl: string | null = null;
  export let avatarUrl: string | null = null;
  export let canEdit = false;
  export let canShare = false;
  export let shareUrl: string | null = null;
  export let isOwnProfile = false;
  export let isFollowing = false;
  export let requested = false;
  export let gated = false;
  export let followCounts: FollowCounts = { followers: 0, following: 0 };
  export let viewerCanFollow = false;
  export let blocked = false;
  export let showBondGenesisCta = false;

  const dispatch = createEventDispatcher<{ edit: void; share: void }>();

  let compact = false;
  let scrollHandler: ((event: Event) => void) | null = null;
  let shareOpen = false;
  let shareStatus = '';
  let downloading = false;
let followPending = false;
let followError = '';
let followListOpen = false;
let followListKind: 'followers' | 'following' = 'followers';
let targetUserId: string | null = null;
let showFollowButton = false;
let followingState = isFollowing;
let lastFollowingProp = isFollowing;
let requestedState = requested;
let lastRequestedProp = requested;
let countsState: FollowCounts = {
  followers: followCounts?.followers ?? 0,
  following: followCounts?.following ?? 0
};
let lastCountsProp: FollowCounts = followCounts;
let requestPending = false;
let gatedState = gated;
let lastGatedProp = gated;
let menuOpen = false;
let blockPending = false;
let menuError = '';
let reportOpen = false;

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

$: targetUserId =
  typeof profile?.user_id === 'string'
    ? profile.user_id
    : typeof profile?.id === 'string'
      ? profile.id
      : null;
$: showFollowButton = Boolean(!isOwnProfile && viewerCanFollow && targetUserId && !blocked);
  $: if (!targetUserId && followListOpen) {
    followListOpen = false;
  }
$: if (isFollowing !== lastFollowingProp) {
  lastFollowingProp = isFollowing;
  followingState = isFollowing;
}
$: if (requested !== lastRequestedProp) {
  lastRequestedProp = requested;
  requestedState = requested;
}
$: if (followCounts !== lastCountsProp) {
  lastCountsProp = followCounts;
  countsState = {
    followers: followCounts?.followers ?? 0,
    following: followCounts?.following ?? 0
  };
}
$: if (gated !== lastGatedProp) {
  lastGatedProp = gated;
  gatedState = gated;
}

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

async function requestFollow() {
  if (!showFollowButton || !targetUserId || requestPending || requestedState) return;
  requestPending = true;
  followError = '';
  try {
    const res = await fetch('/api/privacy/follow-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: targetUserId })
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.error ?? 'Unable to send follow request');
    }
    requestedState = true;
  } catch (err) {
    console.error('[ProfileHeader] follow request failed', err);
    followError = err instanceof Error ? err.message : 'Unable to send follow request';
  } finally {
    requestPending = false;
  }
}

async function toggleFollow() {
  if (!showFollowButton || !targetUserId || followPending) return;
  followPending = true;
  followError = '';
  const action = followingState ? 'unfollow' : 'follow';
  try {
    const res = await fetch('/api/follow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: targetUserId, action })
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.error ?? 'Unable to update follow status');
    }
    const nextState = !followingState;
    const delta = nextState ? 1 : -1;
    followingState = nextState;
    countsState = {
      ...countsState,
      followers: Math.max(0, countsState.followers + delta)
    };
    if (nextState) {
      gatedState = false;
      requestedState = false;
    }
  } catch (err) {
    console.error('[ProfileHeader] follow toggle failed', err);
    followError = err instanceof Error ? err.message : 'Unable to update follow status';
  } finally {
    followPending = false;
  }
}

function toggleMenu() {
  menuOpen = !menuOpen;
  menuError = '';
}

async function blockUser() {
  if (!targetUserId || blockPending) return;
  blockPending = true;
  menuError = '';
  try {
    const res = await fetch('/api/safety/block', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: targetUserId })
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.error ?? 'Unable to block user');
    }
    window.location.reload();
  } catch (err) {
    console.error('[ProfileHeader] block failed', err);
    menuError = err instanceof Error ? err.message : 'Unable to block user';
  } finally {
    blockPending = false;
  }
}

async function unblockUser() {
  if (!targetUserId || blockPending) return;
  blockPending = true;
  menuError = '';
  try {
    const res = await fetch('/api/safety/unblock', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: targetUserId })
    });
    if (!res.ok) {
      const payload = await res.json().catch(() => null);
      throw new Error(payload?.error ?? 'Unable to unblock user');
    }
    window.location.reload();
  } catch (err) {
    console.error('[ProfileHeader] unblock failed', err);
    menuError = err instanceof Error ? err.message : 'Unable to unblock user';
  } finally {
    blockPending = false;
  }
}

function openReport() {
  if (!targetUserId) return;
  reportOpen = true;
  menuOpen = false;
  menuError = '';
}

  function openFollowList(kind: 'followers' | 'following') {
    if (!targetUserId) return;
    followListKind = kind;
    followListOpen = true;
  }

  function closeFollowList() {
    followListOpen = false;
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
            <div class="follow-counts flex items-center gap-4 text-white/80 text-sm">
              <button
                type="button"
                class="follow-count-btn"
                class:dimmed={gatedState && !followingState && !isOwnProfile}
                data-testid="profile-followers-count"
                on:click={() => openFollowList('followers')}
                disabled={!targetUserId}
              >
                <span class="count-value">{countsState.followers}</span>
                Followers
              </button>
              <button
                type="button"
                class="follow-count-btn"
                class:dimmed={gatedState && !followingState && !isOwnProfile}
                data-testid="profile-following-count"
                on:click={() => openFollowList('following')}
                disabled={!targetUserId}
              >
                <span class="count-value">{countsState.following}</span>
                Following
              </button>
            </div>
          </div>
        </div>
        {#if canEdit || canShare || showFollowButton || (!isOwnProfile && targetUserId)}
          <div class="action-group self-end md:self-start">
            <div class="flex items-center gap-2">
              {#if showFollowButton}
                {#if gatedState}
                  <button
                    class="px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 ring-1 ring-white/15 focus:outline-none focus:ring-2 focus:ring-cyan-400/60 transition disabled:opacity-60"
                    type="button"
                    data-testid="profile-follow-request"
                    on:click={requestFollow}
                    disabled={requestedState || requestPending}
                  >
                    {#if requestPending}
                      Working…
                    {:else}
                      {requestedState ? 'Requested' : 'Request to follow'}
                    {/if}
                  </button>
                {:else}
                  <button
                    class="px-4 py-2 rounded-full bg-white/10 hover:bg-white/15 ring-1 ring-white/15 focus:outline-none focus:ring-2 focus:ring-cyan-400/60 transition disabled:opacity-60"
                    type="button"
                    data-testid="profile-follow-toggle"
                    on:click={toggleFollow}
                    disabled={followPending}
                  >
                    {#if followPending}
                      Working…
                    {:else}
                      {followingState ? 'Following' : 'Follow'}
                    {/if}
                  </button>
                {/if}
              {/if}
              {#if canShare}
                <button class="btn-ghost" type="button" on:click={handleShare}>Share</button>
              {/if}
              {#if canEdit}
                <button class="btn-ghost" type="button" on:click={handleEdit}>Edit profile</button>
              {/if}
              {#if isOwnProfile && showBondGenesisCta}
                <a class="bond-cta" href="/app/onboarding/companion">Find your first bond</a>
              {/if}
              {#if !isOwnProfile && targetUserId}
                <div class="menu-wrap">
                  <button
                    class="btn-ghost icon"
                    type="button"
                    aria-haspopup="true"
                    aria-expanded={menuOpen}
                    on:click={toggleMenu}
                  >
                    ⋯
                  </button>
                  {#if menuOpen}
                    <div class="menu-panel" role="menu">
                      {#if blocked}
                        <button type="button" class="menu-item" on:click={unblockUser} disabled={blockPending}>
                          {blockPending ? 'Working…' : 'Unblock user'}
                        </button>
                      {:else}
                        <button type="button" class="menu-item" on:click={blockUser} disabled={blockPending}>
                          {blockPending ? 'Working…' : 'Block user'}
                        </button>
                      {/if}
                      <button type="button" class="menu-item" on:click={openReport}>
                        Report profile…
                      </button>
                    </div>
                  {/if}
                </div>
              {/if}
            </div>
          </div>
          {#if followError && showFollowButton}
            <p class="follow-error" aria-live="polite">{followError}</p>
          {/if}
          {#if menuError}
            <p class="follow-error" aria-live="polite">{menuError}</p>
          {/if}
        {/if}
      </div>
      {#if blocked && !isOwnProfile}
        <p class="blocked-note">You’ve blocked this user. You won’t see each other’s updates until you unblock them.</p>
      {/if}

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

<FollowListModal open={followListOpen} userId={targetUserId} kind={followListKind} onClose={closeFollowList} />
<ReportModal bind:open={reportOpen} targetKind="profile" targetId={targetUserId} />

<style>
  .follow-counts {
    margin-top: 0.75rem;
  }

  .follow-count-btn {
    display: inline-flex;
    align-items: baseline;
    gap: 0.4rem;
    color: inherit;
    background: transparent;
    border: none;
    padding: 0;
    font: inherit;
    cursor: pointer;
    transition: color 150ms ease;
  }

  .follow-count-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .follow-count-btn:not(:disabled):hover {
    color: rgba(255, 255, 255, 0.95);
  }

  .follow-count-btn.dimmed {
    opacity: 0.45;
  }

  .count-value {
    font-weight: 600;
  }

  .follow-error {
    margin-top: 0.35rem;
    font-size: 0.78rem;
    color: #f87171;
    text-align: right;
  }

  .blocked-note {
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.7);
  }

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

  .menu-wrap {
    position: relative;
  }

  .bond-cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.5rem 1.1rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    background: rgba(255, 255, 255, 0.08);
    color: rgba(255, 255, 255, 0.95);
    font-size: 0.9rem;
    font-weight: 500;
    text-decoration: none;
    transition: background 160ms ease, box-shadow 160ms ease;
  }

  .bond-cta:hover {
    background: rgba(255, 255, 255, 0.16);
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  }

  .btn-ghost.icon {
    width: 2.2rem;
    height: 2.2rem;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 1.4rem;
  }

  .menu-panel {
    position: absolute;
    right: 0;
    top: calc(100% + 0.25rem);
    background: rgba(15, 18, 28, 0.95);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.75rem;
    padding: 0.2rem;
    min-width: 10rem;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.35);
    z-index: 20;
  }

  .menu-item {
    display: block;
    width: 100%;
    text-align: left;
    padding: 0.55rem 0.8rem;
    border-radius: 0.6rem;
    background: transparent;
    color: rgba(255, 255, 255, 0.9);
    font-size: 0.9rem;
  }

  .menu-item:hover {
    background: rgba(255, 255, 255, 0.08);
  }
</style>
