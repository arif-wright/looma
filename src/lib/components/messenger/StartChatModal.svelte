<script lang="ts">
  import { createEventDispatcher, tick } from 'svelte';
  import type { MessengerFriendOption } from './types';

  export let open = false;
  export let loading = false;
  export let error: string | null = null;
  export let friends: MessengerFriendOption[] = [];

  let handle = '';
  let query = '';
  let inputEl: HTMLInputElement | null = null;
  let filteredFriends: MessengerFriendOption[] = [];

  const dispatch = createEventDispatcher<{
    close: void;
    start: { handle: string };
    startFriend: { userId: string };
  }>();

  $: filteredFriends = friends.filter((friend) => {
    const key = `${friend.display_name ?? ''} ${friend.handle ?? ''}`.toLowerCase();
    return key.includes(query.trim().toLowerCase());
  });

  $: if (open) {
    void tick().then(() => inputEl?.focus());
  }

  const close = () => {
    if (loading) return;
    dispatch('close');
  };

  const submit = () => {
    const normalized = handle.trim();
    if (!normalized || loading) return;
    dispatch('start', { handle: normalized });
  };

  const startFriend = (userId: string) => {
    if (loading) return;
    dispatch('startFriend', { userId });
  };

  const onKeydown = (event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      close();
    }
  };

  const friendLabel = (friend: MessengerFriendOption) => {
    if (friend.display_name) return friend.display_name;
    if (friend.handle) return `@${friend.handle}`;
    return friend.id.slice(0, 8);
  };
</script>

{#if open}
  <div class="modal" role="dialog" aria-modal="true" aria-labelledby="start-chat-title" tabindex="-1" on:keydown={onKeydown}>
    <button type="button" class="modal__backdrop" on:click={close} aria-label="Close start chat dialog"></button>
    <div class="modal__panel">
      <h2 id="start-chat-title">Start a chat</h2>

      <section class="friends-picker" aria-label="Friends">
        <label for="friend-search">Friends</label>
        <input id="friend-search" type="search" placeholder="Search friends" bind:value={query} bind:this={inputEl} />

        <ul role="listbox" aria-label="Friend list">
          {#if filteredFriends.length === 0}
            <li class="empty">No matching friends.</li>
          {:else}
            {#each filteredFriends as friend (friend.id)}
              <li>
                <button type="button" class="friend-row" on:click={() => startFriend(friend.id)} disabled={loading}>
                  <span>{friendLabel(friend)}</span>
                  {#if friend.handle}
                    <small>@{friend.handle}</small>
                  {/if}
                </button>
              </li>
            {/each}
          {/if}
        </ul>
      </section>

      <section class="handle-start" aria-label="Start by handle">
        <label for="chat-handle">Or start by handle</label>
        <input
          id="chat-handle"
          type="text"
          placeholder="@handle"
          bind:value={handle}
          on:keydown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              submit();
            }
          }}
        />
      </section>

      {#if error}
        <p class="error" role="status">{error}</p>
      {/if}
      <div class="modal__actions">
        <button type="button" class="ghost" on:click={close} disabled={loading}>Close</button>
        <button type="button" on:click={submit} disabled={loading || handle.trim().length === 0}>
          {loading ? 'Starting...' : 'Start by Handle'}
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal {
    position: fixed;
    inset: 0;
    z-index: 120;
    display: grid;
    place-items: center;
    padding: 1rem;
  }

  .modal__backdrop {
    position: absolute;
    inset: 0;
    background: rgba(2, 6, 23, 0.72);
    border: none;
    padding: 0;
  }

  .modal__panel {
    position: relative;
    width: min(34rem, 100%);
    border-radius: 1rem;
    border: 1px solid rgba(148, 163, 184, 0.24);
    background: #0f172a;
    padding: 1rem;
    animation: pop-in 140ms ease-out;
  }

  h2 {
    margin: 0;
  }

  section {
    margin-top: 0.9rem;
  }

  label {
    font-size: 0.86rem;
    color: rgba(203, 213, 225, 0.88);
  }

  input {
    width: 100%;
    margin-top: 0.35rem;
    border-radius: 0.75rem;
    border: 1px solid rgba(148, 163, 184, 0.25);
    background: rgba(15, 23, 42, 0.86);
    color: #e2e8f0;
    padding: 0.68rem 0.8rem;
  }

  ul {
    list-style: none;
    margin: 0.55rem 0 0;
    padding: 0;
    max-height: 12rem;
    overflow: auto;
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 0.75rem;
  }

  .friend-row {
    width: 100%;
    text-align: left;
    border: none;
    border-top: 1px solid rgba(148, 163, 184, 0.12);
    background: rgba(15, 23, 42, 0.25);
    color: #e2e8f0;
    padding: 0.62rem 0.75rem;
    display: flex;
    justify-content: space-between;
    align-items: center;
    cursor: pointer;
  }

  li:first-child .friend-row {
    border-top: none;
  }

  .friend-row:hover,
  .friend-row:focus-visible {
    background: rgba(56, 189, 248, 0.16);
  }

  small {
    color: rgba(186, 230, 253, 0.84);
  }

  .empty {
    color: rgba(148, 163, 184, 0.9);
    padding: 0.7rem;
    font-size: 0.84rem;
  }

  .error {
    color: #fca5a5;
    margin: 0.65rem 0 0;
    font-size: 0.84rem;
  }

  .modal__actions {
    margin-top: 1rem;
    display: flex;
    justify-content: flex-end;
    gap: 0.6rem;
  }

  button {
    border: none;
    border-radius: 0.7rem;
    background: #22d3ee;
    color: #083344;
    padding: 0.5rem 1rem;
    font-weight: 700;
    cursor: pointer;
  }

  button.ghost {
    background: rgba(148, 163, 184, 0.2);
    color: #e2e8f0;
  }

  button[disabled] {
    opacity: 0.55;
    cursor: default;
  }

  @keyframes pop-in {
    from {
      transform: translateY(8px) scale(0.98);
      opacity: 0;
    }
    to {
      transform: translateY(0) scale(1);
      opacity: 1;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .modal__panel {
      animation: none;
    }
  }
</style>
