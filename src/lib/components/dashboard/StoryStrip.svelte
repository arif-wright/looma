<script lang="ts">
  type Story = {
    id: string;
    name: string;
    image?: string;
    status?: 'new' | 'seen';
  };

  export let stories: Story[] = [];
</script>

<div class="stories" role="list">
  {#each stories as story (story.id)}
    <div class="story" role="listitem">
      <div class="story__image" data-status={story.status ?? 'seen'} aria-hidden="true">
        {#if story.image}
          <img src={story.image} alt="" />
        {:else}
          <span>{story.name.slice(0, 2)}</span>
        {/if}
      </div>
      <span class="story__name">{story.name}</span>
    </div>
  {/each}
</div>

<style>
  .stories {
    display: grid;
    grid-auto-flow: column;
    grid-auto-columns: minmax(96px, 1fr);
    gap: 0.9rem;
    overflow-x: auto;
    padding-bottom: 0.2rem;
  }

  .stories::-webkit-scrollbar {
    height: 6px;
  }

  .stories::-webkit-scrollbar-thumb {
    background: rgba(148, 163, 184, 0.4);
    border-radius: 999px;
  }

  .story {
    display: grid;
    gap: 0.6rem;
    padding: 1rem;
    border-radius: 1.25rem;
    background: rgba(36, 37, 38, 0.85);
    border: 1px solid rgba(59, 64, 75, 0.9);
    color: rgba(226, 232, 240, 0.85);
    text-align: center;
    box-shadow: 0 8px 18px rgba(15, 22, 35, 0.35);
    min-width: 96px;
  }

  .story:focus-visible {
    outline: none;
    box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.55);
  }

  .story__image {
    position: relative;
    width: 72px;
    height: 72px;
    margin: 0 auto;
    border-radius: 16px;
    overflow: hidden;
    display: grid;
    place-items: center;
    background: radial-gradient(circle at 30% 30%, rgba(147, 197, 253, 0.45), rgba(79, 70, 229, 0.35));
    font-weight: 700;
    font-size: 1.2rem;
    color: rgba(15, 23, 42, 0.9);
  }

  .story__image[data-status='new'] {
    border: 2px solid rgba(56, 189, 248, 0.75);
    padding: 2px;
  }

  .story__image img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: inherit;
  }

  .story__name {
    font-size: 0.78rem;
    letter-spacing: 0.03em;
  }

  @media (prefers-reduced-motion: reduce) {
    .story {
      transition: none;
    }
  }
</style>
