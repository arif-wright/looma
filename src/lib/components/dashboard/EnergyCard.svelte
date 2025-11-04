<script lang="ts">
  export let current = 42;
  export let max = 60;

  const percent = max > 0 ? Math.min(100, Math.round((current / max) * 100)) : 0;
</script>

<section class="energy">
  <header>
    <span class="label">Energy</span>
    <span class="value">{current}/{max}</span>
  </header>
  <div class="meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent}>
    <span style={`width:${percent}%`}></span>
  </div>
  <p class="hint">Keep the pulse above 50 for smooth missions.</p>
</section>

<style>
  .energy {
    display: grid;
    gap: 0.65rem;
    padding: 1.2rem;
    border-radius: 1.4rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(148, 163, 184, 0.2);
    box-shadow: 0 0 16px rgba(147, 197, 253, 0.12);
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
  }

  .label {
    font-size: 0.78rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    color: rgba(226, 232, 240, 0.6);
  }

  .value {
    font-weight: 700;
    color: rgba(248, 250, 252, 0.95);
  }

  .meter {
    position: relative;
    height: 0.55rem;
    border-radius: 999px;
    background: rgba(56, 189, 248, 0.16);
    overflow: hidden;
  }

  .meter span {
    display: block;
    height: 100%;
    background: linear-gradient(90deg, rgba(56, 189, 248, 0.95), rgba(147, 197, 253, 0.9));
    transition: width 320ms ease;
  }

  .hint {
    margin: 0;
    font-size: 0.8rem;
    color: rgba(226, 232, 240, 0.65);
  }

  @media (prefers-reduced-motion: reduce) {
    .meter span {
      transition: none;
    }
  }
</style>
