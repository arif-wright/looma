<script lang="ts">
  export let data: {
    audit: Array<{
      id: string;
      user_id: string | null;
      session_id: string | null;
      event: string;
      ip: string | null;
      details: Record<string, unknown>;
      inserted_at: string;
    }>;
    filters: { session: string | null; user: string | null; event: string | null };
  };

  const formatDate = (iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleString();
  };
</script>

<svelte:head>
  <title>Game Audit — Looma Admin</title>
</svelte:head>

<div class="audit-shell">
  <header class="audit-header">
    <h1>Game Audit Log</h1>
    <p>Latest game session events. Use filters to narrow by user, session, or event type.</p>
  </header>

  <form method="get" class="audit-filters">
    <label>
      <span>Session ID</span>
      <input type="text" name="session" value={data.filters.session ?? ''} placeholder="session uuid" />
    </label>
    <label>
      <span>User ID</span>
      <input type="text" name="user" value={data.filters.user ?? ''} placeholder="user uuid" />
    </label>
    <label>
      <span>Event</span>
      <input type="text" name="event" value={data.filters.event ?? ''} placeholder="start / complete / reject" />
    </label>
    <button type="submit">Apply</button>
  </form>

  <section class="audit-table-wrapper">
    <table class="audit-table">
      <thead>
        <tr>
          <th>Timestamp</th>
          <th>Event</th>
          <th>User</th>
          <th>Session</th>
          <th>IP</th>
          <th>Details</th>
        </tr>
      </thead>
      <tbody>
        {#if data.audit.length === 0}
          <tr>
            <td colspan="6" class="empty">No audit entries found.</td>
          </tr>
        {:else}
          {#each data.audit as entry}
            <tr>
              <td>{formatDate(entry.inserted_at)}</td>
              <td><code>{entry.event}</code></td>
              <td><code>{entry.user_id ?? '—'}</code></td>
              <td><code>{entry.session_id ?? '—'}</code></td>
              <td>{entry.ip ?? '—'}</td>
              <td>
                <pre>{JSON.stringify(entry.details ?? {}, null, 2)}</pre>
              </td>
            </tr>
          {/each}
        {/if}
      </tbody>
    </table>
  </section>
</div>

<style>
  .audit-shell {
    display: grid;
    gap: 1.5rem;
    padding: 2rem;
    color: white;
  }

  .audit-header h1 {
    font-size: 2rem;
    margin: 0;
  }

  .audit-header p {
    margin: 0.25rem 0 0;
    color: rgba(255, 255, 255, 0.7);
  }

  .audit-filters {
    display: grid;
    gap: 0.75rem;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    align-items: end;
  }

  .audit-filters label {
    display: grid;
    gap: 0.3rem;
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .audit-filters input {
    border-radius: 0.5rem;
    border: 1px solid rgba(255, 255, 255, 0.2);
    background: rgba(10, 15, 30, 0.6);
    color: white;
    padding: 0.5rem 0.75rem;
  }

  .audit-filters button {
    border-radius: 0.5rem;
    border: none;
    padding: 0.6rem 1.5rem;
    background: linear-gradient(120deg, rgba(155, 92, 255, 0.85), rgba(77, 244, 255, 0.85));
    color: rgba(10, 14, 32, 0.9);
    font-weight: 600;
    cursor: pointer;
  }

  .audit-table-wrapper {
    overflow-x: auto;
  }

  .audit-table {
    width: 100%;
    border-collapse: collapse;
    background: rgba(11, 17, 34, 0.7);
    border-radius: 0.75rem;
    overflow: hidden;
  }

  .audit-table th,
  .audit-table td {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.06);
    text-align: left;
    vertical-align: top;
  }

  .audit-table th {
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    color: rgba(173, 187, 255, 0.7);
  }

  .audit-table td code {
    font-family: var(--font-mono, 'Menlo'), monospace;
    font-size: 0.78rem;
    background: rgba(255, 255, 255, 0.08);
    padding: 0.15rem 0.4rem;
    border-radius: 0.35rem;
  }

  .audit-table td pre {
    margin: 0;
    font-size: 0.75rem;
    white-space: pre-wrap;
    word-break: break-word;
    background: rgba(255, 255, 255, 0.05);
    padding: 0.4rem 0.6rem;
    border-radius: 0.5rem;
    max-height: 160px;
    overflow-y: auto;
  }

  .audit-table tr:last-child td {
    border-bottom: none;
  }

  .audit-table .empty {
    text-align: center;
    color: rgba(255, 255, 255, 0.6);
  }
</style>
