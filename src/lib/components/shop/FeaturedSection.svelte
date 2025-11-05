<script lang="ts">
  export type FeaturedBanner = {
    id: string;
    title: string;
    description: string;
    ctaLabel: string;
    href: string;
    image: string;
    accent?: 'cyan' | 'magenta' | 'amber' | 'violet';
  };

  export let banners: FeaturedBanner[] = [];
</script>

{#if banners.length > 0}
  <section class="featured-strip" aria-label="Featured marketplace promotions">
    {#each banners as banner (banner.id)}
      <article class={`featured-card panel-glass ${banner.accent ? `accent-${banner.accent}` : ''}`}>
        <div class="featured-media" aria-hidden="true">
          <img src={banner.image} alt="" loading="lazy" decoding="async" />
        </div>
        <div class="featured-copy">
          <p class="featured-label">Featured</p>
          <h3>{banner.title}</h3>
          <p>{banner.description}</p>
          <a class="featured-cta" href={banner.href}>{banner.ctaLabel}</a>
        </div>
      </article>
    {/each}
  </section>
{/if}

<style>
  .featured-strip {
    display: grid;
    gap: 1.25rem;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  }

  .featured-card {
    position: relative;
    overflow: hidden;
    border-radius: 1.75rem;
    min-height: 220px;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    padding: 1.4rem;
  }

  .featured-card::after {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: inherit;
    background: linear-gradient(135deg, rgba(8, 12, 24, 0.68), rgba(8, 12, 24, 0.35));
    mix-blend-mode: multiply;
    pointer-events: none;
  }

  .featured-media {
    position: absolute;
    inset: 0;
    z-index: -2;
  }

  .featured-media img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    filter: saturate(1.05) brightness(0.85);
  }

  .featured-copy {
    position: relative;
    z-index: 1;
    display: grid;
    gap: 0.6rem;
    max-width: 360px;
  }

  .featured-label {
    margin: 0;
    font-size: 0.7rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: rgba(248, 250, 255, 0.72);
  }

  .featured-copy h3 {
    margin: 0;
    font-size: clamp(1.35rem, 2.4vw, 1.75rem);
    font-weight: 600;
    color: rgba(248, 250, 255, 0.96);
  }

  .featured-copy p {
    margin: 0;
    color: rgba(226, 232, 240, 0.82);
    line-height: 1.6;
  }

  .featured-cta {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: fit-content;
    margin-top: 0.4rem;
    padding: 0.65rem 1.5rem;
    border-radius: 999px;
    background: linear-gradient(120deg, rgba(94, 242, 255, 0.95), rgba(155, 92, 255, 0.95));
    color: rgba(8, 10, 22, 0.88);
    font-weight: 600;
    text-decoration: none;
    box-shadow: 0 14px 28px rgba(94, 242, 255, 0.35);
  }

  .accent-magenta .featured-cta {
    background: linear-gradient(120deg, rgba(255, 79, 216, 0.95), rgba(155, 92, 255, 0.95));
    color: #fff;
    box-shadow: 0 14px 28px rgba(255, 79, 216, 0.35);
  }

  .accent-amber .featured-cta {
    background: linear-gradient(120deg, rgba(255, 207, 106, 0.95), rgba(255, 149, 5, 0.9));
    color: rgba(24, 17, 5, 0.95);
    box-shadow: 0 14px 28px rgba(255, 207, 106, 0.35);
  }

  @media (max-width: 640px) {
    .featured-card {
      min-height: 200px;
    }
  }
</style>
