<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { MessageReactionSummary, MessengerMessage, ModerationBadgeStatus } from './types';

  export let message: MessengerMessage;
  export let isOwn = false;
  export let moderationStatus: ModerationBadgeStatus = 'active';
  export let reactions: MessageReactionSummary[] = [];
  export let canEdit = false;
  export let canDelete = false;

  const EMOJIS: Array<'👍' | '❤️' | '😂' | '😮' | '😢' | '🔥'> = ['👍', '❤️', '😂', '😮', '😢', '🔥'];

  const dispatch = createEventDispatcher<{
    report: { messageId: string };
    react: { messageId: string; emoji: '👍' | '❤️' | '😂' | '😮' | '😢' | '🔥'; action: 'add' | 'remove' };
    edit: { messageId: string; body: string };
    delete: { messageId: string };
  }>();

  const formattedTime = new Intl.DateTimeFormat(undefined, {
    hour: 'numeric',
    minute: '2-digit'
  }).format(new Date(message.created_at));

  const isDeleted = Boolean(message.deleted_at);
  const isEdited = Boolean(message.edited_at) && !isDeleted;

  const getReaction = (emoji: MessageReactionSummary['emoji']) =>
    reactions.find((entry) => entry.emoji === emoji) ?? null;

  const toggleReaction = (emoji: MessageReactionSummary['emoji']) => {
    const entry = getReaction(emoji);
    dispatch('react', {
      messageId: message.id,
      emoji,
      action: entry?.reacted ? 'remove' : 'add'
    });
  };

  const splitWithUrls = (text: string) => {
    const regex = /(https?:\/\/[^\s]+)/gi;
    const parts: Array<{ type: 'text' | 'url'; value: string }> = [];
    let last = 0;
    let match: RegExpExecArray | null = null;
    while ((match = regex.exec(text)) !== null) {
      const start = match.index;
      if (start > last) {
        parts.push({ type: 'text', value: text.slice(last, start) });
      }
      parts.push({ type: 'url', value: match[0] });
      last = start + match[0].length;
    }
    if (last < text.length) {
      parts.push({ type: 'text', value: text.slice(last) });
    }
    return parts;
  };

  $: bodyParts = splitWithUrls(message.body ?? '');
</script>

<article class={`bubble ${isOwn ? 'bubble--own' : ''} ${isDeleted ? 'bubble--deleted' : ''}`}>
  {#if isDeleted}
    <p class="deleted">Message removed</p>
  {:else}
    <p>
      {#each bodyParts as part}
        {#if part.type === 'url'}
          <a href={part.value} target="_blank" rel="noopener noreferrer nofollow">{part.value}</a>
        {:else}
          {part.value}
        {/if}
      {/each}
    </p>
  {/if}

  <div class="reaction-strip" aria-label="Quick reactions">
    {#each EMOJIS as emoji}
      <button
        type="button"
        class={`emoji ${getReaction(emoji)?.reacted ? 'active' : ''}`}
        on:click={() => toggleReaction(emoji)}
        aria-label={`React ${emoji}`}
      >
        {emoji}
      </button>
    {/each}
  </div>

  {#if reactions.length > 0}
    <div class="reaction-summary" role="group" aria-label="Message reactions">
      {#each reactions as reaction (reaction.emoji)}
        <button
          type="button"
          class={`reaction-chip ${reaction.reacted ? 'active' : ''}`}
          on:click={() => toggleReaction(reaction.emoji)}
        >
          {reaction.emoji} {reaction.count}
        </button>
      {/each}
    </div>
  {/if}

  <footer>
    {#if moderationStatus !== 'active'}
      <span class={`mod-badge mod-${moderationStatus}`}>{moderationStatus}</span>
    {/if}
    <time datetime={message.created_at}>{formattedTime}</time>
    {#if isEdited}
      <span class="edited">edited</span>
    {/if}

    <details class="menu">
      <summary aria-label="Message actions">⋯</summary>
      <div class="menu-popover" role="menu">
        {#if !isDeleted}
          {#if canEdit}
            <button type="button" role="menuitem" on:click={() => dispatch('edit', { messageId: message.id, body: message.body })}>Edit</button>
          {/if}
          {#if canDelete}
            <button type="button" role="menuitem" on:click={() => dispatch('delete', { messageId: message.id })}>Delete</button>
          {/if}
          {#if !isOwn}
            <button type="button" role="menuitem" on:click={() => dispatch('report', { messageId: message.id })}>Report</button>
          {/if}
        {/if}
      </div>
    </details>
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

  .bubble--deleted {
    opacity: 0.86;
  }

  p {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .deleted {
    color: rgba(148, 163, 184, 0.94);
    font-style: italic;
  }

  a {
    color: rgba(125, 211, 252, 0.95);
    text-decoration: underline;
  }

  .reaction-strip {
    margin-top: 0.38rem;
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;
  }

  .emoji {
    border: 1px solid rgba(148, 163, 184, 0.28);
    background: rgba(15, 23, 42, 0.42);
    border-radius: 999px;
    padding: 0.05rem 0.38rem;
    font-size: 0.8rem;
    cursor: pointer;
  }

  .emoji.active {
    border-color: rgba(34, 211, 238, 0.55);
    background: rgba(34, 211, 238, 0.2);
  }

  .reaction-summary {
    margin-top: 0.32rem;
    display: flex;
    gap: 0.28rem;
    flex-wrap: wrap;
  }

  .reaction-chip {
    border: 1px solid rgba(148, 163, 184, 0.3);
    background: rgba(15, 23, 42, 0.46);
    color: #e2e8f0;
    border-radius: 999px;
    padding: 0.06rem 0.42rem;
    font-size: 0.74rem;
    cursor: pointer;
  }

  .reaction-chip.active {
    border-color: rgba(34, 211, 238, 0.5);
    background: rgba(34, 211, 238, 0.18);
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

  .edited {
    color: rgba(148, 163, 184, 0.95);
  }

  .menu {
    position: relative;
  }

  .menu summary {
    list-style: none;
    cursor: pointer;
    user-select: none;
    padding: 0 0.25rem;
  }

  .menu summary::-webkit-details-marker {
    display: none;
  }

  .menu-popover {
    position: absolute;
    right: 0;
    top: calc(100% + 0.2rem);
    z-index: 5;
    min-width: 6.5rem;
    border-radius: 0.6rem;
    border: 1px solid rgba(148, 163, 184, 0.25);
    background: rgba(2, 6, 23, 0.95);
    padding: 0.2rem;
    display: grid;
    gap: 0.12rem;
  }

  .menu-popover button {
    border: none;
    background: transparent;
    color: #e2e8f0;
    text-align: left;
    border-radius: 0.4rem;
    padding: 0.32rem 0.46rem;
    cursor: pointer;
  }

  .menu-popover button:hover,
  .menu-popover button:focus-visible {
    background: rgba(148, 163, 184, 0.18);
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
