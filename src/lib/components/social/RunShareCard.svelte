<script lang="ts">
  export type RunShareMeta = {
    game?: {
      slug?: string | null;
      name?: string | null;
    } | null;
    score?: number | null;
    durationMs?: number | null;
    sessionId?: string | null;
    deepLink?: string | null;
    preview?: {
      title?: string | null;
      subtitle?: string | null;
      thumbnail?: string | null;
    } | null;
  };

  export let meta: RunShareMeta;
  export let compact = false;

  const fmt = new Intl.NumberFormat('en-US');

  const scoreLabel = () => fmt.format(Math.max(0, Math.floor(meta?.score ?? 0)));
  const durationSeconds = () => Math.max(0, Math.round((meta?.durationMs ?? 0) / 1000));
  const link = () => meta?.deepLink ?? (meta?.game?.slug ? `/app/games/${meta.game.slug}` : '/app/games');
  const gameName = () => meta?.game?.name ?? 'This run';
  const subtitle = () => meta?.preview?.subtitle ?? `${durationSeconds()}s run`;
  const title = () => meta?.preview?.title ?? `${gameName()} — ${scoreLabel()} pts`;
</script>

<article class={`run-share-card ${compact ? 'compact' : ''}`} data-testid="run-share-card">
  <div class="card-body">
    <header class="card-head">
      <p class="card-label">{gameName()}</p>
      <h3 class="card-title">{title()}</h3>
      <p class="card-subtitle">{subtitle()}</p>
    </header>

    <div class="card-metrics" aria-label="Run summary">
      <div class="metric">
        <span class="metric-label">Score</span>
        <span class="metric-value">{scoreLabel()}</span>
      </div>
      <div class="metric">
        <span class="metric-label">Time</span>
        <span class="metric-value">{durationSeconds()}s</span>
      </div>
    </div>

    <a class="card-cta" href={link()} data-testid="run-share-cta">
      Play again
    </a>
  </div>
  <div class="card-accent" aria-hidden="true"></div>
</article>

<style>
  .run-share-card {
    width: 100%;
    position: relative;
    display: grid;
    overflow: hidden;
    border-radius: 1rem;
    border: 1px solid rgba(120, 190, 255, 0.18);
    background: radial-gradient(circle at 20% 20%, rgba(120, 180, 255, 0.28), rgba(5, 8, 18, 0.9));
    box-shadow: 0 20px 48px rgba(8, 12, 26, 0.5);
    color: rgba(236, 244, 255, 0.95);
    isolation: isolate;
  }

  .run-share-card.compact {
    grid-template-columns: 1fr;
  }

  .card-body {
    padding: 1rem 1.2rem 1.3rem;
    display: grid;
    gap: 0.85rem;
  }

  .card-head {
    display: grid;
    gap: 0.35rem;
  }

  .card-label {
    margin: 0;
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.16em;
    color: rgba(200, 224, 255, 0.6);
  }

  .card-title {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
  }

  .card-subtitle {
    margin: 0;
    font-size: 0.9rem;
    color: rgba(210, 228, 255, 0.75);
  }

  .card-metrics {
    display: flex;
    gap: 1.2rem;
    flex-wrap: wrap;
  }

  .metric {
    display: grid;
    gap: 0.2rem;
    padding: 0.6rem 0.9rem;
    border-radius: 0.8rem;
    background: rgba(13, 20, 40, 0.6);
    border: 1px solid rgba(140, 190, 255, 0.18);
  }

  .metric-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: rgba(180, 210, 255, 0.7);
  }

  .metric-value {
    font-size: 1.05rem;
    font-weight: 600;
  }

  .card-cta {
    align-self: flex-start;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.55rem 1.4rem;
    border-radius: 999px;
    background: linear-gradient(120deg, rgba(140, 102, 255, 0.9), rgba(65, 215, 255, 0.9));
    color: rgba(12, 15, 32, 0.92);
    font-weight: 600;
    text-decoration: none;
    transition: transform 0.15s ease, box-shadow 0.15s ease;
  }

  .card-cta:hover,
  .card-cta:focus-visible {
    transform: translateY(-1px);
    box-shadow: 0 12px 30px rgba(72, 210, 255, 0.3);
    outline: none;
  }

  .card-accent {
    position: absolute;
    inset: auto -30% -20% auto;
    width: 180px;
    height: 180px;
    background: radial-gradient(circle, rgba(65, 215, 255, 0.4), transparent 70%);
    transform: rotate(12deg);
    opacity: 0.8;
    pointer-events: none;
  }

  @media (prefers-reduced-motion: reduce) {
    .card-cta,
    .card-accent {
      transition: none;
    }
  }
</style>
