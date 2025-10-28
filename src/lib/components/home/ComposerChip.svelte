<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import PostComposer from '$lib/social/PostComposer.svelte';

  export let placeholder = 'Share a quick win…';
  export let class: string | undefined;

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

<div class={`composer-shell ${class ?? ''}`}>
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
    padding: 18px 20px;
    border-radius: 20px;
    border: 1px dashed rgba(148, 163, 184, 0.4);
    background: rgba(15, 23, 42, 0.65);
    color: rgba(226, 232, 240, 0.85);
    font-size: 1rem;
    cursor: pointer;
    transition: border-color 0.2s ease, background 0.2s ease;
  }

  .chip:hover,
  .chip:focus-visible {
    border-color: rgba(56, 189, 248, 0.7);
    background: rgba(15, 118, 110, 0.35);
  }

  .dot {
    width: 10px;
    height: 10px;
    border-radius: 999px;
    background: rgba(56, 189, 248, 0.9);
  }

  .composer-card {
    border-radius: 22px;
    border: 1px solid rgba(148, 163, 184, 0.25);
    background: rgba(15, 23, 42, 0.85);
    padding: 20px;
    display: grid;
    gap: 16px;
    box-shadow: 0 22px 60px rgba(15, 23, 42, 0.45);
  }

  .composer-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .composer-header h2 {
    margin: 0;
    font-size: 1.1rem;
  }

  .close {
    border: none;
    background: transparent;
    color: rgba(226, 232, 240, 0.7);
    font-size: 1.2rem;
    line-height: 1;
    cursor: pointer;
  }

  .close:hover,
  .close:focus-visible {
    color: rgba(226, 232, 240, 1);
  }
</style>
