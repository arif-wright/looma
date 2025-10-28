<script lang="ts">
  import PostCard from '$lib/social/PostCard.svelte';
  import type { PostRow } from '$lib/social/types';

  export let items: PostRow[] = [];
</script>

{#if items.length === 0}
  <div class="empty-feed">
    <p>No posts yet.</p>
    <a href="/app/u/explore">Follow 3 creators</a>
  </div>
{:else}
  <ul class="feed-list">
    {#each items as post (post.id)}
      <li>
        <svelte:component this={PostCard} client:only {post} />
      </li>
    {/each}
  </ul>
{/if}

<style>
  .feed-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 16px;
  }

  .empty-feed {
    border-radius: 18px;
    border: 1px dashed rgba(148, 163, 184, 0.4);
    background: rgba(15, 23, 42, 0.55);
    padding: 32px;
    text-align: center;
    display: grid;
    gap: 12px;
  }

  .empty-feed a {
    display: inline-flex;
    justify-content: center;
    padding: 8px 16px;
    border-radius: 999px;
    border: 1px solid rgba(148, 163, 184, 0.4);
    color: rgba(226, 232, 240, 0.9);
    text-decoration: none;
  }

  .empty-feed a:hover,
  .empty-feed a:focus-visible {
    border-color: rgba(56, 189, 248, 0.6);
    color: rgba(125, 211, 252, 0.9);
  }
</style>
