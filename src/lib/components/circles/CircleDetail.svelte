<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import CircleMembersPanel from './CircleMembersPanel.svelte';
  import CircleAnnouncementPanel from './CircleAnnouncementPanel.svelte';
  import CircleEventsPanel from './CircleEventsPanel.svelte';
  import type { CircleDetailPayload, CircleEventSummary } from './types';

  export let detail: CircleDetailPayload | null = null;
  export let currentUserId: string | null = null;
  export let events: CircleEventSummary[] = [];
  export let eventsLoading = false;

  const dispatch = createEventDispatcher<{
    openChat: { conversationId: string };
    leave: { circleId: string };
    announce: { circleId: string; title: string; body: string; pinned: boolean };
    setRole: { circleId: string; userId: string; role: 'admin' | 'member' };
    kick: { circleId: string; userId: string };
    createEvent: {
      circleId: string;
      title: string;
      description: string;
      startsAt: string;
      endsAt: string;
      location: string;
    };
    viewAllEvents: { circleId: string };
  }>();

  $: canManage = detail?.circle?.myRole === 'owner' || detail?.circle?.myRole === 'admin';
</script>

<section class="circle-detail" aria-label="Circle detail">
  {#if !detail}
    <div class="empty">Select a circle.</div>
  {:else}
    <header>
      <div>
        <h2>{detail.circle.name}</h2>
        {#if detail.circle.description}
          <p>{detail.circle.description}</p>
        {/if}
        <small>{detail.members.length} members · {detail.circle.privacy}</small>
        {#if detail.circle.inviteCode}
          <small>Invite: {detail.circle.inviteCode}</small>
        {/if}
      </div>
      <div class="actions">
        {#if detail.circle.conversationId}
          <button type="button" on:click={() => dispatch('openChat', { conversationId: detail.circle.conversationId as string })}>Open Chat</button>
        {/if}
        {#if detail.circle.myRole !== 'owner'}
          <button type="button" class="ghost" on:click={() => dispatch('leave', { circleId: detail.circle.circleId })}>Leave</button>
        {/if}
      </div>
    </header>

    <div class="grid">
      <CircleEventsPanel
        circleId={detail.circle.circleId}
        {canManage}
        {events}
        loading={eventsLoading}
        on:create={(event) => dispatch('createEvent', event.detail)}
        on:viewAll={() => dispatch('viewAllEvents', { circleId: detail.circle.circleId })}
      />

      <CircleAnnouncementPanel
        pinned={detail.pinnedAnnouncement}
        canManage={canManage}
        on:announce={(event) => dispatch('announce', { circleId: detail.circle.circleId, ...event.detail })}
      />

      <CircleMembersPanel
        members={detail.members}
        myRole={detail.circle.myRole}
        myUserId={currentUserId}
        on:role={(event) => dispatch('setRole', { circleId: detail.circle.circleId, ...event.detail })}
        on:kick={(event) => dispatch('kick', { circleId: detail.circle.circleId, ...event.detail })}
      />
    </div>
  {/if}
</section>

<style>
  .circle-detail { min-height: 0; display: flex; flex-direction: column; }
  .empty { display: grid; place-items: center; min-height: 100%; color: rgba(184, 203, 230, 0.9); }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; padding: 1.02rem; border-bottom: 1px solid rgba(189, 209, 236, 0.24); background: linear-gradient(180deg, rgba(22, 36, 77, 0.56), rgba(14, 26, 56, 0.46)); }
  h2 { margin: 0; font-family: var(--san-font-display); font-size: 1.22rem; color: rgba(241, 247, 253, 0.98); }
  p { margin: 0.28rem 0 0; color: rgba(222, 233, 246, 0.92); }
  small { display: block; margin-top: 0.3rem; color: rgba(181, 201, 228, 0.9); }
  .actions { display: inline-flex; gap: 0.45rem; }
  .actions button { border: 1px solid rgba(192, 212, 238, 0.34); border-radius: 0.9rem; background: linear-gradient(130deg, rgba(84, 176, 245, 0.92), rgba(113, 232, 207, 0.9)); color: rgba(8, 20, 43, 0.94); padding: 0.48rem 0.82rem; font-weight: 700; cursor: pointer; }
  .actions button.ghost { background: rgba(32, 50, 96, 0.56); color: rgba(233, 240, 252, 0.95); }
  .grid { padding: 1.04rem; display: grid; gap: 0.86rem; background: radial-gradient(circle at 86% 110%, rgba(252, 169, 133, 0.08), transparent 35%); }
</style>
