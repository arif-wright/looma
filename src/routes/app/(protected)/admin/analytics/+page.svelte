<script lang="ts">
  export let data: {
    games: Array<{ id: string; slug: string; name: string }>;
    selectedGame: string | null;
    funnels: Array<{ day: string; starts: number; completes: number }>;
    scoreDistribution: Array<{ bucket: number; start: number; end: number; count: number }>;
    averageDurationMs: number | null;
    shares: Array<{ day: string; count: number }>;
    recentEvents: Array<{
      inserted_at: string;
      kind: string;
      user_id: string | null;
      game_id: string | null;
      game_slug: string | null;
      game_name: string | null;
      score: number | null;
      duration_ms: number | null;
      amount: number | null;
      currency: string | null;
      meta: Record<string, unknown>;
    }>;
  };

  const funnelMax = Math.max(
    1,
    ...data.funnels.map((entry) => Math.max(entry.starts, entry.completes))
  );

  const scoreMax = Math.max(1, ...data.scoreDistribution.map((entry) => entry.count));
  const shareMax = Math.max(1, ...data.shares.map((entry) => entry.count));

  const formatDuration = (ms: number | null) => {
    if (!ms || !Number.isFinite(ms)) return '—';
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.round((ms % 60000) / 1000);
    return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`;
  };

  const formatDate = (iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString();
  };
</script>

<svelte:head>
  <title>Analytics — Looma Admin</title>
</svelte:head>

<div class="analytics-shell">
  <header class="analytics-header">
    <div>
      <h1>Analytics Overview</h1>
      <p>Game and economy signals across the last seven days.</p>
    </div>
    <form method="get" class="game-filter">
      <label>
        <span>Score distribution game</span>
        <select name="game" aria-label="Select game for score distribution" on:change={(event) => event.currentTarget?.form?.submit()}>
          {#each data.games as game}
            <option value={game.slug} selected={game.slug === data.selectedGame}>
              {game.name}
            </option>
          {/each}
        </select>
      </label>
      <button type="submit">Apply</button>
    </form>
  </header>

  <section class="grid-cards">
    <article class="card" data-testid="admin-analytics-funnel">
      <header>
        <h2>Game funnel</h2>
        <p>Starts vs completes per day</p>
      </header>
      <ul class="chart chart-double">
        {#each data.funnels as entry}
          <li>
            <span class="chart-label">{entry.day.slice(5)}</span>
            <div class="chart-bars">
              <span
                class="bar starts"
                style={`width:${(entry.starts / funnelMax) * 100}%`}
                aria-label={`Starts: ${entry.starts}`}
              ></span>
              <span
                class="bar completes"
                style={`width:${(entry.completes / funnelMax) * 100}%`}
                aria-label={`Completes: ${entry.completes}`}
              ></span>
            </div>
            <div class="chart-values">
              <span>{entry.starts}</span>
              <span>{entry.completes}</span>
            </div>
          </li>
        {/each}
      </ul>
    </article>

    <article class="card">
      <header>
        <h2>Avg session duration</h2>
        <p>Last 7 days</p>
      </header>
      <div class="metric-highlight">
        <span>{formatDuration(data.averageDurationMs)}</span>
      </div>
    </article>

    <article class="card" data-testid="admin-analytics-score-dist">
      <header>
        <h2>Score distribution</h2>
        <p>{data.selectedGame ?? data.games[0]?.slug ?? ''}</p>
      </header>
      {#if data.scoreDistribution.length === 0}
        <p class="empty">No data for selected game.</p>
      {:else}
        <ul class="chart chart-single">
          {#each data.scoreDistribution as entry}
            <li>
              <span class="chart-label">{entry.start.toLocaleString()}–{entry.end.toLocaleString()}</span>
              <div class="chart-bars">
                <span
                  class="bar counts"
                  style={`width:${(entry.count / scoreMax) * 100}%`}
                  aria-label={`Scores: ${entry.count}`}
                ></span>
              </div>
              <div class="chart-values">
                <span>{entry.count}</span>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </article>

    <article class="card">
      <header>
        <h2>Shares per day</h2>
        <p>Last 7 days</p>
      </header>
      <ul class="chart chart-single">
        {#each data.shares as entry}
          <li>
            <span class="chart-label">{entry.day.slice(5)}</span>
            <div class="chart-bars">
              <span
                class="bar shares"
                style={`width:${(entry.count / shareMax) * 100}%`}
                aria-label={`Shares: ${entry.count}`}
              ></span>
            </div>
            <div class="chart-values">
              <span>{entry.count}</span>
            </div>
          </li>
        {/each}
      </ul>
    </article>
  </section>

  <section class="card recent" data-testid="admin-analytics-events">
    <header>
      <h2>Recent events</h2>
      <p>Latest 100 analytics events with core payloads.</p>
    </header>
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Kind</th>
            <th>User</th>
            <th>Game</th>
            <th>Score</th>
            <th>Duration</th>
            <th>Amount</th>
            <th>Meta</th>
          </tr>
        </thead>
        <tbody>
          {#if data.recentEvents.length === 0}
            <tr>
              <td colspan="8" class="empty">No analytics events yet.</td>
            </tr>
          {:else}
            {#each data.recentEvents as entry}
              <tr>
                <td>{formatDate(entry.inserted_at)}</td>
                <td><code>{entry.kind}</code></td>
                <td><code>{entry.user_id ?? '—'}</code></td>
                <td>{entry.game_name ?? entry.game_slug ?? '—'}</td>
                <td>{entry.score ?? '—'}</td>
                <td>{formatDuration(entry.duration_ms)}</td>
                <td>{entry.amount ? `${entry.amount} ${entry.currency ?? ''}` : '—'}</td>
                <td>
                  <pre>{JSON.stringify(entry.meta ?? {}, null, 2)}</pre>
                </td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </section>
</div>

<style>
  .analytics-shell {
    display: grid;
    gap: 1.5rem;
    padding: 2rem;
    color: white;
  }

  .analytics-header {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 1rem;
    align-items: flex-end;
  }

  .analytics-header h1 {
    margin: 0;
    font-size: 2.2rem;
  }

  .analytics-header p {
    margin: 0.25rem 0 0;
    color: rgba(255, 255, 255, 0.7);
  }

  .game-filter {
    display: flex;
    align-items: flex-end;
    gap: 0.75rem;
  }

  .game-filter label {
    display: grid;
    gap: 0.35rem;
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .game-filter select {
    background: rgba(10, 15, 30, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 0.5rem;
    padding: 0.5rem 0.75rem;
    color: inherit;
  }

  .game-filter button {
    border-radius: 0.5rem;
    border: none;
    padding: 0.55rem 1.2rem;
    font-weight: 600;
    background: linear-gradient(120deg, rgba(155, 92, 255, 0.85), rgba(77, 244, 255, 0.85));
    color: rgba(10, 14, 32, 0.9);
    cursor: pointer;
  }

  .grid-cards {
    display: grid;
    gap: 1.2rem;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
  }

  .card {
    display: grid;
    gap: 0.75rem;
    padding: 1.25rem;
    border-radius: 1rem;
    background: rgba(11, 17, 34, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 18px 36px rgba(9, 12, 30, 0.45);
  }

  .card header h2 {
    margin: 0;
    font-size: 1.1rem;
  }

  .card header p {
    margin: 0.2rem 0 0;
    font-size: 0.85rem;
    color: rgba(200, 214, 255, 0.7);
  }

  .metric-highlight span {
    font-size: 2.2rem;
    font-weight: 600;
  }

  .chart {
    list-style: none;
    margin: 0;
    padding: 0;
    display: grid;
    gap: 0.55rem;
  }

  .chart li {
    display: grid;
    gap: 0.35rem;
  }

  .chart-label {
    font-size: 0.78rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(200, 220, 255, 0.6);
  }

  .chart-bars {
    display: flex;
    gap: 0.4rem;
  }

  .bar {
    display: inline-block;
    height: 0.6rem;
    border-radius: 999px;
  }

  .chart-double .bar {
    height: 0.5rem;
  }

  .starts {
    background: rgba(122, 202, 255, 0.75);
  }

  .completes {
    background: rgba(90, 255, 195, 0.75);
  }

  .counts {
    background: rgba(215, 145, 255, 0.75);
  }

  .shares {
    background: rgba(255, 210, 130, 0.8);
  }

  .chart-values {
    display: flex;
    gap: 0.6rem;
    font-size: 0.8rem;
    color: rgba(216, 228, 255, 0.75);
  }

  .chart-double .chart-values {
    justify-content: space-between;
  }

  .empty {
    color: rgba(255, 255, 255, 0.6);
    font-size: 0.85rem;
  }

  .recent {
    display: grid;
    gap: 1rem;
  }

  .table-scroll {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
  }

  th,
  td {
    padding: 0.65rem 0.8rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    text-align: left;
    font-size: 0.85rem;
  }

  th {
    text-transform: uppercase;
    font-size: 0.75rem;
    letter-spacing: 0.12em;
    color: rgba(198, 214, 255, 0.7);
  }

  td code {
    font-family: var(--font-mono, 'Menlo'), monospace;
    font-size: 0.78rem;
    background: rgba(255, 255, 255, 0.08);
    padding: 0.15rem 0.4rem;
    border-radius: 0.4rem;
  }

  td pre {
    margin: 0;
    font-size: 0.75rem;
    white-space: pre-wrap;
    word-break: break-word;
    background: rgba(255, 255, 255, 0.05);
    padding: 0.4rem 0.55rem;
    border-radius: 0.5rem;
    max-height: 160px;
    overflow-y: auto;
  }

  @media (max-width: 720px) {
    .analytics-shell {
      padding: 1.25rem;
    }
    .grid-cards {
      grid-template-columns: 1fr;
    }
  }
</style>
