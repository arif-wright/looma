<script lang="ts">
  export let data: {
    metrics: {
      profileCount: number;
      itemCount: number;
      reportOpenCount: number;
      dau: number;
      mau: number;
      totalShards30d: number;
      orders30d: number;
    };
    recentOrders: Array<{ id: string; price_shards: number; created_at: string; user_id: string; slug: string }>;
    recentReports: Array<{ id: number; target_kind: string; reason: string; status: string; created_at: string }>;
  };

  const { metrics, recentOrders, recentReports } = data;
</script>

<div class="mx-auto max-w-6xl px-4 py-8 space-y-8">
  <header class="flex flex-wrap items-center justify-between gap-3">
    <h1 class="text-2xl font-semibold tracking-tight">Admin</h1>
    <div class="flex flex-wrap gap-2">
      <a href="/app/(protected)/admin/shop" class="btn-link">Shop Admin</a>
      <a href="/app/(protected)/admin/reports" class="btn-link">Reports</a>
    </div>
  </header>

  <section class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
    <div class="card">
      <p class="label">Users (Profiles)</p>
      <p class="value">{metrics.profileCount.toLocaleString()}</p>
      <p class="hint">DAU: {metrics.dau.toLocaleString()} · MAU: {metrics.mau.toLocaleString()}</p>
    </div>
    <div class="card">
      <p class="label">Shop Items</p>
      <p class="value">{metrics.itemCount.toLocaleString()}</p>
      <p class="hint">Manage inventory & pricing</p>
    </div>
    <div class="card">
      <p class="label">Open Reports</p>
      <p class="value">{metrics.reportOpenCount.toLocaleString()}</p>
      <p class="hint"><a href="/app/(protected)/admin/reports" class="underline">Review now</a></p>
    </div>
    <div class="card revenue sm:col-span-2 lg:col-span-3">
      <p class="label">Shards Revenue (30d)</p>
      <p class="value">
        {metrics.totalShards30d.toLocaleString()}
        <span class="unit">SHARDS</span>
      </p>
      <p class="hint">Orders: {metrics.orders30d.toLocaleString()}</p>
    </div>
  </section>

  <section class="grid grid-cols-1 lg:grid-cols-2 gap-4">
    <div class="panel">
      <div class="panel-head">Recent Orders</div>
      <div class="panel-body">
        {#if recentOrders.length}
          <ul class="list">
            {#each recentOrders as o}
              <li>
                <div>
                  <p class="item-title">Order #{o.id.slice(0, 8)}</p>
                  <p class="item-sub">{new Date(o.created_at).toLocaleString()}</p>
                </div>
                <p class="item-value">{o.price_shards?.toLocaleString()} shards</p>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="empty">No recent orders.</p>
        {/if}
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">Recent Reports</div>
      <div class="panel-body">
        {#if recentReports.length}
          <ul class="list">
            {#each recentReports as r}
              <li>
                <div>
                  <p class="item-title capitalize">{r.target_kind}</p>
                  <p class="item-sub">{new Date(r.created_at).toLocaleString()}</p>
                </div>
                <div class="item-meta">
                  <span class="badge">{r.reason}</span>
                  <span class="status">{r.status}</span>
                </div>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="empty">No recent reports.</p>
        {/if}
      </div>
    </div>
  </section>
</div>

<style>
  .btn-link {
    padding: 0.5rem 0.9rem;
    border-radius: 0.85rem;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: rgba(255, 255, 255, 0.05);
    color: inherit;
    font-size: 0.9rem;
  }

  .card {
    border-radius: 1.2rem;
    padding: 1.25rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
    box-shadow: 0 10px 30px rgba(3, 7, 18, 0.35);
  }

  .label {
    font-size: 0.9rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .value {
    font-size: 2rem;
    font-weight: 600;
    margin-top: 0.3rem;
  }

  .hint {
    font-size: 0.8rem;
    margin-top: 0.35rem;
    color: rgba(255, 255, 255, 0.55);
  }

  .unit {
    font-size: 0.9rem;
    font-weight: 400;
    color: rgba(255, 255, 255, 0.6);
    margin-left: 0.4rem;
  }

  .panel {
    border-radius: 1.2rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
    overflow: hidden;
  }

  .panel-head {
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    padding: 0.9rem 1.2rem;
    font-weight: 600;
  }

  .panel-body {
    padding: 1rem 1.2rem;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .list li {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    align-items: center;
    font-size: 0.9rem;
  }

  .item-title {
    font-weight: 600;
  }

  .item-sub {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.6);
  }

  .item-value {
    font-weight: 600;
  }

  .item-meta {
    display: flex;
    gap: 0.4rem;
    align-items: center;
  }

  .badge,
  .status {
    font-size: 0.75rem;
    padding: 0.15rem 0.5rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.15);
  }

  .empty {
    font-size: 0.9rem;
    color: rgba(255, 255, 255, 0.6);
  }
</style>
