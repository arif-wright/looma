<script lang="ts">
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import MessageBubble from './MessageBubble.svelte';
  import type { MessageReactionSummary, MessengerMessage, ModerationBadgeStatus } from './types';

  export let messages: MessengerMessage[] = [];
  export let currentUserId: string | null = null;
  export let blocked = false;
  export let viewerCanModerate = false;
  export let moderationByUserId: Record<string, { status: ModerationBadgeStatus; until: string | null }> = {};
  export let reactionsByMessageId: Record<string, MessageReactionSummary[]> = {};
  export let loading = false;
  export let title = 'Select a conversation';
  export let presenceLabel: string | null = null;
  export let typingLabel: string | null = null;
  export let seenLabel: string | null = null;

  const dispatch = createEventDispatcher<{
    report: { messageId: string };
    react: { messageId: string; emoji: '👍' | '❤️' | '😂' | '😮' | '😢' | '🔥'; action: 'add' | 'remove' };
    edit: { messageId: string; body: string };
    delete: { messageId: string };
    openMedia: { messageId: string; attachmentId: string };
  }>();

  let scroller: HTMLDivElement | null = null;

  const scrollToBottom = async () => {
    await tick();
    if (!scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
  };

  const isEditable = (message: MessengerMessage) => {
    if (message.sender_id !== currentUserId) return false;
    if (message.deleted_at) return false;
    const createdMs = Date.parse(message.created_at);
    if (!Number.isFinite(createdMs)) return false;
    return Date.now() - createdMs <= 10 * 60 * 1000;
  };

  const isDeletable = (message: MessengerMessage) => {
    if (message.deleted_at) return false;
    return message.sender_id === currentUserId;
  };

  $: if (messages.length) {
    void scrollToBottom();
  }

  onMount(() => {
    void scrollToBottom();
  });
</script>

<section class="thread" aria-label="Chat thread">
  <header>
    <h2>{title}</h2>
    {#if presenceLabel}
      <p class="presence" role="status">{presenceLabel}</p>
    {/if}
    {#if typingLabel}
      <p class="typing" role="status">{typingLabel}</p>
    {/if}
    {#if blocked}
      <p role="status">You can’t message this user.</p>
    {/if}
  </header>

  <div class="thread__messages" bind:this={scroller} role="log" aria-live="polite" aria-relevant="additions text">
    {#if loading}
      <p class="thread__state">Loading messages…</p>
    {:else if messages.length === 0}
      <p class="thread__state">No messages yet.</p>
    {:else}
      {#each messages as message (message.id)}
        <div class={`thread__line ${message.sender_id === currentUserId ? 'own' : ''}`}>
          <MessageBubble
            {message}
            reactions={reactionsByMessageId[message.id] ?? []}
            canEdit={isEditable(message)}
            canDelete={isDeletable(message)}
            isOwn={message.sender_id === currentUserId}
            moderationStatus={viewerCanModerate ? (moderationByUserId[message.sender_id]?.status ?? 'active') : 'active'}
            on:report={(event) => dispatch('report', event.detail)}
            on:react={(event) => dispatch('react', event.detail)}
            on:edit={(event) => dispatch('edit', event.detail)}
            on:delete={(event) => dispatch('delete', event.detail)}
            on:openMedia={(event) => dispatch('openMedia', event.detail)}
          />
        </div>
      {/each}
    {/if}
  </div>

  {#if seenLabel}
    <p class="seen" role="status">{seenLabel}</p>
  {/if}

  <slot name="composer" />
</section>

<style>
  .thread {
    display: grid;
    grid-template-rows: auto 1fr auto auto;
    min-height: 0;
  }

  header {
    border-bottom: 1px solid rgba(148, 163, 184, 0.2);
    padding: 1rem;
    background: rgba(15, 23, 42, 0.35);
  }

  h2 {
    margin: 0;
    font-size: 1.05rem;
  }

  p {
    margin: 0.3rem 0 0;
    color: rgba(253, 186, 116, 0.95);
    font-size: 0.85rem;
  }

  .presence {
    color: rgba(186, 230, 253, 0.95);
  }

  .typing {
    color: rgba(148, 163, 184, 0.95);
    opacity: 0.9;
    transition: opacity 0.2s ease;
  }

  .seen {
    margin: 0;
    padding: 0.2rem 1rem 0;
    color: rgba(148, 163, 184, 0.94);
    font-size: 0.74rem;
    text-align: right;
  }

  @media (prefers-reduced-motion: reduce) {
    .typing {
      transition: none;
    }
  }

  .thread__messages {
    overflow: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.72rem;
    background:
      radial-gradient(circle at 20% 0%, rgba(14, 116, 144, 0.14), transparent 55%),
      rgba(2, 6, 23, 0.52);
  }

  .thread__line {
    display: flex;
    justify-content: flex-start;
  }

  .thread__line.own {
    justify-content: flex-end;
  }

  .thread__state {
    color: rgba(148, 163, 184, 0.92);
    margin: 0;
  }
</style>
