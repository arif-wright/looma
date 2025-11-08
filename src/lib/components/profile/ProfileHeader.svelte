<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import Panel from '$lib/components/ui/Panel.svelte';
  import { formatJoined } from '$lib/format/date';
  import AvatarUploader from '$lib/components/profile/AvatarUploader.svelte';
  import BannerUploader from '$lib/components/profile/BannerUploader.svelte';

  export let displayName: string | null = null;
  export let handle = 'player';
  export let avatarUrl: string | null = null;
  export let bannerUrl: string | null = null;
  export let joinedAt: string | null = null;
  export let showJoined = true;
  export let isOwner = false;
  export let isPrivate = false;
  export let level: number | null = null;

  const dispatch = createEventDispatcher<{
    edit: void;
    avatarChange: { url: string };
    bannerChange: { url: string };
  }>();

  let copied = false;
  let copyTimer: ReturnType<typeof setTimeout> | null = null;

  $: joinedLabel = formatJoined(joinedAt);
  $: titleChip = level !== null && Number.isFinite(level) ? `Level ${level}` : 'Explorer';

  function handleCopy() {
    if (copyTimer) clearTimeout(copyTimer);
    navigator?.clipboard
      ?.writeText(`@${handle}`)
      .then(() => {
        copied = true;
        copyTimer = setTimeout(() => (copied = false), 1500);
      })
      .catch(() => {
        copied = true;
        copyTimer = setTimeout(() => (copied = false), 1500);
      });
  }

  function handleEdit() {
    dispatch('edit');
  }

  function handleAvatarChanged(event: CustomEvent<{ url: string }>) {
    dispatch('avatarChange', { url: event.detail.url });
  }

  function handleBannerChanged(event: CustomEvent<{ url: string }>) {
    dispatch('bannerChange', { url: event.detail.url });
  }

  onDestroy(() => {
    if (copyTimer) clearTimeout(copyTimer);
  });
</script>

<section class="profile-header" data-private={isPrivate}>
  <BannerUploader url={bannerUrl} editable={isOwner} on:changed={handleBannerChanged} />

  <div class="header-card">
    <Panel className="profile-card panel-glass">
      <div class="card-inner">
        <div class="avatar-wrap">
          <span class="pulse-ring"></span>
          <AvatarUploader url={avatarUrl} editable={isOwner} on:changed={handleAvatarChanged} />
        </div>
        <div class="identity">
          <div class="headline">
            <h1>{displayName || 'Anonymous Explorer'}</h1>
            {#if isOwner}
              <button type="button" class="edit-btn" on:click={handleEdit}>Edit profile</button>
            {/if}
          </div>
          <div class="handle-row">
            <button type="button" class="handle-chip" on:click={handleCopy}>
              @{handle}
              <span class="copy-status">{copied ? 'Copied' : 'Tap to copy'}</span>
            </button>
            <span class="title-chip">{titleChip}</span>
            {#if isPrivate}
              <span class="privacy-chip">Private</span>
            {/if}
          </div>
          {#if showJoined && joinedLabel}
            <p class="meta">Joined {joinedLabel}</p>
          {/if}
        </div>
      </div>
    </Panel>
  </div>
</section>

<style>
  .profile-header {
    position: relative;
    display: grid;
    gap: 0;
  }

  .header-card {
    position: relative;
    margin-top: -80px;
    padding: 0 1rem;
  }

  :global(.profile-card) {
    max-width: 960px;
    margin: 0 auto;
  }

  .card-inner {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 1.5rem;
    align-items: center;
  }

  .avatar-wrap {
    position: relative;
    width: 140px;
    height: 140px;
  }

  .pulse-ring {
    position: absolute;
    inset: -8px;
    border-radius: 40px;
    border: 1px solid rgba(94, 242, 255, 0.3);
    animation: pulse 3s ease-in-out infinite;
    pointer-events: none;
  }

  .identity {
    display: grid;
    gap: 0.6rem;
  }

  .headline {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
  }

  h1 {
    margin: 0;
    font-size: clamp(1.6rem, 4vw, 2.4rem);
  }

  .handle-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.6rem;
    align-items: center;
  }

  .handle-chip {
    display: inline-flex;
    gap: 0.35rem;
    align-items: center;
    padding: 0.35rem 0.8rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.05);
    color: inherit;
    cursor: pointer;
  }

  .copy-status {
    font-size: 0.75rem;
    opacity: 0.7;
  }

  .title-chip,
  .privacy-chip {
    padding: 0.35rem 0.9rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.16);
    font-size: 0.78rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .privacy-chip {
    border-color: rgba(255, 207, 106, 0.6);
  }

  .meta {
    margin: 0;
    font-size: 0.9rem;
    color: rgba(255, 255, 255, 0.75);
  }

  .edit-btn {
    padding: 0.45rem 1.4rem;
    border-radius: 999px;
    border: 1px solid rgba(94, 242, 255, 0.45);
    background: linear-gradient(120deg, rgba(94, 242, 255, 0.15), rgba(155, 92, 255, 0.15));
    color: inherit;
    cursor: pointer;
  }

  @media (max-width: 720px) {
    .banner {
      border-radius: 20px;
    }

    .header-card {
      margin-top: -70px;
      padding: 0;
    }

    .card-inner {
      grid-template-columns: 1fr;
      text-align: left;
    }

    .avatar-wrap {
      width: 110px;
      height: 110px;
      justify-self: center;
    }
  }

  @keyframes pulse {
    0% {
      transform: scale(0.95);
      opacity: 0.4;
    }
    50% {
      transform: scale(1.05);
      opacity: 0.8;
    }
    100% {
      transform: scale(0.95);
      opacity: 0.4;
    }
  }
</style>
