<script lang="ts">
  import type { FeedItem } from '$lib/social/types';

  export let feedPreview: FeedItem | null = null;
  export let journalHref = '/app/memory';
  export let journalSummary: string | null = null;
  export let journalUpdatedAt: string | null = null;
  export let missionTitle: string | null = null;
  export let missionSummary: string | null = null;
  export let missionHref = '/app/missions';
  export let messagesHref = '/app/messages';
  export let circlesHref = '/app/circles';
  export let notificationsUnread = 0;
  export let companionHref = '/app/companions';
  export let companionName = 'your companion';
  export let needsCheckin = false;

  const formatDate = (iso: string | null) => {
    if (!iso) return null;
    const ts = Date.parse(iso);
    if (!Number.isFinite(ts)) return null;
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  $: journalDate = formatDate(journalUpdatedAt);
  $: circleAuthor = feedPreview?.author_name ?? feedPreview?.display_name ?? 'Someone close';
  $: circlePreview = feedPreview?.body || feedPreview?.text || 'A new signal is waiting in your circle.';
</script>

<section class="secondary-stack" aria-label="Home actions">
  <article class="focus-card focus-card--journal">
    <div class="focus-card__eyebrow">Journal</div>
    <div class="focus-card__row">
      <div>
        <h2>Remember what {companionName} is holding</h2>
        <p>
          {journalSummary ?? `Open your journal to revisit moments, moods, and small shifts in your bond.`}
        </p>
      </div>
      <a class="focus-card__link" href={journalHref}>Open</a>
    </div>
    {#if journalDate}
      <p class="focus-card__meta">Updated {journalDate}</p>
    {/if}
  </article>

  <div class="shortcut-row" aria-label="Quick actions">
    <a class="shortcut" href={missionHref}>
      <span class="shortcut__label">Mission</span>
      <strong>{missionTitle ?? 'Pick up today’s path'}</strong>
      <span>{missionSummary ?? 'A short action to deepen your rhythm with Looma.'}</span>
    </a>

    <a class="shortcut" href={messagesHref}>
      <span class="shortcut__label">Messages</span>
      <strong>{notificationsUnread > 0 ? `${notificationsUnread} new moments` : 'Stay in touch'}</strong>
      <span>{notificationsUnread > 0 ? 'Your conversations are waiting.' : 'Check your threads and replies.'}</span>
    </a>
  </div>

  <div class="shortcut-row" aria-label="Connection actions">
    <a class="shortcut" href={circlesHref}>
      <span class="shortcut__label">Circles</span>
      <strong>{feedPreview ? `${circleAuthor} shared something` : 'Quiet for now'}</strong>
      <span>{circlePreview}</span>
    </a>

    <a class="shortcut" href={companionHref}>
      <span class="shortcut__label">Companions</span>
      <strong>{needsCheckin ? `${companionName} needs you` : `Care for ${companionName}`}</strong>
      <span>{needsCheckin ? 'Return for a check-in, care, or a quick ritual.' : 'Visit your sanctuary and shape the bond.'}</span>
    </a>
  </div>
</section>

<style>
  .secondary-stack {
    display: grid;
    gap: 0.9rem;
  }

  .focus-card,
  .shortcut {
    border-radius: 1.3rem;
    border: 1px solid rgba(212, 190, 139, 0.16);
    background:
      linear-gradient(180deg, rgba(21, 29, 31, 0.92), rgba(11, 16, 18, 0.96)),
      radial-gradient(circle at top, rgba(193, 156, 73, 0.12), transparent 52%);
    color: rgba(244, 237, 223, 0.96);
    text-decoration: none;
    box-shadow: 0 18px 30px rgba(5, 8, 10, 0.26);
  }

  .focus-card {
    padding: 1rem;
  }

  .focus-card__eyebrow,
  .shortcut__label {
    display: inline-flex;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(217, 189, 126, 0.76);
  }

  .focus-card__row {
    margin-top: 0.45rem;
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.9rem;
  }

  h2 {
    margin: 0;
    font-size: 1rem;
    line-height: 1.2;
  }

  .focus-card p,
  .shortcut span,
  .shortcut strong {
    margin: 0;
  }

  .focus-card p,
  .shortcut > span:last-child {
    color: rgba(224, 216, 200, 0.82);
    font-size: 0.84rem;
    line-height: 1.45;
  }

  .focus-card__link {
    flex-shrink: 0;
    min-height: 2.2rem;
    padding: 0 0.9rem;
    border-radius: 999px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(217, 189, 126, 0.15);
    border: 1px solid rgba(217, 189, 126, 0.28);
    color: rgba(253, 245, 228, 0.96);
    font-size: 0.82rem;
    font-weight: 700;
    text-decoration: none;
  }

  .focus-card__meta {
    margin-top: 0.6rem;
    color: rgba(193, 178, 149, 0.72);
    font-size: 0.75rem;
  }

  .shortcut-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .shortcut {
    min-height: 8.8rem;
    padding: 0.92rem;
    display: grid;
    align-content: start;
    gap: 0.45rem;
  }

  .shortcut strong {
    font-size: 0.95rem;
    line-height: 1.25;
    color: rgba(250, 243, 229, 0.98);
  }

  @media (max-width: 359px) {
    .shortcut-row {
      grid-template-columns: 1fr;
    }
  }
</style>
