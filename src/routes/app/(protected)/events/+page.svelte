<script lang="ts">
  import { page } from '$app/stores';
  import SanctuaryPageFrame from '$lib/components/ui/sanctuary/SanctuaryPageFrame.svelte';
  import EmotionalChip from '$lib/components/ui/sanctuary/EmotionalChip.svelte';

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

<SanctuaryPageFrame
  eyebrow="Gatherings"
  title="Events"
  subtitle="See what is coming up in your circles and keep RSVPs quick on a phone."
>
  <svelte:fragment slot="actions">
    <EmotionalChip tone="muted">{items.length} upcoming</EmotionalChip>
    <EmotionalChip tone="cool">Window {windowDays}d</EmotionalChip>
  </svelte:fragment>

  <section class="events-page" aria-label="My upcoming events">
    <header class="events-hero panel">
      <div>
        <p class="eyebrow">Circle rhythm</p>
        <h1>Upcoming events</h1>
        <p class="lede">Shared rituals and gatherings should feel like gentle continuity, not calendar clutter.</p>
      </div>
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
      <div class="empty-panel panel">
        <p class="state">No upcoming events in your circles.</p>
        <p class="empty-copy">When your circles schedule something, it will appear here with simple RSVP controls.</p>
      </div>
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
</SanctuaryPageFrame>

<style>
  .events-page {
    width: min(100%, 60rem);
    margin: 0 auto;
    padding: 1rem 0 calc(6rem + env(safe-area-inset-bottom));
    display:grid;
    gap:1rem;
  }

  .events-hero {
    border-radius: 1.25rem;
    border: 1px solid rgba(214, 190, 141, 0.16);
    background:
      linear-gradient(160deg, rgba(24, 20, 15, 0.78), rgba(12, 16, 19, 0.88)),
      radial-gradient(circle at top left, rgba(214, 190, 141, 0.14), transparent 42%);
    padding: 1rem;
    display:flex;
    flex-wrap:wrap;
    align-items:flex-start;
    justify-content:space-between;
    gap:.9rem;
  }

  .eyebrow {
    margin:0;
    font-size:.72rem;
    font-weight:700;
    letter-spacing:.14em;
    text-transform:uppercase;
    color: rgba(215, 191, 143, 0.78);
  }

  h1 { margin:.15rem 0 0; font-family: var(--san-font-display); font-size:clamp(1.5rem,4vw,2.2rem); color: rgba(249, 243, 230, 0.98); }
  .lede, .empty-copy { margin:.35rem 0 0; color: rgba(223, 211, 188, 0.78); line-height:1.5; }
  .filters { display:inline-flex; gap:.4rem; flex-wrap:wrap; }
  button { border:1px solid rgba(214, 190, 141, 0.16); border-radius:999px; background: rgba(43, 33, 20, 0.24); color:rgba(245, 238, 225, 0.95); padding:.5rem .85rem; cursor:pointer; font-weight:600; }
  button.active { background: rgba(214, 190, 141, 0.16); border-color: rgba(214, 190, 141, 0.34); color: rgba(250, 243, 230, 0.98); }
  .state { margin:0; color: rgba(220, 209, 184, 0.8); }
  .error { margin:0; color:#fda4af; }
  ul { list-style:none; margin:0; padding:0; display:grid; gap:.7rem; }
  li { display:grid; gap:.7rem; border:1px solid rgba(214, 190, 141, 0.14); border-radius:1rem; padding:.85rem; background: rgba(21, 18, 15, 0.72); }
  .main strong { font-size:1rem; color: rgba(245, 238, 225, 0.95); }
  .meta { margin:.28rem 0 0; color: rgba(198, 184, 154, 0.92); font-size:.88rem; }
  .desc { margin:.35rem 0 0; color: rgba(226,232,240,.88); }
  .rsvp { display:flex; flex-wrap:wrap; gap:.45rem; }
  .empty-panel {
    border-radius: 1.25rem;
    border: 1px solid rgba(214, 190, 141, 0.16);
    background: rgba(21, 18, 15, 0.72);
    padding: 1rem;
  }

  @media (max-width: 640px) {
    .events-hero {
      align-items: stretch;
    }
  }
</style>
