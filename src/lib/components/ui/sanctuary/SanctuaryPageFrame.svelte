<script lang="ts">
  export let eyebrow = '';
  export let title = '';
  export let subtitle = '';
  export let className = '';
  export { className as class };
</script>

<section class={`san-page ${className}`}>
  <div class="bg base" aria-hidden="true"></div>
  <div class="bg chroma" aria-hidden="true"></div>
  <div class="bg drift" aria-hidden="true"></div>
  <div class="bg stars" aria-hidden="true"></div>
  <div class="bg noise" aria-hidden="true"></div>

  <div class="san-page__content">
    {#if title}
      <header class="san-page__header">
        <div class="san-page__copy">
          {#if eyebrow}
            <p class="san-page__eyebrow">{eyebrow}</p>
          {/if}
          <h1 class="sanctuary-title san-page__title">{title}</h1>
          {#if subtitle}
            <p class="sanctuary-subtitle san-page__subtitle">{subtitle}</p>
          {/if}
        </div>
        <div class="san-page__actions">
          <slot name="actions" />
        </div>
      </header>
    {/if}

    <slot />
  </div>
</section>

<style>
  .san-page {
    position: relative;
    min-height: calc(100dvh - 8rem);
    border-radius: 1.25rem;
    overflow: hidden;
  }

  .bg {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }

  .base {
    z-index: 0;
    background:
      radial-gradient(80% 65% at 85% 14%, rgba(140, 236, 236, 0.26), transparent 72%),
      radial-gradient(80% 70% at 12% 90%, rgba(255, 189, 142, 0.3), transparent 74%),
      linear-gradient(160deg, rgba(26, 42, 122, 0.62), rgba(47, 70, 153, 0.58) 36%, rgba(102, 79, 152, 0.54) 66%, rgba(218, 161, 127, 0.44));
  }

  .chroma {
    z-index: 1;
    mix-blend-mode: soft-light;
    opacity: 0.34;
    background:
      radial-gradient(65% 50% at 20% 24%, rgba(72, 220, 215, 0.38), transparent 72%),
      radial-gradient(60% 48% at 74% 74%, rgba(255, 177, 136, 0.34), transparent 68%),
      radial-gradient(50% 40% at 52% 44%, rgba(92, 77, 178, 0.3), transparent 64%);
  }

  .drift {
    z-index: 2;
    opacity: 0.24;
    filter: blur(22px);
    background:
      radial-gradient(46% 30% at 30% 28%, rgba(91, 212, 202, 0.42), transparent 78%),
      radial-gradient(42% 30% at 68% 54%, rgba(118, 97, 205, 0.34), transparent 72%),
      radial-gradient(44% 32% at 56% 84%, rgba(253, 176, 121, 0.3), transparent 80%);
    animation: pageDrift 18s cubic-bezier(0.32, 0.03, 0.16, 0.99) infinite alternate;
  }

  .stars {
    z-index: 3;
    opacity: 0.16;
    background-image:
      radial-gradient(circle at 12% 21%, rgba(255, 244, 215, 0.55) 0.16rem, transparent 0.22rem),
      radial-gradient(circle at 74% 31%, rgba(255, 243, 222, 0.46) 0.12rem, transparent 0.2rem),
      radial-gradient(circle at 58% 83%, rgba(255, 238, 199, 0.4) 0.11rem, transparent 0.19rem),
      radial-gradient(circle at 83% 66%, rgba(255, 241, 214, 0.38) 0.13rem, transparent 0.2rem);
    filter: blur(0.7px);
  }

  .noise {
    z-index: 4;
    opacity: 0.06;
    mix-blend-mode: overlay;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140' viewBox='0 0 140 140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.76' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)' opacity='0.72'/%3E%3C/svg%3E");
  }

  .san-page__content {
    position: relative;
    z-index: 5;
    padding: clamp(0.9rem, 2vw, 1.35rem);
    display: grid;
    gap: 0.95rem;
  }

  .san-page__header {
    display: flex;
    justify-content: space-between;
    align-items: end;
    gap: 0.9rem;
  }

  .san-page__copy {
    display: grid;
    gap: 0.26rem;
  }

  .san-page__eyebrow {
    margin: 0;
    font-size: 0.68rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--san-text-muted);
  }

  .san-page__title {
    font-size: clamp(1.45rem, 2.6vw, 2.15rem);
  }

  .san-page__subtitle {
    font-size: 0.9rem;
  }

  .san-page__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.45rem;
    justify-content: flex-end;
  }

  @media (max-width: 720px) {
    .san-page {
      border-radius: 1rem;
      min-height: calc(100dvh - 7rem);
    }

    .san-page__header {
      flex-direction: column;
      align-items: start;
    }

    .san-page__actions {
      justify-content: start;
    }
  }

  @keyframes pageDrift {
    from {
      transform: translate3d(0, 0, 0);
    }
    to {
      transform: translate3d(-2.5%, -2.2%, 0);
    }
  }
</style>

