<script lang="ts">
  import CommentItem from './CommentItem.svelte';
  import type { Comment } from '$lib/threads/types';

  export let postId: string;
  export let comments: Comment[] = [];
  export let highlightedId: string | null = null;
  export let threadSlug: string | null = null;
</script>

{#if comments.length === 0}
  <p class="rounded-xl border border-slate-800/60 bg-slate-900/40 p-6 text-center text-sm text-slate-400">
    No replies yet. Start the conversation!
  </p>
{:else}
  <div class="space-y-4">
    {#each comments as comment (comment.id)}
      <CommentItem
        {comment}
        {postId}
        {threadSlug}
        {highlightedId}
        depth={0}
      />
    {/each}
  </div>
{/if}
