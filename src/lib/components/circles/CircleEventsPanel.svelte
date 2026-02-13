<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CircleEventSummary } from './types';

  export let circleId: string;
  export let canManage = false;
  export let events: CircleEventSummary[] = [];
  export let loading = false;

  const dispatch = createEventDispatcher<{
    create: {
      circleId: string;
      title: string;
      description: string;
      startsAt: string;
      endsAt: string;
      location: string;
    };
    viewAll: void;
  }>();

  let createOpen = false;
  let title = '';
  let description = '';
  let startsAt = '';
  let endsAt = '';
  let location = '';

  const submit = () => {
    if (!title.trim() || !startsAt) return;
    dispatch('create', {
      circleId,
      title: title.trim(),
      description: description.trim(),
      startsAt: new Date(startsAt).toISOString(),
      endsAt: endsAt ? new Date(endsAt).toISOString() : '',
      location: location.trim()
    });

    createOpen = false;
    title = '';
    description = '';
    startsAt = '';
    endsAt = '';
    location = '';
  };

  const formatLocal = (iso: string) => {
    const ts = Date.parse(iso);
    if (!Number.isFinite(ts)) return 'Unknown time';
    return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  };
</script>

<section class="panel" aria-label="Circle events">
  <header class="panel-head">
    <h3>Upcoming events</h3>
    <div class="actions">
      <button type="button" class="ghost" on:click={() => dispatch('viewAll')}>View all</button>
      {#if canManage}
        <button type="button" on:click={() => (createOpen = !createOpen)}>{createOpen ? 'Close' : 'Create event'}</button>
      {/if}
    </div>
  </header>

  {#if createOpen}
    <form class="create" on:submit|preventDefault={submit}>
      <input bind:value={title} placeholder="Event title" maxlength="120" required />
      <textarea bind:value={description} placeholder="Description (optional)" maxlength="2000"></textarea>
      <label>
        Starts
        <input bind:value={startsAt} type="datetime-local" required />
      </label>
      <label>
        Ends
        <input bind:value={endsAt} type="datetime-local" />
      </label>
      <input bind:value={location} placeholder="Location (optional)" maxlength="180" />
      <div class="row"><button type="submit">Save event</button></div>
    </form>
  {/if}

  {#if loading}
    <p class="state">Loading events…</p>
  {:else if events.length === 0}
    <p class="state">No events yet.</p>
  {:else}
    <ul>
      {#each events.slice(0, 3) as eventItem}
        <li>
          <div>
            <strong>{eventItem.title}</strong>
            <p>{formatLocal(eventItem.startsAt)}{eventItem.location ? ` · ${eventItem.location}` : ''}</p>
          </div>
          <small>{eventItem.counts.going} going</small>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .panel { border: 1px solid rgba(148,163,184,.2); border-radius: .8rem; padding: .8rem; background: rgba(15,23,42,.35); display:grid; gap:.65rem; }
  .panel-head { display:flex; justify-content:space-between; align-items:center; gap:.6rem; }
  h3 { margin:0; font-size:.96rem; }
  .actions { display:inline-flex; gap:.45rem; }
  button { border:0; border-radius:.55rem; padding:.36rem .62rem; cursor:pointer; font-weight:600; background:#22d3ee; color:#083344; }
  button.ghost { background: rgba(148,163,184,.2); color:#e2e8f0; }
  .create { display:grid; gap:.45rem; }
  input, textarea { width:100%; border-radius:.55rem; border:1px solid rgba(148,163,184,.24); background: rgba(15,23,42,.55); color:#e2e8f0; padding:.5rem .6rem; }
  textarea { min-height: 5.5rem; resize: vertical; }
  label { display:grid; gap:.3rem; color: rgba(226,232,240,.82); font-size:.85rem; }
  .row { display:flex; justify-content:flex-end; }
  .state { margin:0; color: rgba(148,163,184,.92); }
  ul { margin:0; padding:0; list-style:none; display:grid; gap:.45rem; }
  li { display:flex; justify-content:space-between; gap:.8rem; align-items:flex-start; border:1px solid rgba(148,163,184,.16); border-radius:.62rem; padding:.5rem .6rem; }
  strong { display:block; }
  p { margin:.18rem 0 0; color: rgba(226,232,240,.82); font-size:.88rem; }
  small { color: rgba(148,163,184,.9); white-space:nowrap; }
</style>
