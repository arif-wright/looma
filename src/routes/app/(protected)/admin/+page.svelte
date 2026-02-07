<script lang="ts">
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { onDestroy, onMount } from 'svelte';
  import AdminCard from '$lib/components/admin/AdminCard.svelte';
  import SubNav, { type NavItem } from '$lib/components/admin/SubNav.svelte';
  import Sparkline from '$lib/components/admin/Sparkline.svelte';
  import { sendEvent } from '$lib/client/events/sendEvent';
  import { pushCompanionReaction } from '$lib/stores/companionReactions';
  import type { PageData } from './$types';

  export let data: PageData;

  const { flags, metrics, analytics, finance, featureFlags, maintenance, health, recentOrders, recentReports, companionHealth } = data;

  const numberFormatter = new Intl.NumberFormat();
  const currencyFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

  const subNavItems: NavItem[] = [
    { label: 'Hub', href: '/app/admin' },
    { label: 'Shop Admin', href: '/app/admin/shop' },
    { label: 'Reports', href: '/app/admin/reports' },
    { label: 'Players', href: '/app/admin/players', hidden: !flags.isSuper },
    { label: 'Roles', href: '/app/admin/roles', hidden: !flags.isAdmin },
    { label: 'Feature Toggles', href: '/app/admin#feature-toggles' },
    { label: 'Maintenance', href: '/app/admin#maintenance' }
  ];

  const formatDate = (value: string | null) => (value ? new Date(value).toLocaleString() : '—');
  const maskCard = (brand: string | null, last4: string | null) => {
    if (!brand && !last4) return 'N/A';
    return `${brand ? brand.toUpperCase() : 'CARD'} •••• ${last4 ?? '????'}`;
  };

  const shortcutMap: Record<string, string> = {
    h: '/app/admin',
    s: '/app/admin/shop',
    r: '/app/admin/reports',
    a: '/app/admin/roles'
  };

  $: avgBondDisplay = companionHealth ? Math.round((companionHealth.avgBondLevel ?? 0) * 10) / 10 : 0;
  $: avgRitualsDisplay = companionHealth ? Math.round((companionHealth.avgRitualsToday ?? 0) * 10) / 10 : 0;
  $: lastPassiveLabel = companionHealth?.lastPassiveTick ? formatDate(companionHealth.lastPassiveTick) : '—';
  $: avgBondText =
    companionHealth && companionHealth.totalCompanions > 0 ? avgBondDisplay.toFixed(1) : '—';
  $: avgRitualsText =
    companionHealth && avgRitualsDisplay > 0 ? avgRitualsDisplay.toFixed(1) : '0.0';

  let shortcutPrimed = false;
  let shortcutTimer: ReturnType<typeof setTimeout> | null = null;
  let reactionLoading = false;
  let reactionStatus = '';

  const resetShortcut = () => {
    shortcutPrimed = false;
    if (shortcutTimer) {
      clearTimeout(shortcutTimer);
      shortcutTimer = null;
    }
  };

  const handleShortcut = (event: KeyboardEvent) => {
    const target = event.target as HTMLElement | null;
    if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) {
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) return;

    const key = event.key.toLowerCase();
    if (!shortcutPrimed) {
      if (key === 'g') {
        shortcutPrimed = true;
        shortcutTimer = setTimeout(resetShortcut, 1000);
      }
      return;
    }

    resetShortcut();
    if (key === 'a' && !flags.isAdmin) return;
    const targetHref = shortcutMap[key];
    if (targetHref) {
      event.preventDefault();
      void goto(targetHref);
    }
  };

  const triggerMuseReaction = async () => {
    if (reactionLoading) return;
    reactionLoading = true;
    reactionStatus = '';
    try {
      const response = await sendEvent('session.return', { source: 'admin_manual_trigger' });
      const output = response?.output ?? null;
      if (output?.suppressed === true) {
        reactionStatus = 'Reaction suppressed by user preferences.';
        return;
      }
      const reaction = output?.reaction ?? null;
      if (!reaction?.text) {
        reactionStatus = 'No reaction returned.';
        return;
      }
      pushCompanionReaction(reaction);
      reactionStatus = 'Muse reaction sent.';
    } catch {
      reactionStatus = 'Failed to trigger reaction.';
    } finally {
      reactionLoading = false;
    }
  };

  onMount(() => {
    if (!browser) return;
    window.addEventListener('keydown', handleShortcut);
  });

  onDestroy(() => {
    if (!browser) return;
    window.removeEventListener('keydown', handleShortcut);
    resetShortcut();
  });
