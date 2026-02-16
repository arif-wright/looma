<script lang="ts">
  export let name = 'Mirae';
  export let species = 'Muse';
  export let closenessState: 'Distant' | 'Near' | 'Resonant' = 'Near';

  $: intensity = closenessState === 'Distant' ? '0.68' : closenessState === 'Resonant' ? '1.06' : '0.9';
</script>

<section class="core" aria-label="Companion core" style={`--core-intensity:${intensity};`}>
  <div class="core__halo"></div>
  <div class="core__cloud" aria-hidden="true">
    <span class="lobe lobe--a"></span>
    <span class="lobe lobe--b"></span>
    <span class="lobe lobe--c"></span>
    <span class="core__inner"></span>
  </div>
  <h2>{name}</h2>
  <p>{species}</p>
</section>

<style>
  .core {
    position: relative;
    width: min(74vw, 22rem);
    margin: 0 auto;
    text-align: center;
    padding-top: 1.2rem;
  }

  .core__halo {
    position: absolute;
    inset: 8% 14% auto;
    height: 9rem;
    border-radius: 999px;
    background: radial-gradient(circle, rgba(255, 203, 148, calc(0.34 * var(--core-intensity))), rgba(255, 203, 148, 0) 72%);
    filter: blur(22px);
    pointer-events: none;
    animation: haloBreath 10s ease-in-out infinite;
  }

  .core__cloud {
    position: relative;
    width: clamp(8.8rem, 30vw, 11rem);
    aspect-ratio: 1.05 / 0.78;
    margin: 0 auto;
    filter: drop-shadow(0 0 24px rgba(255, 205, 144, calc(0.28 * var(--core-intensity))));
    animation: cloudFloat 8.5s ease-in-out infinite;
  }

  .lobe,
  .core__inner {
    position: absolute;
    border-radius: 999px;
    background:
      radial-gradient(circle at 35% 30%, rgba(255, 239, 212, 0.9), rgba(255, 198, 136, 0.62) 48%, rgba(192, 143, 255, 0.45) 86%);
    box-shadow:
      inset 0 -10px 20px rgba(84, 46, 128, 0.2),
      0 0 18px rgba(255, 215, 169, 0.28);
  }

  .lobe--a {
    left: 8%;
    top: 22%;
    width: 34%;
    height: 56%;
  }

  .lobe--b {
    left: 29%;
    top: 4%;
    width: 42%;
    height: 60%;
  }

  .lobe--c {
    right: 8%;
    top: 24%;
    width: 34%;
    height: 54%;
  }

  .core__inner {
    left: 16%;
    right: 16%;
    bottom: 10%;
    top: 34%;
    border-radius: 45% 45% 52% 52%;
  }

  h2 {
    margin: 0.9rem 0 0;
    font-family: var(--home-font-display, 'Sora', 'Avenir Next', 'Segoe UI', sans-serif);
    font-size: clamp(2rem, 6.4vw, 3.25rem);
    line-height: 1;
    letter-spacing: -0.02em;
    color: rgba(248, 243, 232, 0.96);
    text-shadow: 0 8px 28px rgba(39, 31, 79, 0.36);
  }

  p {
    margin: 0.3rem 0 0;
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.11em;
    color: rgba(221, 230, 244, 0.78);
  }

  @keyframes cloudFloat {
    0%, 100% { transform: translateY(0) scale(1); }
    50% { transform: translateY(-4px) scale(1.015); }
  }

  @keyframes haloBreath {
    0%, 100% { transform: scale(1); opacity: 0.8; }
    50% { transform: scale(1.08); opacity: 1; }
  }
</style>
