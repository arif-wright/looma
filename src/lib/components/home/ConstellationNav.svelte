<script lang="ts">
  import { onMount } from 'svelte';

  export type NavItem = {
    id: string;
    label: string;
    description?: string | null;
    icon?: string | null;
  };

export let items: NavItem[] = [];
export let activeId: string | null = null;

let navigate = (target: string) => {
  const el = document.getElementById(target);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
};

onMount(() => {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) {
      navigate = (target: string) => {
        const el = document.getElementById(target);
        el?.scrollIntoView({ behavior: 'auto', block: 'start' });
      };
    }
  });
</script>

<nav class="constellation-nav" aria-label="Home sections">
  <ul>
    {#each items as item}
      <li class:item-active={item.id === activeId}>
        <button type="button" class="node" on:click={() => navigate(item.id)}>
          <span class="orb" aria-hidden="true">
            <span class="orb-core"></span>
          </span>
          <span class="text">
            <span class="label">{item.label}</span>
            {#if item.description}
              <span class="description">{item.description}</span>
            {/if}
          </span>
        </button>
      </li>
    {/each}
  </ul>
</nav>

<style>
  .constellation-nav {
    position: sticky;
    top: 96px;
    align-self: start;
    display: grid;
    padding: 20px 12px;
    border-radius: 26px;
    background: rgba(10, 12, 28, 0.52);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 18px 42px rgba(8, 10, 28, 0.35);
    backdrop-filter: blur(26px);
  }

  ul {
    list-style: none;
    display: grid;
    gap: 10px;
    padding: 0;
    margin: 0;
  }

  li {
    position: relative;
  }

  .node {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 14px 16px;
    border: none;
    background: transparent;
    border-radius: 18px;
    cursor: pointer;
    color: rgba(230, 235, 255, 0.75);
    text-align: left;
    transition: transform 160ms ease, box-shadow 180ms ease, background 180ms ease;
  }

  .node:hover,
  .node:focus-visible {
    background: rgba(77, 244, 255, 0.08);
    box-shadow: 0 12px 26px rgba(77, 244, 255, 0.18);
    transform: translateY(-1px);
  }

  .node:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(34, 211, 238, 0.6), 0 12px 26px rgba(77, 244, 255, 0.18);
  }

  .orb {
    position: relative;
    width: 18px;
    height: 18px;
    border-radius: 999px;
    background: radial-gradient(circle at 30% 30%, rgba(252, 211, 255, 0.95), rgba(124, 58, 237, 0.4));
    box-shadow: 0 0 18px rgba(157, 92, 255, 0.4);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    transition: transform 200ms ease, box-shadow 200ms ease;
  }

  .orb-core {
    width: 6px;
    height: 6px;
    border-radius: inherit;
    background: rgba(255, 255, 255, 0.9);
  }

  .text {
    display: grid;
    gap: 2px;
  }

  .label {
    font-size: 0.95rem;
    font-weight: 600;
    letter-spacing: 0.01em;
  }

  .description {
    font-size: 0.78rem;
    color: rgba(226, 232, 255, 0.6);
  }

  .item-active .node {
    background: rgba(157, 92, 255, 0.15);
    box-shadow: 0 18px 32px rgba(157, 92, 255, 0.28);
    color: rgba(255, 255, 255, 0.95);
  }

  .item-active .orb {
    transform: scale(1.12);
    box-shadow: 0 0 24px rgba(157, 92, 255, 0.55);
  }

  @media (max-width: 1024px) {
    .constellation-nav {
      display: none;
    }
  }
</style>
