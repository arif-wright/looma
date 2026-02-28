<script lang="ts">
  import type { FeedItem } from '$lib/social/types';
  import type { CompanionRitual } from '$lib/companions/rituals';

  type JournalMoment = {
    id: string;
    label: string;
    body: string;
    href: string;
  };

  type SanctuaryNudge = {
    title: string;
    body: string;
    ctaLabel: string;
    href: string;
  };

  type DailyArc = {
    title: string;
    body: string;
    progressLabel: string;
    nextStepId: 'arrive' | 'ritual' | 'express' | 'remember' | null;
    steps: Array<{
      id: 'arrive' | 'ritual' | 'express' | 'remember';
      label: string;
      title: string;
      body: string;
      href: string;
      complete: boolean;
    }>;
  };

  type DailyArcRecap = {
    title: string;
    body: string;
    unlockedAt: string | null;
  };

  type WeeklyArc = {
    title: string;
    body: string;
    emphasis: 'care' | 'social' | 'mission' | 'play' | 'quiet';
    progressLabel: string;
  };

  type ChapterMilestone = {
    id: string;
    label: string;
    title: string;
    body: string;
  };

  type ChapterReward = {
    rewardKey: string;
    title: string;
    body: string;
    tone: 'care' | 'social' | 'mission' | 'play' | 'bond';
    unlockedAt: string | null;
  };

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
  export let rituals: CompanionRitual[] = [];
  export let hasDailyCheckin = false;
  export let journalMoments: JournalMoment[] = [];
  export let sanctuaryNudge: SanctuaryNudge | null = null;
  export let dailyArc: DailyArc | null = null;
  export let dailyArcRecap: DailyArcRecap | null = null;
  export let weeklyArc: WeeklyArc | null = null;
  export let chapterMilestones: ChapterMilestone[] = [];
  export let chapterRewards: ChapterReward[] = [];

  const ritualSummary = (list: CompanionRitual[]) => {
    const total = Array.isArray(list) ? list.length : 0;
    const completed = list.filter((entry) => entry.status === 'completed').length;
    const next = list.find((entry) => entry.status !== 'completed') ?? null;
    return { total, completed, next };
  };

  const formatDate = (iso: string | null) => {
    if (!iso) return null;
    const ts = Date.parse(iso);
    if (!Number.isFinite(ts)) return null;
    return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  $: journalDate = formatDate(journalUpdatedAt);
  $: circleAuthor = feedPreview?.author_name ?? feedPreview?.display_name ?? 'Someone close';
  $: circlePreview = feedPreview?.body || feedPreview?.text || 'A new signal is waiting in your circle.';
  $: daily = ritualSummary(rituals);
  $: sanctuaryState =
    hasDailyCheckin && daily.completed === daily.total && daily.total > 0
      ? 'Sanctuary complete'
      : hasDailyCheckin
        ? 'Keep the sanctuary warm'
        : 'Start your daily sanctuary';
  $: sanctuaryCopy =
    sanctuaryNudge?.body ??
    (hasDailyCheckin
      ? daily.next
        ? `${daily.completed}/${daily.total} rituals complete. Next: ${daily.next.title}.`
        : 'You checked in and completed today’s rituals. Come back any time for another small moment.'
      : `${companionName} is still waiting to hear from you today.`);
</script>

<section class="secondary-stack" aria-label="Home actions">
  <article class="focus-card focus-card--ritual">
    <div class="focus-card__eyebrow">Daily sanctuary</div>
    <div class="focus-card__row">
      <div>
        <h2>{sanctuaryNudge?.title ?? sanctuaryState}</h2>
        <p>{sanctuaryCopy}</p>
      </div>
      <a class="focus-card__link" href={sanctuaryNudge?.href ?? companionHref}>
        {sanctuaryNudge?.ctaLabel ?? (hasDailyCheckin ? 'Continue' : 'Begin')}
      </a>
    </div>
    <div class="sanctuary-progress" aria-label="Daily sanctuary progress">
      <span>{hasDailyCheckin ? 'Check-in complete' : 'Check-in waiting'}</span>
      <span>{daily.completed}/{daily.total || 0} rituals</span>
    </div>
    {#if dailyArc}
      <div class="arc-card" aria-label="Daily companion arc">
        <div class="arc-card__head">
          <strong>{dailyArc.title}</strong>
          <span>{dailyArc.progressLabel}</span>
        </div>
        <p>{dailyArc.body}</p>
        <div class="arc-steps">
          {#each dailyArc.steps as step}
            <a class={`arc-step ${step.complete ? 'arc-step--done' : ''}`} href={step.href}>
              <span class="arc-step__label">{step.label}</span>
              <strong>{step.title}</strong>
            </a>
          {/each}
        </div>
      </div>
    {/if}
    {#if dailyArcRecap}
      <div class="recap-card" aria-label="Daily recap">
        <span class="moment-pill__label">Recap</span>
        <strong>{dailyArcRecap.title}</strong>
        <p>{dailyArcRecap.body}</p>
      </div>
    {/if}
  </article>

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
    {#if journalMoments.length > 0}
      <div class="moment-strip" aria-label="Recent journal moments">
        {#each journalMoments as moment}
          <a class="moment-pill" href={moment.href}>
            <span class="moment-pill__label">{moment.label}</span>
            <strong>{moment.body}</strong>
          </a>
        {/each}
      </div>
    {/if}
    {#if weeklyArc}
      <div class="recap-card recap-card--weekly" aria-label="Weekly companion chapter">
        <span class="moment-pill__label">Weekly chapter</span>
        <strong>{weeklyArc.title}</strong>
        <p>{weeklyArc.body}</p>
      </div>
    {/if}
    {#if chapterMilestones.length > 0}
      <div class="chapter-strip" aria-label="Chapter milestones">
        {#each chapterMilestones.slice(0, 2) as milestone}
          <a class="moment-pill" href={journalHref}>
            <span class="moment-pill__label">{milestone.label}</span>
            <strong>{milestone.title}</strong>
          </a>
        {/each}
      </div>
    {/if}
    {#if chapterRewards.length > 0}
      <div class="chapter-strip" aria-label="Chapter rewards">
        {#each chapterRewards.slice(0, 1) as reward}
          <a class="moment-pill" href={journalHref}>
            <span class="moment-pill__label">Keepsake</span>
            <strong>{reward.title}</strong>
          </a>
        {/each}
      </div>
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

  .sanctuary-progress {
    margin-top: 0.7rem;
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    color: rgba(193, 178, 149, 0.78);
    font-size: 0.75rem;
  }

  .moment-strip {
    margin-top: 0.8rem;
    display: grid;
    gap: 0.55rem;
  }

  .arc-card {
    margin-top: 0.85rem;
    display: grid;
    gap: 0.65rem;
    padding-top: 0.8rem;
    border-top: 1px solid rgba(212, 190, 139, 0.12);
  }

  .arc-card__head {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    align-items: baseline;
  }

  .arc-card__head strong {
    font-size: 0.87rem;
    color: rgba(250, 243, 229, 0.96);
  }

  .arc-card__head span {
    font-size: 0.74rem;
    color: rgba(193, 178, 149, 0.78);
  }

  .arc-steps {
    display: grid;
    gap: 0.5rem;
  }

  .arc-step {
    padding: 0.7rem 0.8rem;
    border-radius: 0.95rem;
    border: 1px solid rgba(212, 190, 139, 0.12);
    background: rgba(217, 189, 126, 0.06);
    display: grid;
    gap: 0.16rem;
    text-decoration: none;
    color: inherit;
  }

  .arc-step--done {
    background: rgba(130, 196, 150, 0.11);
    border-color: rgba(130, 196, 150, 0.2);
  }

  .arc-step__label {
    font-size: 0.64rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(217, 189, 126, 0.72);
  }

  .arc-step strong {
    font-size: 0.8rem;
    line-height: 1.3;
    color: rgba(236, 228, 211, 0.92);
  }

  .recap-card {
    margin-top: 0.8rem;
    padding: 0.85rem;
    border-radius: 1rem;
    border: 1px solid rgba(212, 190, 139, 0.14);
    background: rgba(217, 189, 126, 0.08);
    display: grid;
    gap: 0.28rem;
  }

  .recap-card--weekly {
    margin-top: 0.7rem;
  }

  .chapter-strip {
    margin-top: 0.65rem;
    display: grid;
    gap: 0.5rem;
  }

  .recap-card strong {
    font-size: 0.86rem;
    color: rgba(250, 243, 229, 0.96);
  }

  .recap-card p {
    margin: 0;
    color: rgba(224, 216, 200, 0.82);
    font-size: 0.82rem;
    line-height: 1.45;
  }

  .moment-pill {
    padding: 0.72rem 0.78rem;
    border-radius: 1rem;
    border: 1px solid rgba(212, 190, 139, 0.12);
    background: rgba(217, 189, 126, 0.08);
    display: grid;
    gap: 0.2rem;
    text-decoration: none;
    color: inherit;
  }

  .moment-pill__label {
    display: inline-flex;
    font-size: 0.64rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(217, 189, 126, 0.72);
  }

  .moment-pill strong {
    font-size: 0.81rem;
    line-height: 1.35;
    color: rgba(236, 228, 211, 0.9);
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
