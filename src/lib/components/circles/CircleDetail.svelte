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
  .empty { display: grid; place-items: center; min-height: 100%; color: rgba(148, 163, 184, 0.9); }
  header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; padding: 1rem; border-bottom: 1px solid rgba(148, 163, 184, 0.18); background: rgba(15, 23, 42, 0.35); }
  h2 { margin: 0; font-size: 1.1rem; }
  p { margin: 0.28rem 0 0; color: rgba(226, 232, 240, 0.92); }
  small { display: block; margin-top: 0.3rem; color: rgba(148, 163, 184, 0.94); }
  .actions { display: inline-flex; gap: 0.45rem; }
  .actions button { border: none; border-radius: 0.66rem; background: #22d3ee; color: #083344; padding: 0.45rem 0.78rem; font-weight: 700; cursor: pointer; }
  .actions button.ghost { background: rgba(148, 163, 184, 0.2); color: #e2e8f0; }
  .grid { padding: 1rem; display: grid; gap: 0.8rem; }
</style>
