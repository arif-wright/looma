<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import CircleList from '$lib/components/circles/CircleList.svelte';
  import CircleDetail from '$lib/components/circles/CircleDetail.svelte';
  import CircleCreateModal from '$lib/components/circles/CircleCreateModal.svelte';
  import CircleJoinModal from '$lib/components/circles/CircleJoinModal.svelte';
  import type { CircleDetailPayload, CircleEventSummary, CircleSummary } from '$lib/components/circles/types';

  export let data;

  const currentUserId = (data?.user?.id as string | undefined) ?? null;

  let circles: CircleSummary[] = [];
  let activeCircleId: string | null = null;
  let activeDetail: CircleDetailPayload | null = null;
  let activeEvents: CircleEventSummary[] = [];
  let eventsLoading = false;
  let loading = false;
  let errorMessage: string | null = null;

  let showCreate = false;
  let createLoading = false;
  let createError: string | null = null;

  let showJoin = false;
  let joinLoading = false;
  let joinError: string | null = null;

  const loadCircleEvents = async (circleId: string) => {
    eventsLoading = true;
    try {
      const res = await fetch(`/api/circles/events?circleId=${encodeURIComponent(circleId)}`, {
        headers: { 'cache-control': 'no-store' }
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof payload?.message === 'string' ? payload.message : 'Failed to load events.');
      }

      activeEvents = Array.isArray(payload?.items) ? (payload.items as CircleEventSummary[]) : [];
    } finally {
      eventsLoading = false;
    }
  };

  const loadCircles = async (preferCurrent = true) => {
    loading = true;
    errorMessage = null;
    try {
      const res = await fetch('/api/circles/list', { headers: { 'cache-control': 'no-store' } });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof payload?.message === 'string' ? payload.message : 'Failed to load circles.');
      }

      const items = Array.isArray(payload?.items) ? (payload.items as CircleSummary[]) : [];
      circles = items;
      if (!items.length) {
        activeCircleId = null;
        activeDetail = null;
        activeEvents = [];
        return;
      }

      const keepId = preferCurrent && activeCircleId && items.some((circle) => circle.circleId === activeCircleId)
        ? activeCircleId
        : items[0]?.circleId ?? null;

      if (keepId) {
        activeCircleId = keepId;
        await loadDetail(keepId);
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Failed to load circles.';
    } finally {
      loading = false;
    }
  };

  const loadDetail = async (circleId: string) => {
    const res = await fetch(`/api/circles/detail?circleId=${encodeURIComponent(circleId)}`, {
      headers: { 'cache-control': 'no-store' }
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(typeof payload?.message === 'string' ? payload.message : 'Failed to load circle detail.');
    }
    activeDetail = payload as CircleDetailPayload;
    await loadCircleEvents(circleId);
  };

  const post = async (path: string, body: Record<string, unknown>) => {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(typeof payload?.message === 'string' ? payload.message : 'Request failed.');
    }
    return payload;
  };

  const onCreate = async (event: CustomEvent<{ name: string; description: string; privacy: 'public' | 'invite' }>) => {
    createLoading = true;
    createError = null;
    try {
      const payload = await post('/api/circles/create', event.detail);
      showCreate = false;
      await loadCircles(false);
      if (typeof payload?.circleId === 'string') {
        activeCircleId = payload.circleId;
        await loadDetail(payload.circleId);
      }
    } catch (err) {
      createError = err instanceof Error ? err.message : 'Could not create circle.';
    } finally {
      createLoading = false;
    }
  };

  const onJoin = async (event: CustomEvent<{ inviteCode: string }>) => {
    joinLoading = true;
    joinError = null;
    try {
      const payload = await post('/api/circles/join', event.detail);
      showJoin = false;
      await loadCircles(false);
      if (typeof payload?.circleId === 'string') {
        activeCircleId = payload.circleId;
        await loadDetail(payload.circleId);
      }
    } catch (err) {
      joinError = err instanceof Error ? err.message : 'Could not join circle.';
    } finally {
      joinLoading = false;
    }
  };

  const onLeave = async (event: CustomEvent<{ circleId: string }>) => {
    errorMessage = null;
    try {
      await post('/api/circles/leave', event.detail);
      await loadCircles(false);
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Could not leave circle.';
    }
  };

  const onAnnounce = async (event: CustomEvent<{ circleId: string; title: string; body: string; pinned: boolean }>) => {
    errorMessage = null;
    try {
      await post('/api/circles/announce', event.detail);
      if (activeCircleId) await loadDetail(activeCircleId);
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Could not post announcement.';
    }
  };

  const onSetRole = async (event: CustomEvent<{ circleId: string; userId: string; role: 'admin' | 'member' }>) => {
    errorMessage = null;
    try {
      await post('/api/circles/member/role', event.detail);
      if (activeCircleId) await loadDetail(activeCircleId);
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Could not update role.';
    }
  };

  const onKick = async (event: CustomEvent<{ circleId: string; userId: string }>) => {
    errorMessage = null;
    try {
      await post('/api/circles/member/kick', event.detail);
      if (activeCircleId) await loadDetail(activeCircleId);
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Could not remove member.';
    }
  };

  const onCreateEvent = async (
    event: CustomEvent<{ circleId: string; title: string; description: string; startsAt: string; endsAt: string; location: string }>
  ) => {
    errorMessage = null;
    try {
      await post('/api/circles/events/create', {
        circleId: event.detail.circleId,
        title: event.detail.title,
        description: event.detail.description,
        startsAt: event.detail.startsAt,
        endsAt: event.detail.endsAt || undefined,
        location: event.detail.location || undefined
      });
      if (activeCircleId) {
        await loadCircleEvents(activeCircleId);
      }
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Could not create event.';
    }
  };

  onMount(async () => {
    await loadCircles(false);
  });
