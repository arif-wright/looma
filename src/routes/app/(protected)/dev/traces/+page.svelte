<script lang="ts">
  export let data: { items: Array<any> };

  let loading = false;
  let loadError: string | null = null;
  let limit = 25;
  let items: Array<any> = Array.isArray(data?.items) ? data.items : [];

  const fmt = (iso: string | null | undefined) => {
    if (!iso) return 'Unknown time';
    const parsed = new Date(iso);
    if (Number.isNaN(parsed.getTime())) return iso;
    return parsed.toLocaleString();
  };

  const reactionText = (trace: any): string | null => {
    const results = Array.isArray(trace?.results) ? trace.results : [];
    for (const result of results) {
      const text = result?.output?.reaction?.text;
      if (typeof text === 'string' && text.trim()) {
        return text.trim();
      }
    }
    return null;
  };

  const refresh = async () => {
    if (loading) return;
    loading = true;
    loadError = null;
    try {
      const res = await fetch(`/api/events/traces?limit=${limit}`);
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error ?? 'Unable to load traces');
      }
      items = Array.isArray(payload?.items) ? payload.items : [];
    } catch (err) {
      loadError = err instanceof Error ? err.message : 'Unable to load traces';
    } finally {
      loading = false;
    }
  };
</script>

<svelte:head>
  <title>Looma - Event Traces</title>
</svelte:head>

<main class="trace-page">
  <header class="trace-header">
    <div>
      <p class="eyebrow">Operations</p>
      <h1>Event Traces</h1>
      <p class="trace-subtitle">Inspect the latest dispatched events and agent outputs.</p>
    </div>
    <div class="trace-actions">
      <label>
        <span>Limit</span>
        <select bind:value={limit} disabled={loading}>
          <option value={10}>10</option>
          <option value={25}>25</option>
          <option value={50}>50</option>
        </select>
      </label>
      <button type="button" on:click={refresh} disabled={loading}>
        {loading ? 'Refreshing...' : 'Refresh'}
      </button>
    </div>
  </header>

  {#if loadError}
    <p class="trace-error">{loadError}</p>
  {/if}

  {#if items.length === 0}
    <p class="trace-empty">No traces captured yet. Trigger an event from the app to populate this list.</p>
  {:else}
    <section class="trace-list">
      {#each items as trace, idx}
        <article class="trace-card">
          <header class="trace-card__head">
            <p>#{idx + 1} - {trace?.event?.type ?? 'unknown'}</p>
            <p>{fmt(trace?.event?.timestamp)}</p>
          </header>
          <p class="trace-meta">
            <strong>Vetoed:</strong> {trace?.vetoed ? 'yes' : 'no'}
            {#if trace?.vetoReason}
              <span>- {trace.vetoReason}</span>
            {/if}
          </p>
          <p class="trace-meta">
            <strong>Reaction:</strong> {reactionText(trace) ?? 'none'}
          </p>
          <details>
            <summary>Agent outputs</summary>
            <pre>{JSON.stringify(trace?.results ?? [], null, 2)}</pre>
          </details>
        </article>
      {/each}
    </section>
  {/if}
</main>

<style>
  .trace-page {
    padding: clamp(1rem, 3vw, 2rem);
    display: grid;
    gap: 1rem;
  }

  .trace-header {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .eyebrow {
    margin: 0;
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.6);
  }

  h1 {
    margin: 0.15rem 0 0.35rem;
    font-size: 1.8rem;
  }

  .trace-subtitle {
    margin: 0;
    color: rgba(255, 255, 255, 0.7);
  }

  .trace-actions {
    display: flex;
    gap: 0.6rem;
    align-items: flex-end;
  }

  .trace-actions label {
    display: grid;
    gap: 0.3rem;
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.75);
  }

  .trace-actions select,
  .trace-actions button {
    border-radius: 0.75rem;
    border: 1px solid rgba(255, 255, 255, 0.16);
    background: rgba(8, 12, 26, 0.82);
    color: inherit;
    padding: 0.5rem 0.75rem;
  }

  .trace-error {
    margin: 0;
    color: #fca5a5;
  }

  .trace-empty {
    margin: 0;
    color: rgba(255, 255, 255, 0.75);
  }

  .trace-list {
    display: grid;
    gap: 0.75rem;
  }

  .trace-card {
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 0.9rem;
    background: rgba(8, 12, 24, 0.8);
    padding: 0.75rem;
    display: grid;
    gap: 0.5rem;
  }

  .trace-card__head {
    margin: 0;
    display: flex;
    justify-content: space-between;
    gap: 0.5rem;
    flex-wrap: wrap;
    font-weight: 600;
  }

  .trace-card__head p {
    margin: 0;
  }

  .trace-meta {
    margin: 0;
    color: rgba(255, 255, 255, 0.85);
  }

  details summary {
    cursor: pointer;
    color: rgba(255, 255, 255, 0.8);
  }

  pre {
    margin: 0.5rem 0 0;
    padding: 0.75rem;
    border-radius: 0.7rem;
    background: rgba(3, 6, 16, 0.9);
    overflow: auto;
    font-size: 0.78rem;
    line-height: 1.4;
  }
</style>
