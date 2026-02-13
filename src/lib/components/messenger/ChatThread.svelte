<script lang="ts">
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import MessageBubble from './MessageBubble.svelte';
  import type { MessengerMessage } from './types';

  export let messages: MessengerMessage[] = [];
  export let currentUserId: string | null = null;
  export let blocked = false;
  export let loading = false;
  export let title = 'Select a conversation';
  export let presenceLabel: string | null = null;
  export let typing = false;

  const dispatch = createEventDispatcher<{ report: { messageId: string } }>();

  let scroller: HTMLDivElement | null = null;

  const scrollToBottom = async () => {
    await tick();
    if (!scroller) return;
    scroller.scrollTop = scroller.scrollHeight;
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
    {#if typing}
      <p class="typing" role="status">Typing…</p>
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
            isOwn={message.sender_id === currentUserId}
            on:report={(event) => dispatch('report', event.detail)}
          />
        </div>
      {/each}
    {/if}
  </div>

  <slot name="composer" />
</section>

<style>
  .thread {
    display: grid;
    grid-template-rows: auto 1fr auto;
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
