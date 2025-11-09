<script lang="ts">
  export let data: {
    reports: Array<{
      id: number;
      reporter_id: string;
      target_kind: string;
      target_id: string;
      reason: string;
      details: string | null;
      status: string;
      created_at: string;
      reviewer_id: string | null;
    }>;
  };

  const STATUS_OPTIONS = ['open', 'reviewing', 'actioned', 'dismissed'];
</script>

<svelte:head>
  <title>Safety Reports · Admin</title>
</svelte:head>

<section class="admin-reports">
  <header>
    <div>
      <p class="eyebrow">Admin · Safety</p>
      <h1>Reports</h1>
    </div>
    <p class="count">{data.reports.length} total</p>
  </header>

  {#if data.reports.length === 0}
    <p class="empty">No reports yet.</p>
  {:else}
    <div class="reports">
      {#each data.reports as report}
        <article class="card">
          <div class="meta">
            <p class="sub">#{report.id} · {report.target_kind}</p>
            <p class="muted">Created {new Date(report.created_at).toLocaleString()}</p>
          </div>
          <dl>
            <div>
              <dt>Reporter</dt>
              <dd>{report.reporter_id}</dd>
            </div>
            <div>
              <dt>Target</dt>
              <dd>{report.target_id}</dd>
            </div>
            <div>
              <dt>Reason</dt>
              <dd>{report.reason}</dd>
            </div>
            <div>
              <dt>Details</dt>
              <dd>{report.details ?? '—'}</dd>
            </div>
          </dl>
          <form method="POST" action="?/update" class="status-form">
            <input type="hidden" name="id" value={report.id} />
            <label>
              <span>Status</span>
              <select name="status" required>
                {#each STATUS_OPTIONS as option}
                  <option value={option} selected={option === report.status}>{option}</option>
                {/each}
              </select>
            </label>
            <button type="submit">Update</button>
          </form>
        </article>
      {/each}
    </div>
  {/if}
</section>

<style>
  .admin-reports {
    max-width: 960px;
    margin: 0 auto;
    padding: 2rem 1.5rem 3rem;
  }

  header {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.12em;
    font-size: 0.75rem;
    color: var(--text-muted, #94a3b8);
    margin-bottom: 0.5rem;
  }

  .count {
    font-size: 0.9rem;
    color: var(--text-muted, #94a3b8);
  }

  .reports {
    display: grid;
    gap: 1rem;
  }

  .card {
    border-radius: 1rem;
    border: 1px solid rgba(148, 163, 184, 0.2);
    background: rgba(15, 23, 42, 0.75);
    padding: 1.25rem;
    box-shadow: 0 10px 30px rgba(15, 23, 42, 0.25);
  }

  .meta {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 1rem;
    margin-bottom: 0.75rem;
  }

  .sub {
    font-weight: 600;
  }

  .muted {
    color: rgba(148, 163, 184, 0.8);
    font-size: 0.85rem;
  }

  dl {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 0.75rem;
    margin: 0 0 1rem;
  }

  dt {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(148, 163, 184, 0.7);
    margin-bottom: 0.15rem;
  }

  dd {
    margin: 0;
    word-break: break-all;
  }

  .status-form {
    display: flex;
    gap: 0.75rem;
    align-items: flex-end;
    flex-wrap: wrap;
  }

  select,
  button {
    border-radius: 0.6rem;
    border: 1px solid rgba(148, 163, 184, 0.4);
    background: rgba(15, 23, 42, 0.6);
    color: inherit;
    padding: 0.45rem 0.75rem;
    font-size: 0.95rem;
  }

  button {
    background: #14b8a6;
    border-color: #14b8a6;
    color: #0f172a;
    font-weight: 600;
    cursor: pointer;
  }

  .empty {
    border: 1px dashed rgba(148, 163, 184, 0.4);
    border-radius: 1rem;
    padding: 2rem;
    text-align: center;
    color: rgba(148, 163, 184, 0.8);
  }
</style>
