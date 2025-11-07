<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import Panel from '$lib/components/ui/Panel.svelte';
  import { formatJoined } from '$lib/format/date';

  const fallbackAvatar = '/avatar.svg';

  export let displayName: string | null = null;
  export let handle = 'player';
  export let avatarUrl: string | null = null;
  export let bannerUrl: string | null = null;
  export let joinedAt: string | Date | null = null;
  export let isOwner = false;
  export let isPrivate = false;

  const dispatch = createEventDispatcher<{ edit: void }>();

  $: nameLabel = displayName?.trim() || (handle ? `@${handle}` : 'Player');
  $: joinedLabel = formatJoined(joinedAt);
  $: bannerStyle = bannerUrl ? `background-image: url("${bannerUrl}")` : '';
  $: avatarSrc = avatarUrl || fallbackAvatar;

  function handleEdit() {
    dispatch('edit');
  }
</script>

<section class="profile-header" data-private={isPrivate}>
  <div
    class={`banner ${bannerUrl ? 'has-image' : 'bg-brand-gradient panel-glass'}`}
    style={bannerStyle}
    aria-hidden="true"
  ></div>

  <div class="header-card">
    <Panel className="profile-card panel-glass">
      <div class="card-inner">
        <div class="identity">
          <div class="avatar-wrap">
            <img
              src={avatarSrc}
              alt={`Avatar for ${nameLabel}`}
              class="avatar"
              loading="lazy"
              decoding="async"
            />
          </div>
          <div class="identity-text">
            <p class="handle">@{handle}</p>
            <h1>{displayName || 'Anonymous Explorer'}</h1>
            <p class="meta">
              <span>{joinedLabel}</span>
              {#if isPrivate}
                <span class="badge">Private</span>
              {/if}
            </p>
          </div>
        </div>
        {#if isOwner}
          <button type="button" class="edit-btn" on:click={handleEdit}>
            Edit profile
          </button>
        {/if}
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
    background: linear-gradient(135deg, rgba(8, 12, 24, 0.9), rgba(18, 7, 32, 0.85));
    border: 1px solid var(--brand-panel-border, rgba(255, 255, 255, 0.1));
    box-shadow: var(--brand-panel-shadow, 0 32px 46px rgba(6, 9, 26, 0.45));
    overflow: hidden;
  }

  .banner.has-image {
    background-size: cover;
    background-position: center;
    box-shadow: inset 0 0 60px rgba(0, 0, 0, 0.4);
  }

  .header-card {
    position: relative;
    margin-top: -70px;
    padding: 0 1rem;
  }

  :global(.profile-card) {
    max-width: 960px;
    margin: 0 auto;
  }

  .card-inner {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    align-items: flex-start;
  }

  .identity {
    display: flex;
    gap: 1.25rem;
    align-items: center;
    width: 100%;
  }

  .avatar-wrap {
    position: relative;
    width: 104px;
    height: 104px;
    flex-shrink: 0;
    margin-top: -32px;
  }

  .avatar {
    width: 100%;
    height: 100%;
    border-radius: 26px;
    border: 2px solid rgba(94, 242, 255, 0.3);
    background: rgba(255, 255, 255, 0.05);
    object-fit: cover;
    box-shadow: 0 16px 36px rgba(0, 0, 0, 0.45);
  }

  .identity-text {
    flex: 1;
  }

  h1 {
    margin: 0;
    font-size: clamp(1.5rem, 4vw, 2.25rem);
    font-weight: 600;
  }

  .handle {
    margin: 0 0 0.1rem;
    text-transform: lowercase;
    color: rgba(255, 255, 255, 0.75);
    font-size: 0.95rem;
  }

  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin: 0.35rem 0 0;
    color: rgba(255, 255, 255, 0.75);
    font-size: 0.9rem;
  }

  .badge {
    padding: 0.15rem 0.65rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.2);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .edit-btn {
    align-self: flex-start;
    padding: 0.6rem 1.4rem;
    border-radius: 999px;
    border: 1px solid rgba(94, 242, 255, 0.45);
    background: linear-gradient(135deg, rgba(94, 242, 255, 0.15), rgba(155, 92, 255, 0.2));
    color: #fff;
    font-weight: 600;
    cursor: pointer;
    transition: transform 150ms ease, box-shadow 150ms ease, border-color 150ms ease;
  }

  .edit-btn:hover,
  .edit-btn:focus-visible {
    border-color: rgba(94, 242, 255, 0.8);
    box-shadow: 0 8px 16px rgba(94, 242, 255, 0.25);
    outline: none;
  }

  .edit-btn:active {
    transform: scale(0.98);
  }

  @media (max-width: 720px) {
    .banner {
      border-radius: 20px;
    }

    .header-card {
      margin-top: -60px;
      padding: 0;
    }

    .identity {
      flex-direction: column;
      align-items: flex-start;
    }

    .avatar-wrap {
      width: 96px;
      height: 96px;
      margin-top: -48px;
    }

    .edit-btn {
      width: 100%;
      text-align: center;
    }
  }
</style>
