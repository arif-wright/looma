<script lang="ts">
  import { browser } from '$app/environment';
  import PostCard from '$lib/social/PostCard.svelte';
  import CommentList from '$lib/social/CommentList.svelte';
  import ThreadDrawer from '$lib/social/ThreadDrawer.svelte';
  import type { PostRow, PostComment, CommentNode } from '$lib/social/types';

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
  let commentListRef: InstanceType<typeof CommentList> | null = null;
  let threadOpen = false;
  let threadRoot: CommentNode | null = null;
  let threadAncestors: CommentNode[] = [];

  function handleCommentCount(event: CustomEvent<number>) {
    const value = event.detail;
    commentCount = value;
    post = { ...post, comment_count: value };
  }

  function handleFocusRequest() {
    commentListRef?.focusComposer?.();
  }

  function handleOpenThread(event: CustomEvent<{ root: CommentNode; ancestors: CommentNode[] }>) {
    threadRoot = event.detail.root;
    threadAncestors = event.detail.ancestors;
    threadOpen = true;
  }

  function handleCloseThread() {
    threadOpen = false;
    threadRoot = null;
    threadAncestors = [];
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
  {#if browser}
    <PostCard
      post={{ ...post, comment_count: commentCount }}
      detail
      on:focus-comments={handleFocusRequest}
    />
  {/if}

  <section class="thread-section">
    <h2>Conversation</h2>
    <CommentList
      bind:this={commentListRef}
      postId={post.id}
      initialItems={initialComments}
      initialCursor={cursor}
      initialCount={commentCount}
      on:count={handleCommentCount}
      on:openThread={handleOpenThread}
    />
  </section>
  <ThreadDrawer
    postId={post.id}
    open={threadOpen}
    root={threadRoot}
    ancestors={threadAncestors}
    on:close={handleCloseThread}
  />
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
