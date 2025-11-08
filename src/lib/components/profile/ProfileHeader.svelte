<script lang="ts">
  import { createEventDispatcher, onDestroy } from 'svelte';
  import Panel from '$lib/components/ui/Panel.svelte';
  import { formatJoined } from '$lib/format/date';

  const fallbackAvatar = '/avatar.svg';

  export let displayName: string | null = null;
  export let handle = 'player';
  export let avatarUrl: string | null = null;
  export let bannerUrl: string | null = null;
  export let joinedAt: string | null = null;
  export let isOwner = false;
  export let isPrivate = false;
  export let level: number | null = null;

  const dispatch = createEventDispatcher<{ edit: void }>();

  let copied = false;
  let copyTimer: ReturnType<typeof setTimeout> | null = null;

  $: joinedLabel = formatJoined(joinedAt);
  $: avatarSrc = avatarUrl ?? fallbackAvatar;
  $: titleChip = level !== null && Number.isFinite(level) ? `Level ${level}` : 'Explorer';
  $: bannerStyle = bannerUrl ? `background-image: url("${bannerUrl}")` : '';

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

  onDestroy(() => {
    if (copyTimer) clearTimeout(copyTimer);
  });
</script>

<section class="profile-header" data-private={isPrivate}>
  <div class={`banner ${bannerUrl ? 'has-image' : 'gradient'}`} style={bannerStyle} aria-hidden="true"></div>

  <div class="sticky-identity">
    <div class="sticky-chip panel-glass">
      <img src={avatarSrc} alt="" width="32" height="32" />
      <span>{displayName || '@' + handle}</span>
    </div>
  </div>

  <div class="header-card">
    <Panel className="profile-card panel-glass">
      <div class="card-inner">
        <div class="avatar-wrap">
          <span class="pulse-ring"></span>
          <img
            src={avatarSrc}
            alt={`Avatar for ${displayName ?? handle}`}
            class="avatar"
            loading="lazy"
            decoding="async"
          />
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
          {#if joinedLabel}
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

  .banner {
    width: 100%;
    aspect-ratio: 3 / 1;
    border-radius: 32px;
    background: linear-gradient(135deg, rgba(8, 12, 24, 0.95), rgba(18, 7, 32, 0.88));
    border: 1px solid rgba(255, 255, 255, 0.08);
    overflow: hidden;
  }

  .gradient {
    background-image: radial-gradient(circle at 20% 20%, rgba(94, 242, 255, 0.4), transparent 55%),
      radial-gradient(circle at 80% 0%, rgba(155, 92, 255, 0.25), transparent 45%);
  }

  .banner.has-image {
    background-size: cover;
    background-position: center;
  }

  .sticky-identity {
    position: sticky;
    top: calc(env(safe-area-inset-top, 0px) + 56px);
    z-index: 10;
    display: flex;
    justify-content: flex-end;
    padding: 0 1.25rem;
    pointer-events: none;
  }

  .sticky-chip {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.35rem 0.8rem;
    border-radius: 999px;
    font-size: 0.85rem;
    pointer-events: auto;
  }

  .sticky-chip img {
    width: 28px;
    height: 28px;
    border-radius: 999px;
    object-fit: cover;
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

  .avatar {
    width: 100%;
    height: 100%;
    border-radius: 32px;
    object-fit: cover;
    border: 2px solid rgba(94, 242, 255, 0.45);
    box-shadow: 0 20px 40px rgba(5, 6, 18, 0.55);
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