</script>

<div class="admin-shell">
  <aside class="admin-rail">
    <SubNav items={subNavItems} />
  </aside>

  <section class="admin-main">
    <header class="admin-header">
      <div>
        <p class="eyebrow">Control Center</p>
        <h1>Admin Hub</h1>
      </div>
      <div class="header-actions">
        <a href="/app/admin/shop">Shop Admin</a>
        <a href="/app/admin/reports">Reports</a>
        {#if flags.isAdmin}
          <a href="/app/admin/roles">Roles</a>
        {/if}
      </div>
    </header>

    <div class="admin-grid">
      <AdminCard className="span-4">
        <p class="label">Users</p>
        <p class="value">{numberFormatter.format(metrics.profileCount)}</p>
        <p class="hint">Profiles total · {numberFormatter.format(analytics.mau)} MAU</p>
      </AdminCard>

      <AdminCard className="span-4">
        <p class="label">Shop Items</p>
        <p class="value">{numberFormatter.format(metrics.itemCount)}</p>
        <p class="hint">Inventory active in store</p>
      </AdminCard>

      <AdminCard className="span-4">
        <p class="label">Open Reports</p>
        <p class="value">{numberFormatter.format(metrics.reportOpenCount)}</p>
        <p class="hint">Need attention</p>
      </AdminCard>

      {#if flags.isSuper}
        <AdminCard className="span-4 companion-health-card">
          <div class="card-head">
            <p class="label">Companion Health</p>
            <p class="hint">System pulse</p>
          </div>
          {#if companionHealth}
            <dl class="companion-health">
              <div>
                <dt>Total companions</dt>
                <dd>{numberFormatter.format(companionHealth.totalCompanions)}</dd>
              </div>
              <div>
                <dt>Avg bond level</dt>
                <dd>{avgBondText}</dd>
              </div>
              <div>
                <dt>Avg rituals/player</dt>
                <dd>{avgRitualsText}</dd>
              </div>
              <div>
                <dt>Last passive tick</dt>
                <dd>{lastPassiveLabel}</dd>
              </div>
            </dl>
          {:else}
            <p class="hint">No companion data available.</p>
          {/if}
        </AdminCard>
      {/if}

      {#if flags.isSuper}
        <AdminCard className="span-4">
          <div class="card-head">
            <p class="label">Players</p>
            <p class="value">QA tools</p>
          </div>
          <p class="hint">Grant licenses, QA tools</p>
          <a class="inline-flex text-sm font-medium text-emerald-300 hover:text-emerald-200" href="/app/admin/players">
            Open Players
          </a>
        </AdminCard>
      {/if}

      {#if flags.isAdmin}
        <AdminCard className="span-4">
          <div class="card-head">
            <p class="label">Access Control</p>
            <p class="hint">Manage admin and finance roles</p>
          </div>
          <a class="inline-flex text-sm font-medium text-emerald-300 hover:text-emerald-200" href="/app/admin/roles">
            Open Role Manager
          </a>
        </AdminCard>
      {/if}

      <AdminCard className="span-12 revenue-card">
        <div class="card-head">
          <div>
            <p class="label">Shards Revenue · 30 days</p>
            <p class="value">{numberFormatter.format(metrics.totalShards30d)} <span>shards</span></p>
          </div>
          <p class="hint">Orders: {numberFormatter.format(metrics.orders30d)}</p>
        </div>
      </AdminCard>

      <AdminCard className="span-6">
        <div class="card-head">
          <div>
            <p class="label">Companion Reactions</p>
            <p class="hint">Manual trigger for production verification</p>
          </div>
        </div>
        <button
          type="button"
          class="admin-action-button"
          on:click={triggerMuseReaction}
          disabled={reactionLoading}
        >
          {reactionLoading ? 'Sending...' : 'Trigger Muse reaction'}
        </button>
        {#if reactionStatus}
          <p class="hint reaction-status">{reactionStatus}</p>
        {/if}
      </AdminCard>

      <AdminCard className="span-7 engagement-card">
        <div class="card-head">
          <div>
            <p class="label">Engagement</p>
            <p class="hint">DAU & MAU from events</p>
          </div>
          <div class="engagement-metrics">
            <p><span>DAU</span> {numberFormatter.format(analytics.dau)}</p>
            <p><span>MAU</span> {numberFormatter.format(analytics.mau)}</p>
          </div>
        </div>
        <div class="sparklines">
          <div>
            <p class="spark-label">Logins (14d)</p>
            <Sparkline data={analytics.loginSpark} stroke="#34d399" />
          </div>
          <div>
            <p class="spark-label">Pageviews (14d)</p>
            <Sparkline data={analytics.viewSpark} stroke="#60a5fa" />
          </div>
        </div>
      </AdminCard>

      <AdminCard className="span-5">
        <div class="card-head">
          <p class="label">System Health</p>
          <p class="hint">Realtime checks</p>
        </div>
        <ul class="health-list">
          <li>
            <span class={`dot ${health.dbOk ? 'ok' : 'warn'}`}></span>
            <div>
              <p>Database</p>
              <p class="hint">{health.dbOk ? 'Connected' : 'Issue'}</p>
            </div>
          </li>
          <li>
            <span class={`dot ${health.lastStripeAt ? 'ok' : 'warn'}`}></span>
            <div>
              <p>Stripe Webhook</p>
              <p class="hint">{health.lastStripeAt ? formatDate(health.lastStripeAt) : 'No recent events'}</p>
            </div>
          </li>
          <li>
            <span class={`dot ${(health.pendingMigrations ?? 0) === 0 ? 'ok' : 'warn'}`}></span>
            <div>
              <p>Pending migrations</p>
              <p class="hint">{health.pendingMigrations ?? 0}</p>
            </div>
          </li>
          <li>
            <span class={`dot ${health.errorLogCount ? 'warn' : 'ok'}`}></span>
            <div>
              <p>Error logs (24h)</p>
              <p class="hint">{health.errorLogCount ?? 'N/A'}</p>
            </div>
          </li>
        </ul>
      </AdminCard>

      <AdminCard className="span-6" id="finance">
        <div class="card-head">
          <div>
            <p class="label">Finance · Stripe (30d)</p>
            <p class="value">{currencyFormatter.format(finance.totalCents30d / 100)}</p>
          </div>
          <p class="hint">{numberFormatter.format(finance.paymentCount30d)} payments</p>
        </div>
        {#if finance.canViewDetails && finance.recentPayments.length}
          <div class="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {#each finance.recentPayments as payment}
                  <tr>
                    <td>{formatDate(payment.created_at)}</td>
                    <td>{currencyFormatter.format(payment.amount / 100)}</td>
                    <td>{maskCard(payment.brand, payment.last4)}</td>
                    <td>{payment.status}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {:else}
          <p class="hint">Grant finance role to view detailed payment rows.</p>
        {/if}
      </AdminCard>

      <AdminCard className="span-6" id="feature-toggles">
        <div class="card-head">
          <p class="label">Feature Toggles</p>
          <p class="hint">Quick switches</p>
        </div>
        <form method="POST" action="?/flags" class="flags-form">
          {#each featureFlags.known as flag}
            <label class="flag-row">
              <div class="flag-toggle">
                <input type="checkbox" name={`flag-${flag.key}`} checked={flag.enabled}>
                <span>{flag.key}</span>
              </div>
              <input type="text" name={`note-${flag.key}`} value={flag.note ?? ''} placeholder="Optional note" />
            </label>
          {/each}
          <button type="submit">Save toggles</button>
        </form>
        {#if featureFlags.extra.length}
          <div class="extra-flags">
            <p>Additional flags</p>
            <ul>
              {#each featureFlags.extra as flag}
                <li>
                  <span>{flag.key}</span>
                  <span>{flag.enabled ? 'on' : 'off'}</span>
                </li>
              {/each}
            </ul>
          </div>
        {/if}
      </AdminCard>

      <AdminCard className="span-12" id="maintenance">
        <div class="card-head">
          <p class="label">Maintenance Mode</p>
          <p class="hint">Restrict access for non-admins</p>
        </div>
        <form method="POST" action="?/maintenance" class="maintenance-form">
          <label class="switch">
            <input type="checkbox" name="maintenance-enabled" checked={maintenance.enabled}>
            <span>Maintenance enabled</span>
          </label>
          <textarea name="maintenance-message" placeholder="Message for users">{maintenance.message ?? ''}</textarea>
          <button type="submit">Update maintenance</button>
          <p class="hint">Last updated {formatDate(maintenance.updated_at)}</p>
        </form>
      </AdminCard>

      <AdminCard className="span-6">
        <div class="card-head">
          <p class="label">Recent Orders</p>
          <p class="hint">Latest five purchases</p>
        </div>
        {#if recentOrders.length}
          <ul class="list">
            {#each recentOrders as order}
              <li>
                <div>
                  <p>Order #{order.id.slice(0, 8)}</p>
                  <p class="hint">{formatDate(order.created_at)}</p>
                </div>
                <p>{numberFormatter.format(order.price_shards)} shards</p>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="hint">No orders yet.</p>
        {/if}
      </AdminCard>

      <AdminCard className="span-6">
        <div class="card-head">
          <p class="label">Recent Reports</p>
          <p class="hint">Latest five entries</p>
        </div>
        {#if recentReports.length}
          <ul class="list">
            {#each recentReports as report}
              <li>
                <div>
                  <p class="title">{report.target_kind}</p>
                  <p class="hint">{formatDate(report.created_at)}</p>
                </div>
                <span class="badge">{report.reason}</span>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="hint">No reports at the moment.</p>
        {/if}
      </AdminCard>
    </div>
  </section>
</div>

<style>
  .admin-shell {
    display: grid;
    grid-template-columns: 260px minmax(0, 1fr);
    gap: 2rem;
    padding: 2rem clamp(1rem, 5vw, 3rem) 4rem;
  }

  @media (max-width: 1023px) {
    .admin-shell {
      grid-template-columns: 1fr;
    }
  }

  .admin-rail {
    position: sticky;
    top: 2rem;
    align-self: start;
  }

  .admin-main {
    max-width: 1400px;
    margin: 0 auto;
  }

  .admin-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-wrap: wrap;
    gap: 1rem;
    margin-bottom: 2rem;
    position: sticky;
    top: 1rem;
    z-index: 5;
    backdrop-filter: blur(12px);
  }

  .admin-header h1 {
    font-size: clamp(2rem, 3vw, 2.8rem);
    margin: 0;
  }

  .eyebrow {
    font-size: 0.8rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.55);
    margin-bottom: 0.2rem;
  }

  .header-actions {
    display: flex;
    gap: 0.75rem;
  }

  .header-actions a {
    padding: 0.5rem 1rem;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.15);
    background: rgba(255, 255, 255, 0.08);
    text-decoration: none;
  }

  .admin-grid {
    display: grid;
    grid-template-columns: repeat(12, minmax(0, 1fr));
    gap: clamp(1rem, 2vw, 1.5rem);
  }

  .companion-health {
    display: grid;
    gap: 0.75rem;
    margin: 0;
  }

  .companion-health div {
    display: flex;
    justify-content: space-between;
    align-items: baseline;
    gap: 0.75rem;
  }

  .companion-health dt {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.15em;
    color: rgba(255, 255, 255, 0.6);
  }

  .companion-health dd {
    margin: 0;
    font-size: 1.1rem;
    font-weight: 600;
  }

  :global(.span-4) { grid-column: span 4; }
  :global(.span-5) { grid-column: span 5; }
  :global(.span-6) { grid-column: span 6; }
  :global(.span-7) { grid-column: span 7; }
  :global(.span-12) { grid-column: span 12; }

  @media (max-width: 1100px) {
    :global(.span-4),
    :global(.span-5),
    :global(.span-6),
    :global(.span-7) {
      grid-column: span 12;
    }
  }

  .label {
    font-size: 0.9rem;
    color: rgba(255, 255, 255, 0.65);
  }

  .value {
    font-size: clamp(1.8rem, 3vw, 2.5rem);
    font-weight: 600;
  }

  .value span {
    font-size: 1rem;
    text-transform: uppercase;
    margin-left: 0.35rem;
    color: rgba(255, 255, 255, 0.65);
  }

  .hint {
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.55);
  }

  .card-head {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    flex-wrap: wrap;
  }

  .engagement-metrics {
    display: flex;
    gap: 1rem;
    text-align: right;
  }

  .engagement-metrics span {
    display: block;
    font-size: 0.75rem;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.55);
  }

  .sparklines {
    display: grid;
    gap: 1rem;
  }

  .spark-label {
    font-size: 0.8rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.55);
  }

  .health-list {
    display: grid;
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

  .dot.ok { background: #34d399; }
  .dot.warn { background: #f87171; }

  .table-wrap {
    overflow-x: auto;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.85rem;
  }

  th,
  td {
    text-align: left;
    padding: 0.45rem 0.35rem;
  }

  th {
    text-transform: uppercase;
    font-size: 0.7rem;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.55);
  }

  tbody tr + tr td {
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .flags-form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .flag-row {
    display: grid;
    grid-template-columns: minmax(0, 220px) 1fr;
    gap: 0.75rem;
    align-items: center;
    padding: 0.75rem;
    border-radius: 1rem;
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .flag-row input[type='text'] {
    border-radius: 0.8rem;
    border: 1px solid rgba(255, 255, 255, 0.15);
    padding: 0.5rem 0.75rem;
    background: rgba(255, 255, 255, 0.02);
  }

  .flag-toggle {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    text-transform: capitalize;
    font-weight: 600;
  }

  button {
    align-self: flex-start;
    padding: 0.55rem 1.2rem;
    border-radius: 999px;
    background: linear-gradient(120deg, #38bdf8, #a855f7);
    color: #030712;
    font-weight: 600;
  }

  .extra-flags ul {
    list-style: none;
    padding: 0;
    margin: 0.5rem 0 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    font-size: 0.85rem;
  }

  .extra-flags li {
    display: flex;
    justify-content: space-between;
  }

  .maintenance-form {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
  }

  textarea {
    min-height: 90px;
    border-radius: 1rem;
    border: 1px solid rgba(255, 255, 255, 0.15);
    padding: 0.75rem;
    background: rgba(255, 255, 255, 0.02);
    color: inherit;
  }

  .switch {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-weight: 600;
  }

  .list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .list li {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .badge {
    border-radius: 999px;
    padding: 0.2rem 0.75rem;
    border: 1px solid rgba(255, 255, 255, 0.12);
  }

  .admin-action-button {
    margin-top: 0.35rem;
  }

  .reaction-status {
    margin-top: 0.5rem;
  }

  @media (max-width: 767px) {
    .header-actions {
      width: 100%;
      justify-content: flex-start;
    }
  }
</style>
