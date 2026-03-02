<script lang="ts">
  import { browser } from '$app/environment';
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

  type SanctuaryShelfReward = ChapterReward & {
    featured: boolean;
  };

  type ChapterReveal = {
    id: string;
    title: string;
    body: string;
    href: string;
  };

  type EraAction = {
    title: string;
    body: string;
    primaryLabel: string;
    primaryHref: string;
    secondaryLabel: string;
    secondaryHref: string;
  };

  type ChapterPath = {
    id: string;
    label: string;
    title: string;
    body: string;
    href: string;
  };

  type MomentumSummary = {
    current: number | null;
    max: number | null;
    baseMax: number | null;
    subscriptionBonus: number;
  };

  export let feedPreview: FeedItem | null = null;
  export let journalHref = '/app/memory';
  export let journalSummary: string | null = null;
  export let journalUpdatedAt: string | null = null;
  export let chapterReveal: ChapterReveal | null = null;
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
  export let eraAction: EraAction | null = null;
  export let chapterPaths: ChapterPath[] = [];
  export let dailyArc: DailyArc | null = null;
  export let dailyArcRecap: DailyArcRecap | null = null;
  export let weeklyArc: WeeklyArc | null = null;
  export let chapterMilestones: ChapterMilestone[] = [];
  export let chapterRewards: ChapterReward[] = [];
  export let sanctuaryShelfRewards: SanctuaryShelfReward[] = [];
  export let premiumStyle: 'gilded_dawn' | 'moon_glass' | 'ember_bloom' | 'tide_silk' | null = null;
  export let momentum: MomentumSummary | null = null;

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
  $: shelfLead = sanctuaryShelfRewards[0] ?? null;
  $: momentumCurrent = typeof momentum?.current === 'number' ? momentum.current : null;
  $: momentumMax = typeof momentum?.max === 'number' ? momentum.max : null;
  $: momentumBaseMax = typeof momentum?.baseMax === 'number' ? momentum.baseMax : null;
  $: momentumLabel =
    momentumCurrent != null && momentumMax != null ? `${momentumCurrent}/${momentumMax}` : 'Optional progression fuel';
  $: momentumBonusLabel =
    (momentum?.subscriptionBonus ?? 0) > 0 && momentumBaseMax != null && momentumMax != null
      ? `Base ${momentumBaseMax} + Sanctuary+ ${momentum?.subscriptionBonus ?? 0}`
      : 'Core bonding stays free';
  let revealSeenId = '';
  let revealDismissed = false;

  $: if (browser) {
    const currentRevealId = chapterReveal?.id ?? '';
    if (!currentRevealId) {
      revealSeenId = '';
      revealDismissed = false;
    } else if (currentRevealId !== revealSeenId) {
      revealSeenId = currentRevealId;
      revealDismissed = window.localStorage.getItem(`looma:chapterRevealDismissed:${currentRevealId}`) === 'true';
    }
  }

  const dismissChapterReveal = () => {
    if (!chapterReveal) return;
    revealDismissed = true;
    if (!browser) return;
    window.localStorage.setItem(`looma:chapterRevealDismissed:${chapterReveal.id}`, 'true');
  };
</script>

