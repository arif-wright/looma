<script lang="ts">
  import { page } from '$app/stores';

  type UpcomingEvent = {
    eventId: string;
    circleId: string;
    circleName: string;
    title: string;
    description: string | null;
    startsAt: string;
    endsAt: string | null;
    location: string | null;
    myRsvp: 'going' | 'interested' | 'not_going' | null;
  };

  let items: UpcomingEvent[] = [];
  let loading = false;
  let errorMessage: string | null = null;
  let windowDays: 7 | 14 | 30 = 7;
  let circleIdFilter: string | null = null;

  const load = async () => {
    loading = true;
    errorMessage = null;
    try {
      const params = new URLSearchParams();
      params.set('days', String(windowDays));
      if (circleIdFilter) {
        params.set('circleId', circleIdFilter);
      }

      const res = await fetch(`/api/events/upcoming?${params.toString()}`, {
        headers: { 'cache-control': 'no-store' }
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof payload?.message === 'string' ? payload.message : 'Failed to load events.');
      }
      items = Array.isArray(payload?.items) ? (payload.items as UpcomingEvent[]) : [];
    } catch (err) {
      errorMessage = err instanceof Error ? err.message : 'Failed to load events.';
    } finally {
      loading = false;
    }
  };

  const setRsvp = async (eventId: string, status: 'going' | 'interested' | 'not_going') => {
    const previous = items;
    items = items.map((item) => (item.eventId === eventId ? { ...item, myRsvp: status } : item));
    const res = await fetch('/api/events/rsvp', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ eventId, status })
    });

    if (!res.ok) {
      items = previous;
    }
  };

  const formatLocal = (iso: string) => {
    const ts = Date.parse(iso);
    if (!Number.isFinite(ts)) return 'Unknown time';
    return new Date(ts).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  };

  $: circleIdFilter = $page.url.searchParams.get('circleId');
  $: void windowDays, circleIdFilter, load();
</script>

<section class="events-page" aria-label="My upcoming events">
  <header>
    <h1>My Upcoming Events</h1>
    <div class="filters" role="group" aria-label="Event range">
      <button type="button" class:active={windowDays === 7} on:click={() => (windowDays = 7)}>Next 7 days</button>
      <button type="button" class:active={windowDays === 30} on:click={() => (windowDays = 30)}>Next 30 days</button>
    </div>
  </header>

  {#if loading}
    <p class="state">Loading events…</p>
  {:else if errorMessage}
    <p class="error" role="status">{errorMessage}</p>
  {:else if items.length === 0}
    <p class="state">No upcoming events in your circles.</p>
  {:else}
    <ul>
      {#each items as item}
        <li>
          <div class="main">
            <strong>{item.title}</strong>
            <p class="meta">{item.circleName} · {formatLocal(item.startsAt)}{item.location ? ` · ${item.location}` : ''}</p>
            {#if item.description}
              <p class="desc">{item.description}</p>
            {/if}
          </div>
          <div class="rsvp" role="group" aria-label={`RSVP for ${item.title}`}>
            <button type="button" class:active={item.myRsvp === 'going'} on:click={() => setRsvp(item.eventId, 'going')}>Going</button>
            <button type="button" class:active={item.myRsvp === 'interested'} on:click={() => setRsvp(item.eventId, 'interested')}>Interested</button>
            <button type="button" class:active={item.myRsvp === 'not_going'} on:click={() => setRsvp(item.eventId, 'not_going')}>Not going</button>
          </div>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .events-page { margin: 1rem; padding: 1rem; border: 1px solid rgba(148,163,184,.22); border-radius: 1rem; background: rgba(15,23,42,.35); display:grid; gap:.9rem; }
  header { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:.7rem; }
  h1 { margin:0; font-size:1.25rem; }
  .filters { display:inline-flex; gap:.4rem; }
  button { border:1px solid rgba(148,163,184,.25); border-radius:.6rem; background: rgba(15,23,42,.5); color:#e2e8f0; padding:.42rem .65rem; cursor:pointer; }
  button.active { background: rgba(34,211,238,.22); border-color: rgba(34,211,238,.48); }
  .state { margin:0; color: rgba(148,163,184,.94); }
  .error { margin:0; color:#fda4af; }
  ul { list-style:none; margin:0; padding:0; display:grid; gap:.6rem; }
  li { display:grid; gap:.6rem; border:1px solid rgba(148,163,184,.18); border-radius:.8rem; padding:.75rem; }
  .main strong { font-size:1rem; }
  .meta { margin:.28rem 0 0; color: rgba(148,163,184,.95); font-size:.88rem; }
  .desc { margin:.35rem 0 0; color: rgba(226,232,240,.88); }
  .rsvp { display:flex; flex-wrap:wrap; gap:.45rem; }
</style>