</script>

<div class="circles-shell">
  <CircleList
    {circles}
    activeCircleId={activeCircleId}
    on:select={async (event) => {
      activeCircleId = event.detail.circleId;
      try {
        await loadDetail(event.detail.circleId);
      } catch (err) {
        errorMessage = err instanceof Error ? err.message : 'Failed to load circle.';
      }
    }}
    on:create={() => {
      showCreate = true;
      createError = null;
    }}
    on:join={() => {
      showJoin = true;
      joinError = null;
    }}
  />

  <section class="detail-surface">
    {#if loading}
      <p class="state">Loading circles…</p>
    {:else}
      <CircleDetail
        detail={activeDetail}
        events={activeEvents}
        {eventsLoading}
        {currentUserId}
        on:openChat={(event) => goto(`/app/messages?conversationId=${encodeURIComponent(event.detail.conversationId)}`)}
        on:leave={onLeave}
        on:announce={onAnnounce}
        on:setRole={onSetRole}
        on:kick={onKick}
        on:createEvent={onCreateEvent}
        on:viewAllEvents={(event) => goto(`/app/events?circleId=${encodeURIComponent(event.detail.circleId)}`)}
      />
    {/if}

    {#if errorMessage}
      <p class="error" role="status">{errorMessage}</p>
    {/if}
  </section>
</div>

<CircleCreateModal
  open={showCreate}
  loading={createLoading}
  error={createError}
  on:close={() => {
    showCreate = false;
  }}
  on:submit={onCreate}
/>

<CircleJoinModal
  open={showJoin}
  loading={joinLoading}
  error={joinError}
  on:close={() => {
    showJoin = false;
  }}
  on:submit={onJoin}
/>

<style>
  .circles-shell {
    min-height: calc(100vh - 9rem);
    margin: 1rem;
    border: 1px solid rgba(148, 163, 184, 0.22);
    border-radius: 1rem;
    overflow: hidden;
    display: grid;
    grid-template-columns: 320px 1fr;
    background:
      linear-gradient(164deg, rgba(15, 23, 42, 0.72), rgba(2, 6, 23, 0.82)),
      radial-gradient(circle at right top, rgba(20, 184, 166, 0.2), transparent 55%);
  }

  .detail-surface {
    position: relative;
    min-height: 0;
  }

  .state {
    margin: 0;
    padding: 1rem;
    color: rgba(148, 163, 184, 0.94);
  }

  .error {
    position: absolute;
    left: 1rem;
    bottom: 1rem;
    margin: 0;
    color: #fda4af;
    background: rgba(51, 65, 85, 0.9);
    border: 1px solid rgba(251, 113, 133, 0.35);
    border-radius: 0.55rem;
    padding: 0.45rem 0.65rem;
  }

  @media (max-width: 960px) {
    .circles-shell {
      margin: 0.5rem 0.5rem 5.2rem;
      min-height: calc(100vh - 7rem);
      grid-template-columns: 1fr;
      grid-template-rows: minmax(16rem, 34vh) 1fr;
    }
  }
</style>
