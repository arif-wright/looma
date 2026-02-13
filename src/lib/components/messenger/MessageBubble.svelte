<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { MessengerMessage, ModerationBadgeStatus } from './types';

  export let message: MessengerMessage;
  export let isOwn = false;
  export let moderationStatus: ModerationBadgeStatus = 'active';

  const dispatch = createEventDispatcher<{ report: { messageId: string } }>();

  const formattedTime = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(message.created_at));
</script>

<article class={`bubble ${isOwn ? 'bubble--own' : ''}`}>
  <p>{message.body}</p>
  <footer>
    {#if moderationStatus !== 'active'}
      <span class={`mod-badge mod-${moderationStatus}`}>{moderationStatus}</span>
    {/if}
    <time datetime={message.created_at}>{formattedTime}</time>
    {#if !isOwn}
      <button type="button" on:click={() => dispatch('report', { messageId: message.id })}>Report</button>
    {/if}
  </footer>
</article>

<style>
  .bubble {
    max-width: min(78%, 44rem);
    background: rgba(15, 23, 42, 0.72);
    border: 1px solid rgba(148, 163, 184, 0.28);
    border-radius: 0.85rem;
    padding: 0.62rem 0.75rem;
    color: #e2e8f0;
  }

  .bubble--own {
    margin-left: auto;
    background: rgba(14, 116, 144, 0.35);
    border-color: rgba(103, 232, 249, 0.45);
  }

  p {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
  }

  footer {
    margin-top: 0.35rem;
    display: flex;
    gap: 0.45rem;
    justify-content: flex-end;
    align-items: center;
    font-size: 0.74rem;
    color: rgba(186, 230, 253, 0.88);
  }

  button {
    border: none;
    background: transparent;
    color: rgba(125, 211, 252, 0.92);
    cursor: pointer;
    padding: 0;
  }

  .mod-badge {
    font-size: 0.66rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    border-radius: 999px;
    padding: 0.08rem 0.4rem;
    border: 1px solid rgba(251, 191, 36, 0.55);
    color: rgba(254, 243, 199, 0.95);
    background: rgba(120, 53, 15, 0.32);
  }

  .mod-suspended,
  .mod-banned {
    border-color: rgba(248, 113, 113, 0.55);
    color: rgba(254, 226, 226, 0.95);
    background: rgba(127, 29, 29, 0.35);
  }
</style>
