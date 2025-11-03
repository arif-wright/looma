<script lang="ts">
  export let data: {
    games: Array<{ id: string; slug: string; name: string }>;
    anomalies: Array<{
      id: string;
      user_id: string | null;
      session_id: string | null;
      type: string;
      severity: number;
      details: Record<string, unknown>;
      inserted_at: string;
      reviewed_at: string | null;
    }>;
    counters: Array<{ type: string; count: number }>;
    filters: { game: string | null; severity: string | null };
  };

  let rows = data.anomalies;
  let marking = new Set<string>();

  const formatDate = (iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString();
  };

  const severityLabel = (severity: number) => {
    switch (severity) {
      case 5:
        return 'Critical';
      case 4:
        return 'High';
      case 3:
        return 'Medium';
      case 2:
        return 'Low';
      default:
        return 'Info';
    }
  };

  const markReviewed = async (id: string) => {
    if (marking.has(id)) return;
    marking.add(id);
    try {
      const response = await fetch(`/api/admin/anomalies/${id}/review`, { method: 'POST' });
      if (!response.ok) {
        console.error('[anti] mark reviewed failed', await response.text());
        return;
      }
      const payload = await response.json();
      rows = rows.map((row) =>
        row.id === id
          ? {
              ...row,
              reviewed_at: payload.reviewedAt ?? new Date().toISOString()
            }
          : row
      );
    } catch (err) {
      console.error('[anti] mark reviewed error', err);
    } finally {
      marking.delete(id);
      rows = [...rows];
    }
  };
</script>

<svelte:head>
  <title>Anti-Cheat — Looma Admin</title>
</svelte:head>

