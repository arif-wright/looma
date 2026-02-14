<script lang="ts">
  import { goto } from '$app/navigation';
  import AvatarImage from '$lib/components/ui/AvatarImage.svelte';

  export let user_id: string;
  export let profile: { handle: string; display_name: string; avatar_url?: string | null };
  export let mutuals = 0;
  export let shared_following = 0;
  export let popularity = 0;
  export let onFollow: (id: string) => Promise<void> | void;

  let pending = false;
  const displayName = () => profile.display_name?.trim() || profile.handle || 'Explorer';
  const handleLabel = () => profile.handle ?? 'unknown';

  const contextLabel = () => {
    if (mutuals > 0) {
      return `${mutuals} mutual ${mutuals === 1 ? 'connection' : 'connections'}`;
    }
    if (shared_following > 0) {
      return `Shares ${shared_following} following${shared_following === 1 ? '' : 's'}`;
    }
    if (popularity > 0) {
      return 'Popular on Looma';
    }
    return 'New explorer';
  };

  async function handleFollow() {
    if (pending) return;
    pending = true;
    try {
      await onFollow(user_id);
    } finally {
      pending = false;
    }
  }

  const profileHref = () => {
    const handle = profile.handle?.trim();
    return handle ? `/app/u/${encodeURIComponent(handle)}` : null;
  };

  function handleCardClick(event: MouseEvent) {
    const target = event.target as HTMLElement | null;
    if (target?.closest('button')) return;
    const href = profileHref();
    if (!href) return;
    void goto(href);
  }

  function handleCardKeydown(event: KeyboardEvent) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    if ((event.target as HTMLElement | null)?.closest('button')) return;
    const href = profileHref();
    if (!href) return;
    event.preventDefault();
    void goto(href);
  }
</script>

<div
  class="rec-card"
  data-testid="people-to-follow-item"
  data-user-id={user_id}
  role="button"
  tabindex="0"
  on:click={handleCardClick}
  on:keydown={handleCardKeydown}
>
  <AvatarImage
    src={profile.avatar_url ?? '/avatars/default.png'}
    name={profile.display_name}
    handle={profile.handle}
    alt={displayName()}
    className="rec-avatar"
    loading="lazy"
  />
  <div class="rec-details">
    <div class="rec-name" data-testid="people-to-follow-name">{displayName()}</div>
    <div class="rec-handle">@{handleLabel()}</div>
    <div class="rec-context">{contextLabel()}</div>
  </div>
  <button
    type="button"
    class="rec-action"
    on:click={handleFollow}
    disabled={pending}
  >
    {pending ? 'Following…' : 'Follow'}
  </button>
</div>

<style>
  .rec-card {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.85rem;
    border-radius: 1rem;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.08);
    transition: background 150ms ease, border 150ms ease;
  }

  .rec-card:hover {
    background: rgba(255, 255, 255, 0.07);
    border-color: rgba(255, 255, 255, 0.15);
  }

  :global(.rec-avatar) {
    width: 44px;
    height: 44px;
    border-radius: 999px;
    object-fit: cover;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
  }

  .rec-details {
    flex: 1;
    min-width: 0;
  }

  .rec-name {
    font-weight: 600;
    color: #fff;
    font-size: 0.95rem;
    line-height: 1.2;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .rec-handle {
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.6);
  }

  .rec-context {
    margin-top: 0.15rem;
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.55);
  }

  .rec-action {
    padding: 0.3rem 1rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.16);
    color: #fff;
    font-size: 0.85rem;
    font-weight: 600;
    transition: background 150ms ease;
  }

  .rec-action:not(:disabled):hover {
    background: rgba(255, 255, 255, 0.2);
  }

  .rec-action:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
</style>
