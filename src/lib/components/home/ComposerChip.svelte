<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import PostComposer from '$lib/social/PostComposer.svelte';

  export let placeholder = 'Share a quick win…';
  export let className = '';

  const dispatch = createEventDispatcher<{ posted: void }>();

  let expanded = false;

  function toggle() {
    expanded = !expanded;
  }

  function handlePosted() {
    expanded = false;
    dispatch('posted');
  }
</script>

<div class={`composer-shell ${className}`}>
  {#if expanded}
    <div class="composer-card" aria-label="Share something uplifting">
      <div class="composer-header">
        <h2>Compose</h2>
        <button type="button" class="close" on:click={toggle} aria-label="Close composer">
          ✕
        </button>
      </div>
      <PostComposer on:posted={handlePosted} />
    </div>
  {:else}
    <button type="button" class="chip" on:click={toggle}>
      <span class="dot" aria-hidden="true"></span>
      {placeholder}
    </button>
  {/if}
</div>

<style>
  .composer-shell {
    width: 100%;
  }

  .chip {
    width: 100%;
    display: inline-flex;
    align-items: center;
    justify-content: flex-start;
    gap: 10px;
    padding: 18px 22px;
    border-radius: 22px;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background:
      linear-gradient(135deg, rgba(255, 255, 255, 0.05), rgba(255, 255, 255, 0.01)),
      rgba(10, 14, 32, 0.32);
    color: rgba(226, 232, 240, 0.88);
    font-size: 1.02rem;
    cursor: pointer;
    position: relative;
    overflow: hidden;
    box-shadow: 0 16px 34px rgba(8, 12, 28, 0.3);
    transition: transform 160ms ease, box-shadow 180ms ease, border-color 180ms ease;
  }

.chip:hover,
.chip:focus-visible {
  transform: translateY(-1px);
  border-color: rgba(77, 244, 255, 0.55);
    box-shadow: 0 0 0 2px rgba(34, 211, 238, 0.6), 0 20px 40px rgba(77, 244, 255, 0.25);
    outline: none;
}

  .dot {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: rgba(56, 189, 248, 0.9);
    box-shadow: 0 0 16px rgba(56, 189, 248, 0.7);
  }

  .composer-card {
    border-radius: 22px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    background:
      linear-gradient(140deg, rgba(255, 255, 255, 0.08), rgba(255, 255, 255, 0.02)),
      rgba(10, 14, 32, 0.48);
    padding: clamp(1.4rem, 3vw, 1.8rem);
    display: grid;
    gap: 16px;
    box-shadow: 0 24px 48px rgba(8, 10, 24, 0.42);
    backdrop-filter: blur(24px);
  }

  .composer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .composer-header h2 {
    margin: 0;
    font-size: 1.2rem;
    font-family: var(--font-display, 'Cormorant Garamond', serif);
    letter-spacing: 0.01em;
  }

  .close {
    border: 1px solid rgba(255, 255, 255, 0.18);
    background: rgba(255, 255, 255, 0.05);
    color: rgba(226, 232, 240, 0.8);
    border-radius: 999px;
    font-size: 0.95rem;
    padding: 0.35rem 0.75rem;
    line-height: 1;
    cursor: pointer;
    transition: transform 160ms ease, box-shadow 180ms ease, border-color 180ms ease;
  }

  .close:hover,
  .close:focus-visible {
    transform: translateY(-1px);
    border-color: rgba(77, 244, 255, 0.55);
    color: rgba(255, 255, 255, 0.95);
    box-shadow: 0 14px 28px rgba(77, 244, 255, 0.32);
  }

  .close:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(34, 211, 238, 0.6), 0 14px 28px rgba(77, 244, 255, 0.32);
  }

  .chip::after {
    content: '';
    position: absolute;
    inset: -40%;
    background: radial-gradient(circle, rgba(255, 255, 255, 0.35), transparent 70%);
    transform: scale(0);
    opacity: 0;
    transition: transform 400ms ease, opacity 400ms ease;
  }

  .chip:active::after {
    transform: scale(1.7);
    opacity: 0.32;
    transition: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .chip,
    .close {
      transition: none;
    }
    .chip::after {
      display: none;
    }
  }
</style>