<div class="anti-shell">
  <header class="anti-header">
    <div>
      <h1>Anti-cheat signals</h1>
      <p>Review flagged sessions and mark items that have been triaged.</p>
    </div>
    <form method="get" class="filters">
      <label>
        <span>Game</span>
        <select name="game" on:change={(event) => event.currentTarget?.form?.submit()}>
          <option value="">All</option>
          {#each data.games as game}
            <option value={game.slug} selected={game.slug === data.filters.game}>
              {game.name}
            </option>
          {/each}
        </select>
      </label>
      <label>
        <span>Severity ≥</span>
        <select name="severity" on:change={(event) => event.currentTarget?.form?.submit()}>
          <option value="">All</option>
          {#each [1, 2, 3, 4, 5] as level}
            <option value={String(level)} selected={String(level) === (data.filters.severity ?? '')}>
              {level}
            </option>
          {/each}
        </select>
      </label>
      <button type="submit">Apply</button>
    </form>
  </header>

  <section class="badges">
    {#if data.counters.length === 0}
      <span class="badge empty">No anomalies recorded.</span>
    {:else}
      {#each data.counters as counter}
        <span class="badge">
          {counter.type} <strong>{counter.count}</strong>
        </span>
      {/each}
    {/if}
  </section>

  <section class="table-card" data-testid="admin-anti-table">
    <div class="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Time</th>
            <th>Type</th>
            <th>Severity</th>
            <th>User</th>
            <th>Session</th>
            <th>Details</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {#if rows.length === 0}
            <tr>
              <td colspan="8" class="empty">Nothing flagged with current filters.</td>
            </tr>
          {:else}
            {#each rows as row (row.id)}
              <tr class:reviewed={row.reviewed_at !== null}>
                <td>{formatDate(row.inserted_at)}</td>
                <td><code>{row.type}</code></td>
                <td>
                  <span class={`severity severity-${row.severity}`}>
                    {severityLabel(row.severity)} ({row.severity})
                  </span>
                </td>
                <td><code>{row.user_id ?? '—'}</code></td>
                <td><code>{row.session_id ?? '—'}</code></td>
                <td>
                  <pre>{JSON.stringify(row.details ?? {}, null, 2)}</pre>
                </td>
                <td>{row.reviewed_at ? `Reviewed ${formatDate(row.reviewed_at)}` : 'Open'}</td>
                <td>
                  {#if row.reviewed_at}
                    <span class="status-pill done">Reviewed</span>
                  {:else}
                    <button
                      type="button"
                      class="status-pill action"
                      on:click={() => markReviewed(row.id)}
                      disabled={marking.has(row.id)}
                    >
                      {marking.has(row.id) ? 'Marking…' : 'Mark reviewed'}
                    </button>
                  {/if}
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
  .anti-shell {
    display: grid;
    gap: 1.5rem;
    padding: 2rem;
    color: white;
  }

  .anti-header {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 1rem;
    align-items: flex-end;
  }

  .anti-header h1 {
    margin: 0;
    font-size: 2.1rem;
  }

  .anti-header p {
    margin: 0.3rem 0 0;
    color: rgba(255, 255, 255, 0.7);
  }

  .filters {
    display: flex;
    align-items: flex-end;
    gap: 0.75rem;
  }

  .filters label {
    display: grid;
    gap: 0.3rem;
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .filters select {
    background: rgba(10, 15, 30, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.2);
    border-radius: 0.5rem;
    padding: 0.5rem 0.75rem;
    color: inherit;
  }

  .filters button {
    padding: 0.55rem 1.2rem;
    border-radius: 0.5rem;
    border: none;
    font-weight: 600;
    background: linear-gradient(120deg, rgba(255, 205, 120, 0.85), rgba(255, 135, 180, 0.9));
    color: rgba(26, 16, 38, 0.95);
    cursor: pointer;
  }

  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .badge {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    padding: 0.4rem 0.7rem;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.1);
    border: 1px solid rgba(255, 255, 255, 0.12);
    font-size: 0.8rem;
  }

  .badge strong {
    font-size: 0.95rem;
  }

  .badge.empty {
    color: rgba(255, 255, 255, 0.6);
  }

  .table-card {
    padding: 1.25rem;
    border-radius: 1rem;
    background: rgba(11, 17, 34, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 18px 36px rgba(8, 12, 30, 0.45);
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
    padding: 0.65rem 0.85rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    text-align: left;
    vertical-align: top;
    font-size: 0.85rem;
  }

  th {
    text-transform: uppercase;
    font-size: 0.75rem;
    letter-spacing: 0.12em;
    color: rgba(194, 210, 255, 0.7);
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
    max-height: 140px;
    overflow-y: auto;
  }

  .severity {
    display: inline-flex;
    align-items: center;
    padding: 0.2rem 0.6rem;
    border-radius: 999px;
    font-size: 0.75rem;
  }

  .severity-5 {
    background: rgba(255, 100, 120, 0.18);
    color: rgba(255, 150, 150, 0.95);
  }

  .severity-4 {
    background: rgba(255, 160, 100, 0.18);
    color: rgba(255, 190, 150, 0.95);
  }

  .severity-3 {
    background: rgba(255, 210, 120, 0.18);
    color: rgba(255, 220, 160, 0.95);
  }

  .severity-2 {
    background: rgba(130, 210, 255, 0.18);
    color: rgba(180, 230, 255, 0.95);
  }

  .severity-1 {
    background: rgba(160, 255, 200, 0.18);
    color: rgba(200, 255, 225, 0.95);
  }

  .status-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    border-radius: 999px;
    padding: 0.35rem 0.8rem;
    font-size: 0.75rem;
    border: none;
    cursor: pointer;
  }

  .status-pill.done {
    background: rgba(120, 255, 195, 0.18);
    color: rgba(160, 255, 215, 0.95);
  }

  .status-pill.action {
    background: rgba(255, 255, 255, 0.14);
    color: rgba(240, 240, 255, 0.9);
  }

  .status-pill.action:disabled {
    opacity: 0.6;
    cursor: default;
  }

  tr.reviewed td {
    opacity: 0.7;
  }

  .empty {
    color: rgba(255, 255, 255, 0.65);
    text-align: center;
  }

  @media (max-width: 720px) {
    .anti-shell {
      padding: 1.25rem;
    }

    .filters {
      width: 100%;
      flex-direction: column;
      align-items: stretch;
    }

    .filters button {
      width: 100%;
    }
  }
</style>
