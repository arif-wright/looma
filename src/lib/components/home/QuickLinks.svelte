<script lang="ts">
  import { goto } from '$app/navigation';
  import type { QuickLink } from './types';

  export let links: QuickLink[] = [];

  let activeIndex = 0;
  const activate = async (href: string) => {
    await goto(href, { noScroll: false });
  };

  const handleKey = (event: KeyboardEvent, index: number) => {
    const container = (event.currentTarget as HTMLElement | null)?.closest('[data-quick-links]');
    const items = container
      ? (Array.from(container.querySelectorAll('button')) as HTMLButtonElement[])
      : [];
    if (items.length === 0) return;

    let nextIndex = index;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowRight':
        event.preventDefault();
        nextIndex = (index + 1) % links.length;
        break;
      case 'ArrowUp':
      case 'ArrowLeft':
        event.preventDefault();
        nextIndex = (index - 1 + links.length) % links.length;
        break;
      case 'Home':
        event.preventDefault();
        nextIndex = 0;
        break;
      case 'End':
        event.preventDefault();
        nextIndex = links.length - 1;
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        if (links[index]) {
          void activate(links[index].href);
        }
        return;
      default:
        return;
    }

    activeIndex = nextIndex;
    items.forEach((item, itemIndex) => {
      item.tabIndex = itemIndex === nextIndex ? 0 : -1;
    });
    const target = items[nextIndex] ?? null;
    target?.focus();
  };
</script>

<article
  class="orb-panel quick-links"
  data-testid="quick-links"
  data-quick-links="panel"
  aria-label="Quick navigation"
>
  <header class="quick-links__header">
    <p class="quick-links__eyebrow">Navigate</p>
    <h2>Stay tethered</h2>
  </header>

  <ul class="quick-links__list" role="listbox" aria-label="Dashboard links">
    {#each links as link, index (link.id)}
      <li>
        <button
          class="link-row btn-ripple hover-glow"
          type="button"
          tabindex={index === activeIndex ? 0 : -1}
          data-active={index === activeIndex}
          on:focus={() => (activeIndex = index)}
          on:keydown={(event) => handleKey(event, index)}
          on:click={() => activate(link.href)}
          aria-label={`${link.label} — ${link.description}`}
          data-href={link.href}
        >
          {#if link.icon}
            <svelte:component
              this={link.icon}
              aria-hidden="true"
              class="link-row__icon"
              stroke-width={1.6}
            />
          {:else}
            <span class="link-row__icon" aria-hidden="true">•</span>
          {/if}
          <span class="link-row__copy">
            <span class="link-row__label">{link.label}</span>
            <span class="link-row__description">{link.description}</span>
          </span>
        </button>
      </li>
    {/each}
  </ul>
</article>

<style>
  .quick-links {
    display: grid;
    gap: 1.5rem;
    padding: 1.9rem 1.8rem;
  }

  .quick-links__header {
    display: grid;
    gap: 0.35rem;
  }

  .quick-links__header h2 {
    margin: 0;
    font-family: var(--font-display, 'Cormorant Garamond', serif);
    font-size: 1.8rem;
    font-weight: 600;
    letter-spacing: 0.01em;
  }

  .quick-links__eyebrow {
    margin: 0;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.22em;
    color: rgba(226, 232, 255, 0.58);
  }

  .quick-links__list {
    list-style: none;
    display: grid;
    gap: 0.6rem;
    padding: 0;
    margin: 0;
  }

  .link-row {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 0.9rem;
    padding: 1rem 1.1rem;
    border: 1px solid rgba(148, 163, 184, 0.16);
    border-radius: 1.2rem;
    background: rgba(15, 23, 42, 0.55);
    color: rgba(226, 232, 240, 0.75);
    text-align: left;
    cursor: pointer;
    transition: all 200ms ease;
  }

  .link-row:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(45, 212, 191, 0.55);
    border-color: transparent;
  }

  .link-row__icon {
    width: 1.6rem;
    height: 1.6rem;
    color: rgba(226, 232, 240, 0.7);
    transition: color 200ms ease;
  }

  .link-row__copy {
    display: grid;
    gap: 0.2rem;
  }

  .link-row__label {
    font-size: 1rem;
    font-weight: 600;
    letter-spacing: 0.01em;
  }

  .link-row__description {
    font-size: 0.82rem;
    color: rgba(226, 232, 255, 0.8);
  }

  .link-row:hover,
  .link-row:focus-visible {
    background: rgba(17, 24, 39, 0.78);
    color: rgba(248, 250, 252, 0.95);
    transform: translateY(-1px);
  }

  .link-row:hover .link-row__icon,
  .link-row:focus-visible .link-row__icon {
    color: rgb(165 243 252);
  }

  .link-row[data-active='true'] {
    color: rgba(240, 249, 255, 0.95);
    border-color: rgba(56, 189, 248, 0.35);
    box-shadow: 0 0 16px rgba(56, 189, 248, 0.18);
  }

  .link-row[data-active='true'] .link-row__icon {
    color: rgb(165 243 252);
  }

  @media (prefers-reduced-motion: reduce) {
    .link-row {
      transition: none;
    }

    .link-row:hover,
    .link-row:focus-visible {
      transform: none;
      box-shadow: none;
    }
  }
</style>
