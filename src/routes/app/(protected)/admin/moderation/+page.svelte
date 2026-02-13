<script lang="ts">
  import { onMount } from 'svelte';

  export let data: { role: 'moderator' | 'admin' };

  type CaseItem = {
    caseId: string;
    status: 'open' | 'under_review' | 'resolved' | 'dismissed';
    assignedTo: string | null;
    resolution: string | null;
    createdAt: string;
    updatedAt: string;
    report: {
      reportId: string;
      reporterId: string;
      reason: string;
      details: string | null;
      createdAt: string;
    } | null;
    message: {
      messageId: string;
      senderId: string;
      conversationId: string;
      body: string;
      createdAt: string;
      deletedAt: string | null;
      attachments: Array<{
        id: string;
        kind: 'image' | 'gif' | 'file' | 'link';
        mime_type: string | null;
        bytes: number | null;
        width: number | null;
        height: number | null;
        storage_path: string | null;
        url: string;
      }>;
      moderation: { status: 'active' | 'muted' | 'suspended' | 'banned'; until: string | null };
      trust: { user_id: string; score: number; tier: 'new' | 'standard' | 'trusted' | 'restricted'; forced_tier: 'new' | 'standard' | 'trusted' | 'restricted' | null };
    } | null;
    trustEvents: Array<{ id: string; kind: string; delta: number; created_at: string }>;
    circle: {
      circleId: string;
      name: string;
      conversationId: string;
    } | null;
  };

  type ActionItem = {
    id: string;
    user_id: string;
    action: string;
    target_id: string | null;
    duration_minutes: number | null;
    reason: string;
    created_by: string;
    created_at: string;
  };

  let tab: 'cases' | 'actions' = 'cases';
  let statusFilter: 'open' | 'under_review' | 'resolved' | 'dismissed' = 'open';
  let cases: CaseItem[] = [];
  let actions: ActionItem[] = [];
  let activeCaseId: string | null = null;
  let loading = false;
  let errorMessage: string | null = null;
  let busy = false;
  let initialized = false;
  let caseQueryKey = '';

  $: activeCase = activeCaseId ? cases.find((item) => item.caseId === activeCaseId) ?? null : null;
  $: activeSenderId = activeCase?.message?.senderId ?? null;

  const loadCases = async () => {
    loading = true;
    errorMessage = null;
    try {
      const res = await fetch(`/api/moderation/cases?status=${encodeURIComponent(statusFilter)}`, {
        headers: { 'cache-control': 'no-store' }
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof payload?.message === 'string' ? payload.message : 'Failed to load moderation cases.');
      }
      cases = Array.isArray(payload?.items) ? (payload.items as CaseItem[]) : [];
      if (!cases.some((item) => item.caseId === activeCaseId)) {
        activeCaseId = cases[0]?.caseId ?? null;
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Failed to load moderation cases.';
    } finally {
      loading = false;
    }
  };

  const loadActions = async () => {
    loading = true;
    errorMessage = null;
    try {
      const res = await fetch('/api/moderation/cases?tab=actions', {
        headers: { 'cache-control': 'no-store' }
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof payload?.message === 'string' ? payload.message : 'Failed to load moderation actions.');
      }
      actions = Array.isArray(payload?.items) ? (payload.items as ActionItem[]) : [];
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Failed to load moderation actions.';
    } finally {
      loading = false;
    }
  };

  const reload = async () => {
    if (tab === 'actions') {
      await loadActions();
      return;
    }
    await loadCases();
  };

  const assignCase = async (caseId: string) => {
    busy = true;
    try {
      const res = await fetch('/api/moderation/case/assign', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ caseId })
      });
      if (!res.ok) throw new Error('Could not assign case.');
      await loadCases();
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Could not assign case.';
    } finally {
      busy = false;
    }
  };

  const resolveCase = async (
    caseId: string,
    resolution: string,
    action?: {
      action: 'warn' | 'mute' | 'suspend' | 'ban' | 'message_delete' | 'circle_kick';
      userId: string;
      targetId?: string;
      durationMinutes?: number;
      reason?: string;
    }
  ) => {
    busy = true;
    try {
      const res = await fetch('/api/moderation/case/resolve', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ caseId, resolution, action: action ?? null })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof payload?.message === 'string' ? payload.message : 'Could not resolve case.');
      }
      await loadCases();
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Could not resolve case.';
    } finally {
      busy = false;
    }
  };

  const dismissCase = async (caseId: string) => {
    const note = window.prompt('Dismiss reason:', 'insufficient_evidence');
    if (!note) return;
    await resolveCase(caseId, note);
  };

  const setTrustTier = async (userId: string, tier: 'restricted' | 'standard') => {
    busy = true;
    try {
      const note = window.prompt(
        tier === 'restricted' ? 'Reason for restriction:' : 'Reason for restoring standard:',
        tier === 'restricted' ? 'safety_limit' : 'restored_after_review'
      );
      if (!note) return;

      const res = await fetch('/api/moderation/trust/set', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ userId, tier, note })
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof payload?.message === 'string' ? payload.message : 'Could not update trust tier.');
      }
      await loadCases();
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Could not update trust tier.';
    } finally {
      busy = false;
    }
  };

  const actOnCase = async (
    action: 'warn' | 'mute' | 'suspend' | 'ban' | 'message_delete' | 'circle_kick'
  ) => {
    if (!activeCase || !activeCase.message) return;

    if ((action === 'ban' || action === 'suspend') && !window.confirm(`Confirm ${action}?`)) {
      return;
    }

    const reason = window.prompt('Action reason:', activeCase.report?.reason ?? 'policy_violation');
    if (!reason) return;

    let durationMinutes: number | undefined;
    if (action === 'mute' || action === 'suspend') {
      const input = window.prompt('Duration minutes:', action === 'mute' ? '60' : '1440');
      if (!input) return;
      const parsed = Number.parseInt(input, 10);
      if (!Number.isFinite(parsed) || parsed <= 0) return;
      durationMinutes = parsed;
    }

    let targetId: string | undefined;
    if (action === 'message_delete') targetId = activeCase.message.messageId;
    if (action === 'circle_kick') {
      targetId = activeCase.circle?.circleId;
      if (!targetId) {
        errorMessage = 'Circle context required for circle kick action.';
        return;
      }
    }

    const payload: {
      action: 'warn' | 'mute' | 'suspend' | 'ban' | 'message_delete' | 'circle_kick';
      userId: string;
      targetId?: string;
      durationMinutes?: number;
      reason?: string;
    } = {
      action,
      userId: activeCase.message.senderId,
      reason
    };

    if (targetId) {
      payload.targetId = targetId;
    }

    if (typeof durationMinutes === 'number') {
      payload.durationMinutes = durationMinutes;
    }

    await resolveCase(activeCase.caseId, reason, payload);
  };

  onMount(async () => {
    initialized = true;
    await loadCases();
  });

  $: caseQueryKey = `${tab}:${statusFilter}`;

  $: if (initialized && tab === 'actions') {
    void loadActions();
  }

  $: if (initialized && tab === 'cases' && caseQueryKey.length >= 0) {
    void loadCases();
  }
