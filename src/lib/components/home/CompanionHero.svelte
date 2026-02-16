<script lang="ts">
  import MuseModel from '$lib/components/companion/MuseModel.svelte';

  export let name = 'Mirae';
  export let species = 'Muse';
  export let avatarUrl: string | null = null;
  export let closenessState: 'Distant' | 'Near' | 'Resonant' = 'Near';

  const auraMap: Record<'Distant' | 'Near' | 'Resonant', 'cyan' | 'amber' | 'mint'> = {
    Distant: 'cyan',
    Near: 'amber',
    Resonant: 'mint'
  };
</script>

<section class="hero" aria-label="Companion">
  <div class="hero__media">
    <MuseModel
      class="hero__model"
      poster={avatarUrl ?? '/avatar-fallback.png'}
      cameraControls={false}
      autoplay={true}
      auraColor={auraMap[closenessState]}
      glowIntensity={54}
      motionScale={0.98}
      minSize={240}
    />
    <div class="hero__veil" aria-hidden="true"></div>
  </div>

  <div class="hero__copy">
    <h2>{name}</h2>
    <p>{species}</p>
  </div>
</section>

<style>
  .hero {
    position: relative;
    display: grid;
    height: 100%;
    font-family: var(--home-font-body, 'Manrope', 'Avenir Next', 'Segoe UI', sans-serif);
  }

  .hero__media {
    position: relative;
    height: 100%;
    min-height: clamp(16rem, 52vh, 21rem);
    border-radius: var(--home-radius-xl, 1.2rem);
    overflow: hidden;
    background:
      radial-gradient(130% 100% at 18% 18%, var(--home-accent-cyan, rgba(89, 215, 255, 0.2)), transparent 58%),
      radial-gradient(140% 100% at 88% 90%, var(--home-accent-warm, rgba(250, 182, 119, 0.16)), transparent 62%),
      linear-gradient(165deg, rgba(9, 14, 32, 0.96), rgba(4, 7, 20, 0.98));
    box-shadow: 0 22px 42px rgba(1, 6, 19, 0.35), 0 0 0 1px rgba(147, 176, 215, 0.14) inset;
  }

  :global(.hero__model) {
    width: 100%;
    height: 100%;
    min-height: clamp(16rem, 52vh, 21rem);
  }

  .hero__veil {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background:
      radial-gradient(130% 82% at 50% 112%, rgba(3, 8, 23, 0.92), rgba(3, 8, 23, 0) 56%),
      linear-gradient(180deg, rgba(3, 8, 23, 0) 62%, rgba(3, 8, 23, 0.3));
  }

  .hero__copy {
    position: absolute;
    left: 1rem;
    bottom: 0.95rem;
    z-index: 2;
    pointer-events: none;
  }

  .hero__copy h2 {
    margin: 0;
    font-family: var(--home-font-display, 'Sora', 'Avenir Next', 'Segoe UI', sans-serif);
    font-size: clamp(1.55rem, 5.2vw, 2.45rem);
    line-height: 1.04;
    letter-spacing: -0.012em;
    color: var(--home-text-primary, rgba(246, 250, 255, 0.97));
    text-shadow: 0 8px 24px rgba(3, 8, 23, 0.72);
  }

  .hero__copy p {
    margin: 0.22rem 0 0;
    font-size: 0.76rem;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: var(--home-text-secondary, rgba(196, 215, 238, 0.82));
  }
</style>
