<script lang="ts">
  import PostCard from '$lib/social/PostCard.svelte';
  import CommentTree from '$lib/social/CommentTree.svelte';
  import type { PostRow, PostComment } from '$lib/social/types';

  export let data: {
    post: PostRow;
    comments: PostComment[];
    nextCursor: string | null;
    meta?: { title?: string; description?: string };
  };

  export const csr = true;

  let post: PostRow = { ...data.post };
  let commentCount = data.post.comment_count ?? 0;
  let initialComments = data.comments ?? [];
  let cursor: string | null = data.nextCursor ?? null;
  let commentTreeRef: InstanceType<typeof CommentTree> | null = null;

  function handleCommentCount(event: CustomEvent<number>) {
    const value = event.detail;
    commentCount = value;
    post = { ...post, comment_count: value };
  }

  function handleFocusRequest() {
    commentTreeRef?.focusComposer?.();
  }
</script>

<svelte:head>
  <title>{data.meta?.title ?? 'Post'}</title>
  {#if data.meta?.description}
    <meta name="description" content={data.meta.description} />
    <meta property="og:description" content={data.meta.description} />
  {/if}
  {#if data.meta?.title}
    <meta property="og:title" content={data.meta.title} />
  {/if}
</svelte:head>

<main class="post-page">
  <PostCard post={{ ...post, comment_count: commentCount }} detail on:focus-comments={handleFocusRequest} />

  <section class="thread-section">
    <h2>Conversation</h2>
    <CommentTree
      bind:this={commentTreeRef}
      postId={post.id}
      initialComments={initialComments}
      initialCursor={cursor}
      initialTotal={commentCount}
      on:count={handleCommentCount}
    />
  </section>
</main>

<style>
  .post-page {
    display: grid;
    gap: 24px;
    padding: 20px;
    max-width: 720px;
    margin: 0 auto;
  }

  .thread-section {
    display: grid;
    gap: 16px;
  }

  .thread-section h2 {
    margin: 0;
    font-size: 1.2rem;
  }
</style>
