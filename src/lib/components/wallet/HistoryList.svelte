<script lang="ts">
  export let tx: Array<{
    kind: string;
    amount: number;
    source: string;
    created_at: string;
  }> = [];

  const formatDate = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.valueOf()) ? 'Unknown' : date.toLocaleString();
  };
</script>

{#if !tx?.length}
  <p class="empty">No transactions yet.</p>
{:else}
  <ul class="list">
    {#each tx as t}
      <li class="item">
        <div class="item-source">{t.source || 'Transaction'}</div>
        <div class={`item-amount ${t.kind === 'credit' ? 'credit' : 'debit'}`}>
          {t.kind === 'credit' ? '+' : ''}{t.amount}
        </div>
        <div class="item-date">{formatDate(t.created_at)}</div>
      </li>
    {/each}
  </ul>
{/if}

<style>
  .empty {
    font-size: 0.9rem;
    color: rgba(255, 255, 255, 0.6);
  }

  .list {
    overflow: hidden;
    border-radius: 1.25rem;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid rgba(255, 255, 255, 0.12);
  }

  .item {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 1rem;
    align-items: center;
    padding: 0.85rem 1.1rem;
    border-top: 1px solid rgba(255, 255, 255, 0.07);
  }

  .item:first-child {
    border-top: none;
  }

  .item-source {
    font-size: 0.95rem;
    color: rgba(255, 255, 255, 0.8);
    text-transform: capitalize;
  }

  .item-amount {
    font-weight: 600;
    font-size: 0.95rem;
    font-variant-numeric: tabular-nums;
  }

  .item-amount.credit {
    color: #4ade80;
  }

  .item-amount.debit {
    color: #f87171;
  }

  .item-date {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.5);
    text-align: right;
  }

  @media (max-width: 600px) {
    .item {
      grid-template-columns: 1fr;
      align-items: flex-start;
      gap: 0.4rem;
    }

    .item-date {
      text-align: left;
    }
  }
</style>