</script>

<section class="moderation-shell" aria-label="Moderation queue">
  <header>
    <div>
      <p class="eyebrow">Admin · Moderation</p>
      <h1>Moderation Queue</h1>
      <p class="muted">Role: {data.role}</p>
    </div>
    <div class="tabs" role="tablist" aria-label="Moderation tabs">
      <button type="button" class:active={tab === 'cases'} on:click={() => (tab = 'cases')}>Cases</button>
      <button type="button" class:active={tab === 'actions'} on:click={() => (tab = 'actions')}>Actions</button>
    </div>
  </header>

  {#if tab === 'cases'}
    <div class="layout">
      <aside class="left">
        <div class="filters" role="tablist" aria-label="Case status filters">
          <button type="button" class:active={statusFilter === 'open'} on:click={() => (statusFilter = 'open')}>Open</button>
          <button type="button" class:active={statusFilter === 'under_review'} on:click={() => (statusFilter = 'under_review')}>Under Review</button>
          <button type="button" class:active={statusFilter === 'resolved'} on:click={() => (statusFilter = 'resolved')}>Resolved</button>
          <button type="button" class:active={statusFilter === 'dismissed'} on:click={() => (statusFilter = 'dismissed')}>Dismissed</button>
        </div>
        {#if loading}
          <p class="state">Loading cases…</p>
        {:else if cases.length === 0}
          <p class="state">No cases found.</p>
        {:else}
          <ul>
            {#each cases as item}
              <li>
                <button
                  type="button"
                  class={`case-item ${activeCaseId === item.caseId ? 'active' : ''}`}
                  on:click={() => (activeCaseId = item.caseId)}
                >
                  <strong>{item.report?.reason ?? 'report'}</strong>
                  <small>{item.status} · {new Date(item.createdAt).toLocaleString()}</small>
                </button>
              </li>
            {/each}
          </ul>
        {/if}
      </aside>

      <section class="right" aria-live="polite">
        {#if activeCase}
          <article class="detail">
            <div class="row">
              <h2>Case {activeCase.caseId.slice(0, 8)}</h2>
              <span class="status">{activeCase.status}</span>
            </div>
            <p><strong>Reporter:</strong> {activeCase.report?.reporterId ?? '—'}</p>
            <p><strong>Sender:</strong> {activeCase.message?.senderId ?? '—'}</p>
            <p><strong>Reason:</strong> {activeCase.report?.reason ?? '—'}</p>
            <p><strong>Details:</strong> {activeCase.report?.details ?? '—'}</p>
            <p><strong>Conversation:</strong> {activeCase.message?.conversationId ?? '—'}</p>
            <p><strong>Circle:</strong> {activeCase.circle ? `${activeCase.circle.name} (${activeCase.circle.circleId})` : '—'}</p>
            <p><strong>Sender moderation:</strong> {activeCase.message?.moderation.status ?? 'active'}</p>
            <p><strong>Trust tier:</strong> {activeCase.message?.trust?.tier ?? 'new'}</p>
            <p><strong>Attachments:</strong> {activeCase.message?.attachments?.length ?? 0}</p>

            <div class="message-box">
              <h3>Message</h3>
              <p>{activeCase.message?.body ?? 'Message not found.'}</p>
            </div>

            {#if activeCase.trustEvents.length > 0}
              <div class="message-box">
                <h3>Recent trust events</h3>
                <ul class="trust-events">
                  {#each activeCase.trustEvents as eventItem}
                    <li>
                      <strong>{eventItem.kind}</strong>
                      <span>{eventItem.delta >= 0 ? `+${eventItem.delta}` : eventItem.delta}</span>
                      <small>{new Date(eventItem.created_at).toLocaleString()}</small>
                    </li>
                  {/each}
                </ul>
              </div>
            {/if}

            <div class="actions">
              <button type="button" disabled={busy} on:click={() => assignCase(activeCase.caseId)}>Assign to me</button>
              <button type="button" disabled={busy} on:click={() => actOnCase('warn')}>Warn</button>
              <button type="button" disabled={busy} on:click={() => actOnCase('mute')}>Mute</button>
              <button type="button" disabled={busy} on:click={() => actOnCase('suspend')}>Suspend</button>
              <button type="button" disabled={busy} class="danger" on:click={() => actOnCase('ban')}>Ban</button>
              <button type="button" disabled={busy} on:click={() => actOnCase('message_delete')}>Delete Message</button>
              <button type="button" disabled={busy} on:click={() => dismissCase(activeCase.caseId)}>Dismiss</button>
              {#if activeSenderId}
                <button type="button" disabled={busy} on:click={() => setTrustTier(activeSenderId, 'restricted')}>Set restricted</button>
                <button type="button" disabled={busy} on:click={() => setTrustTier(activeSenderId, 'standard')}>Restore standard</button>
              {/if}
            </div>
          </article>
        {:else}
          <p class="state">Select a case to review.</p>
        {/if}
      </section>
    </div>
  {:else}
    <section class="actions-panel">
      {#if loading}
        <p class="state">Loading actions…</p>
      {:else if actions.length === 0}
        <p class="state">No moderation actions yet.</p>
      {:else}
        <ul>
          {#each actions as action}
            <li>
              <strong>{action.action}</strong>
              <p>User: {action.user_id}</p>
              <p>By: {action.created_by}</p>
              <p>Reason: {action.reason}</p>
              <small>{new Date(action.created_at).toLocaleString()}</small>
            </li>
          {/each}
        </ul>
      {/if}
    </section>
  {/if}

  {#if errorMessage}
    <p class="error" role="status">{errorMessage}</p>
  {/if}
</section>

<style>
  .moderation-shell { margin: 1rem; border: 1px solid rgba(148,163,184,.2); border-radius: 1rem; background: rgba(15,23,42,.35); padding: 1rem; display:grid; gap:.85rem; }
  header { display:flex; justify-content:space-between; align-items:flex-end; gap:.8rem; flex-wrap:wrap; }
  .eyebrow { margin:0; text-transform: uppercase; letter-spacing:.08em; font-size:.72rem; color: rgba(148,163,184,.9); }
  h1 { margin:.2rem 0 0; font-size:1.22rem; }
  .muted { margin:.2rem 0 0; color: rgba(148,163,184,.92); }
  .tabs, .filters { display:inline-flex; gap:.35rem; flex-wrap:wrap; }
  button { border:1px solid rgba(148,163,184,.3); border-radius:.55rem; background: rgba(15,23,42,.55); color:#e2e8f0; padding:.38rem .62rem; cursor:pointer; }
  button.active { background: rgba(34,211,238,.2); border-color: rgba(34,211,238,.45); }
  .layout { display:grid; grid-template-columns: 320px 1fr; gap:.8rem; min-height: 26rem; }
  .left, .right, .actions-panel { border:1px solid rgba(148,163,184,.2); border-radius:.8rem; padding:.7rem; background: rgba(2,6,23,.42); }
  .state { margin:0; color: rgba(148,163,184,.95); }
  ul { list-style:none; margin:0; padding:0; display:grid; gap:.45rem; }
  .case-item { width:100%; text-align:left; display:grid; gap:.18rem; }
  .case-item strong { font-size:.9rem; }
  .case-item small { color: rgba(148,163,184,.9); font-size:.73rem; }
  .detail { display:grid; gap:.45rem; }
  .row { display:flex; justify-content:space-between; align-items:center; gap:.6rem; }
  h2 { margin:0; font-size:1rem; }
  .status { text-transform:uppercase; letter-spacing:.04em; font-size:.72rem; color: rgba(186,230,253,.95); }
  .message-box { border:1px solid rgba(148,163,184,.2); border-radius:.65rem; padding:.6rem; background: rgba(15,23,42,.5); }
  .message-box h3 { margin:0 0 .3rem; font-size:.86rem; }
  .message-box p { margin:0; white-space: pre-wrap; }
  .trust-events { list-style:none; margin:.25rem 0 0; padding:0; display:grid; gap:.3rem; }
  .trust-events li { display:flex; gap:.45rem; align-items:center; font-size:.82rem; color: rgba(226,232,240,.92); }
  .trust-events small { color: rgba(148,163,184,.9); margin-left:auto; }
  .actions { display:flex; flex-wrap:wrap; gap:.4rem; margin-top:.4rem; }
  .danger { border-color: rgba(248,113,113,.45); color: rgba(254,226,226,.96); background: rgba(127,29,29,.35); }
  .actions-panel li { border:1px solid rgba(148,163,184,.2); border-radius:.65rem; padding:.55rem .6rem; }
  .actions-panel p { margin:.18rem 0 0; color: rgba(226,232,240,.9); }
  .actions-panel small { color: rgba(148,163,184,.9); }
  .error { margin:0; color:#fda4af; }

  @media (max-width: 960px) {
    .layout { grid-template-columns: 1fr; }
  }
</style>
