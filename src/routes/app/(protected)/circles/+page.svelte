<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import CircleList from '$lib/components/circles/CircleList.svelte';
  import CircleDetail from '$lib/components/circles/CircleDetail.svelte';
  import CircleCreateModal from '$lib/components/circles/CircleCreateModal.svelte';
  import CircleJoinModal from '$lib/components/circles/CircleJoinModal.svelte';
  import SanctuaryShell from '$lib/components/ui/sanctuary/SanctuaryShell.svelte';
  import SanctuaryHeader from '$lib/components/ui/sanctuary/SanctuaryHeader.svelte';
  import GlassCard from '$lib/components/ui/sanctuary/GlassCard.svelte';
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

<SanctuaryShell>
  <SanctuaryHeader
    eyebrow="Community"
    title="Circles"
    subtitle="Move between intimate groups built for support, reflection, and shared moments."
  />

  <GlassCard class="circles-card">
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
  </GlassCard>
</SanctuaryShell>

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
  :global(.circles-card) {
    padding: 0.35rem;
    border-radius: 1.35rem;
    border-color: rgba(208, 223, 245, 0.24);
    background:
      linear-gradient(164deg, rgba(20, 34, 74, 0.62), rgba(12, 22, 50, 0.52)),
      radial-gradient(circle at 80% 8%, rgba(102, 193, 200, 0.13), transparent 56%);
  }

  .circles-shell {
    min-height: calc(100vh - 12.8rem);
    margin: 0;
    border: 1px solid rgba(190, 211, 237, 0.2);
    border-radius: 1.15rem;
    overflow: hidden;
    display: grid;
    grid-template-columns: 320px 1fr;
    background:
      linear-gradient(164deg, rgba(14, 23, 53, 0.78), rgba(9, 16, 40, 0.85)),
      radial-gradient(circle at 84% 6%, rgba(85, 209, 191, 0.14), transparent 54%);
  }

  .detail-surface {
    position: relative;
    min-height: 0;
  }

  .state {
    margin: 0;
    padding: 1.1rem;
    color: rgba(200, 214, 237, 0.9);
  }

  .error {
    position: absolute;
    left: 1rem;
    bottom: calc(1rem + env(safe-area-inset-bottom));
    margin: 0;
    color: #fda4af;
    background: rgba(51, 65, 85, 0.9);
    border: 1px solid rgba(251, 113, 133, 0.35);
    border-radius: 0.55rem;
    padding: 0.45rem 0.65rem;
  }

  :global(.circle-list) {
    background: linear-gradient(180deg, rgba(18, 31, 66, 0.84), rgba(11, 21, 47, 0.88));
    border-right-color: rgba(185, 206, 233, 0.24);
  }

  :global(.circle-list header h2) {
    font-family: var(--san-font-display);
    font-size: 0.94rem;
    letter-spacing: 0.1em;
    color: rgba(236, 243, 252, 0.92);
  }

  :global(.circle-list .actions button) {
    border-radius: 999px;
    border: 1px solid rgba(202, 223, 244, 0.42);
    padding: 0.42rem 0.88rem;
    background: linear-gradient(130deg, rgba(98, 186, 255, 0.9), rgba(114, 233, 209, 0.9));
    color: rgba(8, 18, 40, 0.94);
  }

  :global(.circle-list .actions button.ghost) {
    background: rgba(38, 58, 108, 0.52);
    color: rgba(234, 241, 252, 0.95);
  }

  :global(.circle-list ul li button) {
    border-top-color: rgba(183, 202, 229, 0.14);
    padding: 0.92rem 1rem;
  }

  :global(.circle-list ul li button:hover),
  :global(.circle-list ul li button:focus-visible),
  :global(.circle-list ul li button.active) {
    background: linear-gradient(105deg, rgba(77, 188, 175, 0.18), rgba(90, 150, 242, 0.14));
  }

  :global(.circle-detail header) {
    border-bottom-color: rgba(187, 208, 234, 0.24);
    background: linear-gradient(180deg, rgba(22, 36, 77, 0.56), rgba(14, 26, 56, 0.46));
    padding: 1.08rem 1.08rem 1rem;
  }

  :global(.circle-detail header h2) {
    font-family: var(--san-font-display);
    font-size: 1.22rem;
    color: rgba(241, 247, 253, 0.98);
  }

  :global(.circle-detail .actions button) {
    border-radius: 0.9rem;
    border: 1px solid rgba(191, 211, 237, 0.34);
    background: linear-gradient(130deg, rgba(84, 176, 245, 0.92), rgba(113, 232, 207, 0.9));
    color: rgba(8, 20, 43, 0.94);
  }

  :global(.circle-detail .actions button.ghost) {
    background: rgba(32, 50, 96, 0.56);
    color: rgba(233, 240, 252, 0.95);
  }

  :global(.circle-detail .grid) {
    padding: 1.08rem;
    gap: 0.92rem;
    background:
      radial-gradient(circle at 86% 110%, rgba(252, 169, 133, 0.08), transparent 35%),
      transparent;
  }

  @media (max-width: 960px) {
    .circles-shell {
      min-height: calc(100vh - 13.2rem);
      grid-template-columns: 1fr;
      grid-template-rows: minmax(17rem, 36vh) 1fr;
    }
  }

  @media (max-width: 640px) {
    :global(.circles-card) {
      padding: 0.28rem;
      border-radius: 1.05rem;
    }

    .circles-shell {
      border-radius: 0.95rem;
      min-height: calc(100vh - 12.4rem);
      grid-template-rows: minmax(14rem, 33vh) 1fr;
    }

    :global(.circle-detail header) {
      padding: 0.9rem 0.86rem;
    }

    :global(.circle-detail .grid) {
      padding: 0.86rem;
      gap: 0.76rem;
    }

    .error {
      left: 0.7rem;
      right: 0.7rem;
      bottom: calc(0.7rem + env(safe-area-inset-bottom));
      text-align: center;
    }
  }
</style>
