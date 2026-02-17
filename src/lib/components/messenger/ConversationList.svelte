<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { MessengerConversation } from './types';

  export let conversations: MessengerConversation[] = [];
  export let activeConversationId: string | null = null;
  export let query = '';

  const dispatch = createEventDispatcher<{
    select: { conversationId: string };
    create: void;
    query: { value: string };
  }>();

  const formatTime = (iso: string | null) => {
    if (!iso) return '';
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return '';
    return new Intl.DateTimeFormat(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    }).format(date);
  };

  const titleFor = (conversation: MessengerConversation) => {
    if (conversation.type === 'group' && conversation.group_name) return conversation.group_name;
    if (conversation.peer?.display_name) return conversation.peer.display_name;
    if (conversation.peer?.handle) return `@${conversation.peer.handle}`;
    return conversation.peer?.id ? conversation.peer.id.slice(0, 8) : 'Conversation';
  };

  const subtitleFor = (conversation: MessengerConversation) => {
    if (conversation.blocked) return 'Blocked';
    return conversation.preview ?? 'No messages yet';
  };

  const presenceClass = (conversation: MessengerConversation) => {
    const status = conversation.peer?.presence?.status ?? null;
    if (status === 'online') return 'online';
    if (status === 'away') return 'away';
    if (status === 'offline') return 'offline';
    return 'hidden';
  };
</script>

<section class="conversation-list" aria-label="Conversations">
  <div class="conversation-list__header">
    <h2>Messages</h2>
    <button type="button" on:click={() => dispatch('create')}>New</button>
  </div>

  <label class="conversation-list__search">
    <span class="sr-only">Search conversations</span>
    <input
      type="search"
      placeholder="Search"
      value={query}
      on:input={(event) => dispatch('query', { value: (event.currentTarget as HTMLInputElement).value })}
    />
  </label>

  <ul class="conversation-list__items" role="listbox" aria-label="Conversation list">
    {#if conversations.length === 0}
      <li class="conversation-list__empty">No conversations yet.</li>
    {:else}
      {#each conversations as conversation (conversation.conversationId)}
        <li>
          <button
            type="button"
            role="option"
            class:active={conversation.conversationId === activeConversationId}
            aria-selected={conversation.conversationId === activeConversationId}
            on:click={() => dispatch('select', { conversationId: conversation.conversationId })}
          >
            <div class="conversation-list__row">
              <strong class="name-row">
                <span>{titleFor(conversation)}</span>
                {#if conversation.peer?.presence}
                  <span class={`presence-dot ${presenceClass(conversation)}`} aria-label={`Status ${conversation.peer.presence.status}`}></span>
                {/if}
              </strong>
              <time datetime={conversation.last_message_at ?? undefined}>{formatTime(conversation.last_message_at)}</time>
            </div>
            <div class="conversation-list__row conversation-list__meta">
              <span>{subtitleFor(conversation)}</span>
              {#if conversation.unreadCount > 0}
                <span class="badge" aria-label={`${conversation.unreadCount} unread`}>
                  {conversation.unreadCount > 99 ? '99+' : conversation.unreadCount}
                </span>
              {/if}
            </div>
          </button>
        </li>
      {/each}
    {/if}
  </ul>
</section>

<style>
  .conversation-list {
    border-right: 1px solid rgba(191, 210, 238, 0.26);
    display: flex;
    flex-direction: column;
    min-height: 0;
    background:
      linear-gradient(182deg, rgba(18, 31, 70, 0.88), rgba(12, 21, 49, 0.9)),
      radial-gradient(circle at 8% -8%, rgba(112, 188, 255, 0.14), transparent 48%);
  }

  .conversation-list__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
  }

  h2 {
    margin: 0;
    font-family: var(--san-font-display);
    font-size: 0.95rem;
    letter-spacing: 0.11em;
    text-transform: uppercase;
    color: rgba(236, 243, 253, 0.92);
  }

  .conversation-list__header button {
    border: 1px solid rgba(208, 225, 247, 0.42);
    background: linear-gradient(130deg, rgba(94, 181, 255, 0.92), rgba(140, 120, 247, 0.92));
    color: rgba(10, 20, 44, 0.95);
    border-radius: 999px;
    padding: 0.4rem 0.9rem;
    font-weight: 700;
    cursor: pointer;
  }

  .conversation-list__search {
    padding: 0 1rem 1rem;
  }

  .conversation-list__search input {
    width: 100%;
    border-radius: 0.95rem;
    border: 1px solid rgba(194, 212, 238, 0.3);
    background: rgba(15, 26, 56, 0.72);
    color: rgba(235, 242, 252, 0.96);
    padding: 0.65rem 0.8rem;
  }

  .conversation-list__items {
    list-style: none;
    margin: 0;
    padding: 0;
    overflow: auto;
  }

  .conversation-list__empty {
    padding: 1rem;
    color: rgba(203, 213, 225, 0.8);
  }

  li button {
    width: 100%;
    text-align: left;
    border: none;
    border-top: 1px solid rgba(186, 204, 232, 0.15);
    padding: 0.9rem 1rem;
    background: transparent;
    color: rgba(233, 241, 252, 0.95);
    cursor: pointer;
    transition: background 220ms var(--san-ease-out);
  }

  li button:hover,
  li button:focus-visible,
  li button.active {
    background: linear-gradient(105deg, rgba(97, 173, 255, 0.2), rgba(123, 118, 243, 0.16));
  }

  .conversation-list__row {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    align-items: center;
  }

  .conversation-list__meta {
    color: rgba(201, 216, 238, 0.82);
    font-size: 0.84rem;
    margin-top: 0.35rem;
  }

  .conversation-list__meta span:first-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  time {
    font-size: 0.74rem;
    color: rgba(184, 202, 230, 0.84);
  }

  .name-row {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
  }

  .presence-dot {
    width: 0.54rem;
    height: 0.54rem;
    border-radius: 50%;
    border: 1px solid rgba(226, 232, 240, 0.6);
    display: inline-block;
  }

  .presence-dot.online {
    background: #22c55e;
  }

  .presence-dot.away {
    background: #eab308;
  }

  .presence-dot.offline {
    background: #64748b;
  }

  .badge {
    min-width: 1.4rem;
    padding: 0.05rem 0.4rem;
    border-radius: 999px;
    background: linear-gradient(130deg, rgba(97, 184, 255, 0.96), rgba(146, 126, 250, 0.92));
    color: rgba(8, 20, 43, 0.95);
    font-weight: 700;
    text-align: center;
    font-size: 0.75rem;
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }
</style>