<section class="secondary-stack" aria-label="Home actions" data-premium-style={premiumStyle ?? 'default'}>
  {#if chapterReveal && !revealDismissed}
    <article class="focus-card focus-card--reveal" aria-label="Chapter opened">
      <div class="chapter-reveal__head">
        <div>
          <span class="focus-card__eyebrow">Chapter opened</span>
          <h2>{chapterReveal.title}</h2>
        </div>
        <button type="button" class="chapter-reveal__dismiss" on:click={dismissChapterReveal} aria-label="Dismiss chapter reveal">
          Later
        </button>
      </div>
      <p>{chapterReveal.body}</p>
      <div class="chapter-reveal__actions">
        <a class="focus-card__link" href={chapterReveal.href}>Open journal</a>
        <a class="focus-card__link focus-card__link--ghost" href={companionHref}>Visit companion</a>
      </div>
    </article>
  {/if}

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

  {#if eraAction}
    <article class="focus-card focus-card--era" aria-label="Era guidance">
      <div class="focus-card__eyebrow">Era guidance</div>
      <div class="focus-card__row">
        <div>
          <h2>{eraAction.title}</h2>
          <p>{eraAction.body}</p>
        </div>
        <a class="focus-card__link" href={eraAction.primaryHref}>{eraAction.primaryLabel}</a>
      </div>
      <div class="chapter-reveal__actions">
        <a class="focus-card__link focus-card__link--ghost" href={eraAction.secondaryHref}>
          {eraAction.secondaryLabel}
        </a>
      </div>
    </article>
  {/if}

  {#if chapterPaths.length > 0}
    <article class="focus-card focus-card--paths" aria-label="Chapter paths">
      <div class="focus-card__eyebrow">Chapter paths</div>
      <div class="path-grid">
        {#each chapterPaths as path (path.id)}
          <a class="path-item" href={path.href}>
            <span class="path-item__label">{path.label}</span>
            <strong>{path.title}</strong>
            <p>{path.body}</p>
          </a>
        {/each}
      </div>
    </article>
  {/if}

  <article class="focus-card focus-card--momentum" aria-label="Momentum">
    <div class="focus-card__eyebrow">Momentum</div>
    <div class="focus-card__row">
      <div>
        <h2>{momentumLabel}</h2>
        <p>Momentum belongs to optional missions and reward-bearing play, not to staying close to {companionName}.</p>
      </div>
      <a class="focus-card__link" href="/app/wallet">View</a>
    </div>
    <div class="sanctuary-progress sanctuary-progress--momentum" aria-label="Momentum details">
      <span>{momentumBonusLabel}</span>
      <span>{(momentum?.subscriptionBonus ?? 0) > 0 ? 'Subscriber cap bonus active' : 'No bond actions cost momentum'}</span>
    </div>
    <div class="momentum-grid">
      <a class="path-item" href={missionHref}>
        <span class="path-item__label">Spend on</span>
        <strong>Missions and focused runs</strong>
        <p>Use momentum where shards, XP, or stronger rewards are at stake.</p>
      </a>
      <a class="path-item" href={journalHref}>
        <span class="path-item__label">Always free</span>
        <strong>Check-ins, journal, messages, and care</strong>
        <p>The relationship loop stays available even when your momentum is low.</p>
      </a>
    </div>
  </article>

  {#if sanctuaryShelfRewards.length > 0}
    <article class="focus-card focus-card--shelf">
      <div class="focus-card__eyebrow">Sanctuary shelf</div>
      <div class="focus-card__row">
        <div>
          <h2>{shelfLead?.featured ? 'Your featured keepsake is shaping today' : `${companionName}'s keepsakes are gathering meaning`}</h2>
          <p>
            {shelfLead?.featured
              ? `${shelfLead.title} is leading the atmosphere of your sanctuary right now.`
              : `Recent companion keepsakes are starting to shape the feel of your daily space.`}
          </p>
        </div>
        <a class="focus-card__link" href={companionHref}>Curate</a>
      </div>
      <div class="shelf-grid" aria-label="Sanctuary shelf keepsakes">
        {#each sanctuaryShelfRewards as reward (reward.rewardKey)}
          <a class={`shelf-item shelf-item--${reward.tone} ${reward.featured ? 'is-featured' : ''}`} href={companionHref}>
            <span class="shelf-item__label">{reward.featured ? 'Featured' : 'Artifact'}</span>
            <strong>{reward.title}</strong>
            <p>{reward.body}</p>
          </a>
        {/each}
      </div>
    </article>
  {/if}

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

  .focus-card--reveal {
    border-color: rgba(217, 189, 126, 0.28);
    background:
      linear-gradient(180deg, rgba(34, 27, 19, 0.94), rgba(15, 18, 20, 0.98)),
      radial-gradient(circle at top left, rgba(217, 189, 126, 0.18), transparent 48%);
  }

  .focus-card--era {
    border-color: rgba(217, 189, 126, 0.2);
    background:
      linear-gradient(180deg, rgba(27, 24, 19, 0.94), rgba(12, 16, 18, 0.98)),
      radial-gradient(circle at top left, rgba(193, 156, 73, 0.14), transparent 52%);
  }

  .focus-card--paths {
    border-color: rgba(214, 190, 141, 0.18);
    background:
      linear-gradient(180deg, rgba(24, 22, 18, 0.94), rgba(12, 16, 18, 0.98)),
      radial-gradient(circle at top left, rgba(214, 190, 141, 0.1), transparent 52%);
  }

  .focus-card--momentum {
    border-color: rgba(122, 194, 185, 0.2);
    background:
      linear-gradient(180deg, rgba(18, 27, 29, 0.94), rgba(10, 16, 18, 0.98)),
      radial-gradient(circle at top left, rgba(122, 194, 185, 0.14), transparent 52%);
  }

  .path-grid {
    margin-top: 0.8rem;
    display: grid;
    gap: 0.55rem;
  }

  .momentum-grid {
    margin-top: 0.8rem;
    display: grid;
    gap: 0.55rem;
  }

  .path-item {
    border-radius: 1rem;
    border: 1px solid rgba(212, 190, 139, 0.12);
    background: rgba(217, 189, 126, 0.06);
    color: inherit;
    text-decoration: none;
    padding: 0.82rem;
    display: grid;
    gap: 0.18rem;
  }

  .path-item__label {
    font-size: 0.64rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(217, 189, 126, 0.72);
  }

  .path-item strong {
    font-size: 0.84rem;
    line-height: 1.3;
    color: rgba(250, 243, 229, 0.96);
  }

  .path-item p {
    color: rgba(224, 216, 200, 0.76);
    font-size: 0.78rem;
  }

  .chapter-reveal__head {
    display: flex;
    justify-content: space-between;
    gap: 0.75rem;
    align-items: start;
  }

  .chapter-reveal__dismiss {
    min-height: 2rem;
    border-radius: 999px;
    border: 1px solid rgba(217, 189, 126, 0.18);
    background: rgba(217, 189, 126, 0.08);
    color: rgba(253, 245, 228, 0.88);
    padding: 0 0.78rem;
    font-size: 0.76rem;
    font-weight: 700;
  }

  .sanctuary-progress--momentum {
    margin-top: 0.75rem;
  }

  .chapter-reveal__actions {
    margin-top: 0.85rem;
    display: flex;
    gap: 0.6rem;
    flex-wrap: wrap;
  }

  .focus-card__link--ghost {
    background: rgba(217, 189, 126, 0.08);
  }

  .shelf-grid {
    margin-top: 0.85rem;
    display: grid;
    gap: 0.55rem;
  }

  .shelf-item {
    border-radius: 1rem;
    border: 1px solid rgba(212, 190, 139, 0.14);
    background: rgba(217, 189, 126, 0.06);
    color: inherit;
    text-decoration: none;
    padding: 0.82rem;
    display: grid;
    gap: 0.16rem;
  }

  .shelf-item.is-featured {
    box-shadow: 0 0 0 1px rgba(212, 190, 139, 0.2);
  }

  .shelf-item__label {
    font-size: 0.64rem;
    font-weight: 700;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: rgba(217, 189, 126, 0.72);
  }

  .shelf-item strong {
    font-size: 0.84rem;
    line-height: 1.3;
    color: rgba(250, 243, 229, 0.96);
  }

  .shelf-item p {
    color: rgba(224, 216, 200, 0.76);
    font-size: 0.78rem;
  }

  .shelf-item--care {
    border-color: rgba(132, 214, 179, 0.22);
    background: rgba(21, 41, 36, 0.44);
  }

  .shelf-item--social {
    border-color: rgba(233, 162, 122, 0.22);
    background: rgba(45, 27, 24, 0.44);
  }

  .shelf-item--mission {
    border-color: rgba(222, 186, 103, 0.22);
    background: rgba(43, 33, 20, 0.44);
  }

  .shelf-item--play {
    border-color: rgba(124, 220, 224, 0.22);
    background: rgba(20, 36, 45, 0.44);
  }

  .shelf-item--bond {
    border-color: rgba(214, 190, 141, 0.22);
    background: rgba(35, 29, 22, 0.44);
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

  .secondary-stack[data-premium-style='gilded_dawn'] .focus-card--reveal,
  .secondary-stack[data-premium-style='gilded_dawn'] .recap-card {
    border-color: rgba(227, 196, 120, 0.3);
    box-shadow: 0 18px 36px rgba(88, 58, 10, 0.18);
  }

  .secondary-stack[data-premium-style='gilded_dawn'] .focus-card--reveal {
    background:
      linear-gradient(180deg, rgba(43, 31, 18, 0.95), rgba(18, 17, 15, 0.98)),
      radial-gradient(circle at top left, rgba(227, 196, 120, 0.2), transparent 48%);
  }

  .secondary-stack[data-premium-style='gilded_dawn'] .recap-card {
    background: rgba(227, 196, 120, 0.11);
  }

  .secondary-stack[data-premium-style='moon_glass'] .focus-card--reveal,
  .secondary-stack[data-premium-style='moon_glass'] .recap-card {
    border-color: rgba(168, 205, 224, 0.28);
    box-shadow: 0 18px 36px rgba(20, 40, 62, 0.16);
  }

  .secondary-stack[data-premium-style='moon_glass'] .focus-card--reveal {
    background:
      linear-gradient(180deg, rgba(24, 31, 42, 0.95), rgba(11, 17, 24, 0.98)),
      radial-gradient(circle at top left, rgba(168, 205, 224, 0.18), transparent 48%);
  }

  .secondary-stack[data-premium-style='moon_glass'] .recap-card {
    background: rgba(168, 205, 224, 0.1);
  }

  .secondary-stack[data-premium-style='ember_bloom'] .focus-card--reveal,
  .secondary-stack[data-premium-style='ember_bloom'] .recap-card {
    border-color: rgba(236, 145, 113, 0.3);
    box-shadow: 0 18px 36px rgba(73, 24, 14, 0.18);
  }

  .secondary-stack[data-premium-style='ember_bloom'] .focus-card--reveal {
    background:
      linear-gradient(180deg, rgba(44, 23, 20, 0.95), rgba(20, 14, 14, 0.98)),
      radial-gradient(circle at top left, rgba(236, 145, 113, 0.2), transparent 48%);
  }

  .secondary-stack[data-premium-style='ember_bloom'] .recap-card {
    background: rgba(236, 145, 113, 0.1);
  }

  .secondary-stack[data-premium-style='tide_silk'] .focus-card--reveal,
  .secondary-stack[data-premium-style='tide_silk'] .recap-card {
    border-color: rgba(122, 202, 196, 0.28);
    box-shadow: 0 18px 36px rgba(12, 57, 56, 0.16);
  }

  .secondary-stack[data-premium-style='tide_silk'] .focus-card--reveal {
    background:
      linear-gradient(180deg, rgba(19, 37, 38, 0.95), rgba(12, 18, 20, 0.98)),
      radial-gradient(circle at top left, rgba(122, 202, 196, 0.18), transparent 48%);
  }

  .secondary-stack[data-premium-style='tide_silk'] .recap-card {
    background: rgba(122, 202, 196, 0.1);
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

  @media (min-width: 720px) {
    .momentum-grid {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .shelf-grid {
      grid-template-columns: repeat(3, minmax(0, 1fr));
    }
  }

  @media (max-width: 359px) {
    .chapter-reveal__actions {
      display: grid;
    }

    .shortcut-row {
      grid-template-columns: 1fr;
    }
  }
</style>
