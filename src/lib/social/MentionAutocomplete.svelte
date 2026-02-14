<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { MentionOption } from './types';
  import AvatarImage from '$lib/components/ui/AvatarImage.svelte';

  export let open = false;
  export let items: MentionOption[] = [];
  export let active = 0;
  export let loading = false;
  export let query = '';
  export let position: { top: number; left: number } = { top: 0, left: 0 };

  const portal = (node: HTMLElement) => {
    if (typeof document === 'undefined') return;
    document.body.appendChild(node);
    return {
      destroy() {
        node.remove();
      }
    };
  };

  const dispatch = createEventDispatcher<{ select: MentionOption }>();

  function handleSelect(option: MentionOption) {
    dispatch('select', option);
  }
</script>

{#if open}
  <div
    class="mention-popover"
    use:portal
    style={`top:${position.top}px;left:${position.left}px;`}
    role="dialog"
    aria-label="Mention suggestions"
  >
    {#if loading}
      <div class="status">Searching…</div>
    {:else if query.length < 2}
      <div class="status">Keep typing…</div>
    {:else if items.length === 0}
      <div class="status">No matches</div>
    {:else}
      <ul
        role="listbox"
        aria-activedescendant={items[active] ? `mention-${items[active].id}` : undefined}
        tabindex="0"
      >
        {#each items as item, index}
          <li
            id={`mention-${item.id}`}
            role="option"
            aria-selected={index === active}
            class:active={index === active}
            on:mousedown|preventDefault={() => handleSelect(item)}
          >
            <AvatarImage
              src={item.author_avatar_url ?? '/avatar.svg'}
              name={item.author_display_name}
              handle={item.author_handle}
              alt=""
              width={28}
              height={28}
              className="mention-avatar"
              loading="lazy"
            />
            <span>
              <b>
                {item.author_display_name ?? (item.author_handle ? `@${item.author_handle}` : 'Someone')}
              </b>
              <small>@{item.author_handle ?? 'user'}</small>
            </span>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
{/if}

<style>
  .mention-popover {
    position: fixed;
    z-index: 60;
    min-width: 220px;
    max-width: 260px;
    background: rgba(20, 20, 24, 0.96);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 10px;
    padding: 6px;
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
    display: grid;
    gap: 4px;
  }

  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 2px;
  }

  li {
    display: grid;
    grid-template-columns: 28px 1fr;
    gap: 8px;
    align-items: center;
    padding: 6px 8px;
    border-radius: 8px;
    cursor: pointer;
  }

  li.active,
  li:hover {
    background: rgba(255, 255, 255, 0.12);
  }

  :global(.mention-avatar) {
    width: 28px;
    height: 28px;
    border-radius: 999px;
    object-fit: cover;
  }

  span {
    display: grid;
    gap: 2px;
    font-size: 0.78rem;
  }

  b {
    font-weight: 600;
  }

  small {
    opacity: 0.7;
  }

  .status {
    font-size: 0.78rem;
    opacity: 0.75;
    padding: 6px;
  }
</style>
