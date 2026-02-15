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
      glowIntensity={50}
      motionScale={0.95}
      minSize={220}
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
    display: grid;
    gap: 0.8rem;
  }

  .hero__media {
    position: relative;
    min-height: clamp(14rem, 48vh, 19rem);
    border-radius: 1.2rem;
    overflow: hidden;
    background:
      radial-gradient(120% 90% at 16% 20%, rgba(89, 215, 255, 0.18), transparent 56%),
      radial-gradient(120% 90% at 88% 88%, rgba(250, 182, 119, 0.12), transparent 60%),
      linear-gradient(165deg, rgba(7, 12, 29, 0.95), rgba(4, 7, 20, 0.98));
    box-shadow: 0 26px 50px rgba(1, 6, 19, 0.4);
  }

  :global(.hero__model) {
    width: 100%;
    height: 100%;
    min-height: clamp(14rem, 48vh, 19rem);
  }

  .hero__veil {
    position: absolute;
    inset: 0;
    pointer-events: none;
    background: radial-gradient(110% 74% at 50% 112%, rgba(3, 8, 23, 0.9), rgba(3, 8, 23, 0) 56%);
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
    font-size: clamp(1.5rem, 5vw, 2.3rem);
    line-height: 1.04;
    letter-spacing: -0.01em;
    color: rgba(246, 250, 255, 0.97);
    text-shadow: 0 8px 24px rgba(3, 8, 23, 0.7);
  }

  .hero__copy p {
    margin: 0.22rem 0 0;
    font-size: 0.78rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(196, 215, 238, 0.82);
  }
</style>
