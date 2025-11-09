<script lang="ts">
  type FlagEntry = { key: string; enabled: boolean; note: string | null; updated_at: string | null };
  type PaymentRow = {
    id: string;
    amount: number;
    currency: string;
    status: string;
    brand: string | null;
    last4: string | null;
    created_at: string;
  };

  export let data: {
    flags: { isAdmin: boolean; isFinance: boolean };
    metrics: {
      profileCount: number;
      itemCount: number;
      reportOpenCount: number;
      totalShards30d: number;
      orders30d: number;
    };
    analytics: {
      dau: number;
      mau: number;
      loginSpark: Array<{ date: string; count: number }>;
      viewSpark: Array<{ date: string; count: number }>;
    };
    finance: {
      totalCents30d: number;
      paymentCount30d: number;
      recentPayments: PaymentRow[];
      canViewDetails: boolean;
    };
    featureFlags: { known: FlagEntry[]; extra: FlagEntry[] };
    maintenance: { enabled: boolean; message: string | null; updated_at: string | null };
    health: {
      dbOk: boolean;
      lastStripeAt: string | null;
      pendingMigrations: number | null;
      errorLogCount: number | null;
    };
    recentOrders: Array<{ id: string; price_shards: number; created_at: string; user_id: string; slug: string }>;
    recentReports: Array<{ id: number; target_kind: string; reason: string; status: string; created_at: string }>;
  };

  const numberFormatter = new Intl.NumberFormat();
  const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

  const sparkPoints = (series: Array<{ count: number }>) => {
    if (!series?.length) return '';
    const max = Math.max(...series.map((point) => point.count), 1);
    const denom = Math.max(series.length - 1, 1);
    return series
      .map((point, idx) => {
        const x = (idx / denom) * 100;
        const y = 100 - (point.count / max) * 100;
        return `${x},${Number.isFinite(y) ? y : 100}`;
      })
      .join(' ');
  };

  const maskCard = (brand: string | null, last4: string | null) => {
    if (!brand && !last4) return 'N/A';
    const label = brand ? brand.toUpperCase() : 'CARD';
    return `${label} •••• ${last4 ?? '????'}`;
  };

  const formatDate = (value: string | null) => {
    if (!value) return '—';
    return new Date(value).toLocaleString();
  };

  $: loginSparkPoints = sparkPoints(data.analytics.loginSpark ?? []);
  $: viewSparkPoints = sparkPoints(data.analytics.viewSpark ?? []);
  $: healthItems = [
    { label: 'Database', ok: data.health.dbOk, detail: data.health.dbOk ? 'OK' : 'Down' },
    {
      label: 'Stripe Webhook',
      ok: Boolean(data.health.lastStripeAt),
      detail: data.health.lastStripeAt ? formatDate(data.health.lastStripeAt) : 'No recent charge'
    },
    {
      label: 'Migrations',
      ok: (data.health.pendingMigrations ?? 0) === 0,
      detail: `${data.health.pendingMigrations ?? 0} pending`
    },
    {
      label: 'Errors (24h)',
      ok: !(data.health.errorLogCount ?? 0),
      detail: data.health.errorLogCount === null ? 'N/A' : `${data.health.errorLogCount}`
    }
  ];
</script>

