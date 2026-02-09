<script lang="ts">
  import { Heart, MessageCircle, Share2 } from 'lucide-svelte';

  export let author = 'Looma Friend';
  export let subtitle = 'Shared a resonance';
  export let body = 'The field feels calmer after our last mission.';
  export let timestamp = 'Just now';
</script>

<article class="post">
  <header class="post__header">
    <div class="post__avatar" aria-hidden="true">{author.slice(0, 2)}</div>
    <div class="post__meta">
      <span class="post__author">{author}</span>
      <span class="post__subtitle">{subtitle}</span>
      <time class="post__time" datetime={timestamp}>{timestamp}</time>
    </div>
  </header>
  <p class="post__body">{body}</p>
  <footer class="post__actions">
    <button type="button" class="post__action" aria-label="React">
      <Heart stroke-width={1.6} />
      <span>Resonate</span>
    </button>
    <button type="button" class="post__action" aria-label="Reply">
      <MessageCircle stroke-width={1.6} />
      <span>Reply</span>
    </button>
    <button type="button" class="post__action" aria-label="Share">
      <Share2 stroke-width={1.6} />
      <span>Echo</span>
    </button>
  </footer>
</article>

<style>
  .post {
    display: grid;
    gap: 1rem;
    padding: 1.6rem;
    border-radius: 1.5rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(148, 163, 184, 0.18);
    box-shadow: 0 0 16px rgba(147, 197, 253, 0.12);
  }

  .post:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(45, 212, 191, 0.55);
  }

  .post__header {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: 0.9rem;
    align-items: center;
  }

  .post__avatar {
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 999px;
    background: linear-gradient(135deg, rgba(147, 197, 253, 0.35), rgba(244, 114, 182, 0.35));
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-weight: 700;
    color: rgba(15, 23, 42, 0.85);
  }

  .post__meta {
    display: grid;
    gap: 0.2rem;
  }

  .post__author {
    font-weight: 600;
    color: rgba(248, 250, 252, 0.95);
  }

  .post__subtitle {
    font-size: 0.82rem;
    color: rgba(226, 232, 240, 0.65);
  }

  .post__time {
    font-size: 0.75rem;
    color: rgba(148, 163, 184, 0.65);
  }

  .post__body {
    margin: 0;
    font-size: 0.98rem;
    color: rgba(226, 232, 240, 0.85);
    line-height: 1.6;
  }

  .post__actions {
    display: flex;
    gap: 1rem;
  }

  .post__action {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.55rem 1rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid transparent;
    color: rgba(226, 232, 240, 0.75);
    font-size: 0.78rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    cursor: pointer;
    transition: all 180ms ease;
  }

  .post__action:hover,
  .post__action:focus-visible {
    border-color: rgba(147, 197, 253, 0.25);
    color: rgba(248, 250, 252, 0.95);
  }

  @media (prefers-reduced-motion: reduce) {
    .post,
    .post__action {
      transition: none;
    }
  }
</style>
