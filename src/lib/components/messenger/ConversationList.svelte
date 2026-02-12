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
    if (conversation.peer?.display_name) return conversation.peer.display_name;
    if (conversation.peer?.handle) return `@${conversation.peer.handle}`;
    return conversation.peer?.id ? conversation.peer.id.slice(0, 8) : 'Conversation';
  };

  const subtitleFor = (conversation: MessengerConversation) => {
    if (conversation.blocked) return 'Blocked';
    return conversation.preview ?? 'No messages yet';
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
              <strong>{titleFor(conversation)}</strong>
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
    border-right: 1px solid rgba(148, 163, 184, 0.18);
    display: flex;
    flex-direction: column;
    min-height: 0;
    background: rgba(15, 23, 42, 0.45);
  }

  .conversation-list__header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem;
  }

  h2 {
    margin: 0;
    font-size: 1rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .conversation-list__header button {
    border: 1px solid rgba(125, 211, 252, 0.45);
    background: rgba(14, 116, 144, 0.3);
    color: #e0f2fe;
    border-radius: 999px;
    padding: 0.35rem 0.85rem;
    cursor: pointer;
  }

  .conversation-list__search {
    padding: 0 1rem 1rem;
  }

  .conversation-list__search input {
    width: 100%;
    border-radius: 0.75rem;
    border: 1px solid rgba(148, 163, 184, 0.25);
    background: rgba(15, 23, 42, 0.65);
    color: #e2e8f0;
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
    border-top: 1px solid rgba(148, 163, 184, 0.12);
    padding: 0.8rem 1rem;
    background: transparent;
    color: #e2e8f0;
    cursor: pointer;
  }

  li button:hover,
  li button:focus-visible,
  li button.active {
    background: rgba(56, 189, 248, 0.16);
  }

  .conversation-list__row {
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    align-items: center;
  }

  .conversation-list__meta {
    color: rgba(203, 213, 225, 0.82);
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
    color: rgba(148, 163, 184, 0.95);
  }

  .badge {
    min-width: 1.4rem;
    padding: 0.05rem 0.4rem;
    border-radius: 999px;
    background: #38bdf8;
    color: #082f49;
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
