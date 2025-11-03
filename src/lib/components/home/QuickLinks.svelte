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
        void activate(links[index].href);
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
          on:focus={() => (activeIndex = index)}
          on:keydown={(event) => handleKey(event, index)}
          on:click={() => activate(link.href)}
          aria-label={`${link.label} — ${link.description}`}
          data-href={link.href}
        >
          <span class="link-row__icon" aria-hidden="true">
            {link.icon ?? '•'}
          </span>
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
    padding: 0.95rem 1.1rem;
    border: none;
    border-radius: 1.1rem;
    background: rgba(255, 255, 255, 0.04);
    color: rgba(244, 247, 255, 0.9);
    text-align: left;
    cursor: pointer;
    transition: transform 150ms ease, box-shadow 200ms ease, background 180ms ease;
  }

  .link-row:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px var(--ring-focus, rgba(77, 244, 255, 0.6));
  }

  .link-row__icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.2rem;
    height: 2.2rem;
    border-radius: 999px;
    background: linear-gradient(135deg, rgba(77, 244, 255, 0.26), rgba(155, 92, 255, 0.34));
    color: rgba(10, 16, 36, 0.8);
    font-size: 1rem;
    font-weight: 600;
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