<div class="admin-shell">
  <header class="admin-header">
    <h1>Admin Hub</h1>
    <div class="admin-links">
      <a href="/app/(protected)/admin/shop">Shop Admin</a>
      <a href="/app/(protected)/admin/reports">Reports</a>
    </div>
  </header>

  <section class="grid stats-grid">
    <div class="stat-card">
      <p class="label">Users (Profiles)</p>
      <p class="value">{numberFormatter.format(data.metrics.profileCount)}</p>
      <p class="hint">Active last 30d: {numberFormatter.format(data.analytics.mau)}</p>
    </div>
    <div class="stat-card">
      <p class="label">Shop Items</p>
      <p class="value">{numberFormatter.format(data.metrics.itemCount)}</p>
      <p class="hint">Inventory health looks good</p>
    </div>
    <div class="stat-card">
      <p class="label">Open Reports</p>
      <p class="value">{numberFormatter.format(data.metrics.reportOpenCount)}</p>
      <p class="hint"><a href="/app/(protected)/admin/reports">Review queue →</a></p>
    </div>
    <div class="stat-card span-2">
      <p class="label">Shards Revenue (30d)</p>
      <p class="value">
        {numberFormatter.format(data.metrics.totalShards30d)}
        <span class="unit">SHARDS</span>
      </p>
      <p class="hint">Orders: {numberFormatter.format(data.metrics.orders30d)}</p>
    </div>
    <div class="stat-card span-3 analytics-card">
      <div>
        <p class="label">Engagement</p>
        <div class="engagement">
          <div>
            <p class="mini-label">DAU</p>
            <p class="mini-value">{numberFormatter.format(data.analytics.dau)}</p>
          </div>
          <div>
            <p class="mini-label">MAU</p>
            <p class="mini-value">{numberFormatter.format(data.analytics.mau)}</p>
          </div>
        </div>
      </div>
      <div class="spark-grid">
        <div>
          <p class="spark-label">Logins (14d)</p>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline points={loginSparkPoints} />
          </svg>
        </div>
        <div>
          <p class="spark-label">Pageviews (14d)</p>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none">
            <polyline points={viewSparkPoints} />
          </svg>
        </div>
      </div>
    </div>
  </section>

  <section class="grid panels-grid">
    <div class="panel">
      <div class="panel-head">
        <div>
          <p class="panel-title">Stripe (30d)</p>
          <p class="panel-sub">Totals and latest payments</p>
        </div>
        <p class="panel-value">
          {currencyFormatter.format((data.finance.totalCents30d ?? 0) / 100)}
          <span>· {numberFormatter.format(data.finance.paymentCount30d)} payments</span>
        </p>
      </div>
      <div class="panel-body">
        {#if data.finance.canViewDetails && data.finance.recentPayments.length}
          <table class="finance-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {#each data.finance.recentPayments as payment}
                <tr>
                  <td>{formatDate(payment.created_at)}</td>
                  <td>{currencyFormatter.format(payment.amount / 100)}</td>
                  <td>{maskCard(payment.brand, payment.last4)}</td>
                  <td>{payment.status}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        {:else}
          <p class="empty">Finance totals only — detailed records require the finance role.</p>
        {/if}
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <div>
          <p class="panel-title">System Health</p>
          <p class="panel-sub">Realtime checks</p>
        </div>
      </div>
      <div class="panel-body">
        <ul class="health-list">
          {#each healthItems as item}
            <li>
              <span class={`dot ${item.ok ? 'ok' : 'warn'}`} aria-hidden="true"></span>
              <div>
                <p class="health-label">{item.label}</p>
                <p class="health-detail">{item.detail}</p>
              </div>
            </li>
          {/each}
        </ul>
      </div>
    </div>
  </section>

  <section class="grid panels-grid">
    <div class="panel">
      <div class="panel-head">
        <div>
          <p class="panel-title">Feature Toggles</p>
          <p class="panel-sub">Quick switches for core surfaces</p>
        </div>
      </div>
      <div class="panel-body">
        <form method="POST" action="?/flags" class="flags-form">
          {#each data.featureFlags.known as flag}
            <label class="flag-row">
              <input type="checkbox" name={`flag-${flag.key}`} checked={flag.enabled}>
              <div>
                <p class="flag-label">{flag.key}</p>
                <p class="flag-note">{flag.note ?? 'No note'}</p>
              </div>
              <input type="text" name={`note-${flag.key}`} value={flag.note ?? ''} placeholder="Optional note" />
            </label>
          {/each}
          <button type="submit">Save toggles</button>
        </form>

        {#if data.featureFlags.extra.length}
          <div class="extra-flags">
            <p class="extra-title">Additional flags</p>
            <ul>
              {#each data.featureFlags.extra as flag}
                <li>
                  <span>{flag.key}</span>
                  <span>{flag.enabled ? 'on' : 'off'}</span>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <div>
          <p class="panel-title">Maintenance Mode</p>
          <p class="panel-sub">Gate the app for everyone except admins</p>
        </div>
      </div>
      <div class="panel-body">
        <form method="POST" action="?/maintenance" class="maintenance-form">
          <label class="toggle">
            <input type="checkbox" name="maintenance-enabled" checked={data.maintenance.enabled}>
            <span>Enable maintenance mode</span>
          </label>
          <textarea name="maintenance-message" placeholder="Optional message for users">{data.maintenance.message ?? ''}</textarea>
          <button type="submit">Update maintenance</button>
        </form>
        <p class="hint">Last updated: {formatDate(data.maintenance.updated_at)}</p>
      </div>
    </div>
  </section>

  <section class="grid list-grid">
    <div class="panel">
      <div class="panel-head">Recent Orders</div>
      <div class="panel-body">
        {#if data.recentOrders.length}
          <ul class="list">
            {#each data.recentOrders as o}
              <li>
                <div>
                  <p class="item-title">Order #{o.id.slice(0, 8)}</p>
                  <p class="item-sub">{formatDate(o.created_at)}</p>
                </div>
                <p class="item-value">{numberFormatter.format(o.price_shards)} shards</p>
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
        {#if data.recentReports.length}
          <ul class="list">
            {#each data.recentReports as r}
              <li>
                <div>
                  <p class="item-title capitalize">{r.target_kind}</p>
                  <p class="item-sub">{formatDate(r.created_at)}</p>
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
  .admin-shell {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem 1.5rem 4rem;
    display: flex;
    flex-direction: column;
    gap: 2rem;
  }

  .admin-header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
  }

  .admin-header h1 {
    font-size: 2rem;
    font-weight: 600;
  }

  .admin-links {
    display: flex;
    gap: 0.75rem;
  }

  .admin-links a {
    padding: 0.5rem 0.9rem;
    border-radius: 0.85rem;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: rgba(255, 255, 255, 0.05);
    font-size: 0.9rem;
  }

  .stats-grid,
  .panels-grid,
  .list-grid {
    gap: 1.25rem;
  }

  .grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  }

  .stat-card {
    border-radius: 1.2rem;
    padding: 1.25rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
    box-shadow: 0 10px 30px rgba(3, 7, 18, 0.35);
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .span-2 {
    grid-column: span 2;
  }

  .span-3 {
    grid-column: span 3;
  }

  @media (max-width: 960px) {
    .span-2,
    .span-3 {
      grid-column: span 1;
    }
  }

  .label {
    font-size: 0.9rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .value {
    font-size: 2rem;
    font-weight: 600;
  }

  .hint {
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.55);
  }

  .unit {
    font-size: 0.9rem;
    font-weight: 400;
    color: rgba(255, 255, 255, 0.6);
    margin-left: 0.4rem;
  }

  .analytics-card {
    grid-column: span 3;
  }

  .analytics-card svg {
    width: 100%;
    height: 60px;
  }

  .analytics-card polyline {
    fill: none;
    stroke: #34d399;
    stroke-width: 2;
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .engagement {
    display: flex;
    gap: 1.5rem;
  }

  .mini-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: rgba(255, 255, 255, 0.6);
  }

  .mini-value {
    font-size: 1.5rem;
    font-weight: 600;
  }

  .spark-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
    gap: 1rem;
    margin-top: 0.75rem;
  }

  .spark-label {
    font-size: 0.85rem;
    margin-bottom: 0.25rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .panel {
    border-radius: 1.2rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
    display: flex;
    flex-direction: column;
  }

  .panel-head {
    padding: 1.1rem 1.3rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    justify-content: space-between;
    gap: 1rem;
  }

  .panel-title {
    font-weight: 600;
    margin-bottom: 0.1rem;
  }

  .panel-sub {
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.6);
  }

  .panel-value {
    font-size: 1.25rem;
    font-weight: 600;
    text-align: right;
  }

  .panel-value span {
    display: block;
    font-size: 0.85rem;
    font-weight: 400;
    color: rgba(255, 255, 255, 0.65);
  }

  .panel-body {
    padding: 1.2rem 1.3rem 1.4rem;
    display: grid;
    gap: 1rem;
  }

  .finance-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }

  .finance-table th,
  .finance-table td {
    padding: 0.4rem 0.35rem;
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    text-align: left;
  }

  .finance-table th {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: rgba(255, 255, 255, 0.55);
  }

  .flags-form,
  .maintenance-form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .flag-row {
    display: grid;
    grid-template-columns: auto 1fr minmax(140px, 220px);
    align-items: center;
    gap: 0.9rem;
    padding: 0.75rem;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 0.9rem;
  }

  .flag-row input[type='text'] {
    border-radius: 0.6rem;
    padding: 0.4rem 0.6rem;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.12);
  }

  .flag-label {
    font-weight: 600;
    text-transform: capitalize;
  }

  .flag-note {
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.6);
  }

  button {
    align-self: flex-start;
    padding: 0.55rem 1.2rem;
    border-radius: 0.85rem;
    background: linear-gradient(120deg, #38bdf8, #a855f7);
    color: #030712;
    font-weight: 600;
  }

  textarea {
    min-height: 80px;
    border-radius: 0.9rem;
    padding: 0.75rem;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.12);
  }

  .toggle {
    display: flex;
    gap: 0.5rem;
    align-items: center;
    font-weight: 600;
  }

  .extra-flags ul {
    margin-top: 0.4rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    font-size: 0.85rem;
  }

  .extra-flags li {
    display: flex;
    justify-content: space-between;
    border-bottom: 1px dashed rgba(255, 255, 255, 0.08);
    padding-bottom: 0.2rem;
  }

  .extra-title {
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.55);
  }

  .health-list {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
  }

  .health-list li {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }

  .dot {
    width: 0.65rem;
    height: 0.65rem;
    border-radius: 999px;
  }

  .dot.ok {
    background: #34d399;
  }

  .dot.warn {
    background: #f87171;
  }

  .health-label {
    font-weight: 600;
  }

  .health-detail {
    font-size: 0.8rem;
    color: rgba(255, 255, 255, 0.6);
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
