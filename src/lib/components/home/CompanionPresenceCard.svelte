<script lang="ts">
import { browser } from '$app/environment';
import { onDestroy } from 'svelte';
import type { ActiveCompanionSnapshot } from '$lib/stores/companions';
import { getBondBonusForLevel, formatBonusSummary } from '$lib/companions/bond';
import InfoTooltip from '$lib/components/ui/InfoTooltip.svelte';
import { BOND_LEVEL_TOOLTIP, MOOD_TOOLTIP } from '$lib/companions/companionCopy';
import { computeCompanionEffectiveState, moodDescriptionFor } from '$lib/companions/effectiveState';
import {
  clearCachedCompanionPortrait,
  getCachedCompanionPortrait,
  isProbablyNonBlankPortrait,
  isProbablyValidPortrait
} from '$lib/companions/portrait';

  export let companion: ActiveCompanionSnapshot | null = null;
  export let className = '';
  export let title = 'Your Companion Today';

  const DEFAULT_AVATAR = '/avatar.svg';
  let previousBondLevel: number | null = null;
  let bondLevelTag: number | null = null;
  let bondTagTimer: ReturnType<typeof setTimeout> | null = null;
  let portraitSrc: string | null = null;
  let portraitForId: string | null = null;
  let portraitRequest = 0;

  const loadPortrait = async (instanceId: string) => {
    const requestId = ++portraitRequest;
    const cached = getCachedCompanionPortrait(instanceId);
    if (!isProbablyValidPortrait(cached)) {
      portraitSrc = null;
      return;
    }

    // Show immediately, then verify it's not a "blank but valid" cached frame.
    portraitSrc = cached;
    const ok = await isProbablyNonBlankPortrait(cached);
    if (requestId !== portraitRequest) return;
    if (!ok) {
      clearCachedCompanionPortrait(instanceId);
      portraitSrc = null;
    }
  };

  $: companionAsInstance =
    companion
      ? ({
          id: companion.id,
          name: companion.name,
          species: companion.species ?? 'Muse',
          rarity: 'common',
          level: 1,
          xp: 0,
          affection: companion.affection,
          trust: companion.trust,
          energy: companion.energy,
          mood: companion.mood ?? 'steady',
          avatar_url: companion.avatar_url ?? null,
          created_at: new Date().toISOString(),
          updated_at: companion.updated_at ?? new Date().toISOString(),
          stats: companion.stats ?? null
        } as any)
      : null;

  $: effective = companionAsInstance ? computeCompanionEffectiveState(companionAsInstance) : null;
  $: moodKey = effective?.moodKey ?? null;
  $: moodLabel = effective?.moodLabel ?? null;
  $: affectionPct = effective ? Math.min(100, Math.max(0, effective.affection)) : companion ? Math.min(100, Math.max(0, companion.affection)) : 0;
  $: trustPct = effective ? Math.min(100, Math.max(0, effective.trust)) : companion ? Math.min(100, Math.max(0, companion.trust)) : 0;
  $: energyPct = effective ? Math.min(100, Math.max(0, effective.energy)) : companion ? Math.min(100, Math.max(0, companion.energy)) : 0;
  $: speciesLabel = companion?.species ? `${companion.species}` : 'Unknown species';
  $: bondLevel = companion?.bondLevel ?? 0;
  $: bondBonus = getBondBonusForLevel(bondLevel);
  $: bonusSummary = formatBonusSummary(bondBonus);

  $: if (browser) {
    const id = companion?.id ?? null;
    if (id !== portraitForId) {
      portraitForId = id;
      portraitSrc = null;
      if (id) void loadPortrait(id);
    }
  }

  const clearBondTagTimer = () => {
    if (bondTagTimer) {
      clearTimeout(bondTagTimer);
      bondTagTimer = null;
    }
  };

  const showBondTag = (level: number) => {
    bondLevelTag = level;
    clearBondTagTimer();
    bondTagTimer = setTimeout(() => {
      bondLevelTag = null;
      bondTagTimer = null;
    }, 3600);
  };

  $: {
    if (!companion) {
      previousBondLevel = null;
      bondLevelTag = null;
      clearBondTagTimer();
    } else {
      if (previousBondLevel !== null && bondLevel > previousBondLevel) {
        showBondTag(bondLevel);
      }
      previousBondLevel = bondLevel;
    }
  }

  onDestroy(() => {
    clearBondTagTimer();
  });
</script>

<article
  class={`companion-card ${className}`.trim()}
  aria-label={companion ? 'Your companion today' : 'No companion yet'}
  {...$$restProps}
>
  <header class="card-head">
    <div>
      <p class="card-label">{title}</p>
      <h3>{companion ? companion.name : 'No companion yet'}</h3>
      <p class="card-subtitle">
        {companion ? speciesLabel : 'Choose a companion to travel beside you across Looma.'}
      </p>
    </div>
    {#if companion}
      <div class="card-head__meta">
        <div class="pill-with-hint">
          <span class={`mood-pill mood-pill--${moodKey ?? 'steady'}`}>{moodLabel ?? 'Steady'}</span>
          <InfoTooltip text={MOOD_TOOLTIP} label="What mood means" />
        </div>
        <div class="pill-with-hint">
          <span class="bond-pill" aria-label={`Bond level ${bondLevel}`}>
            Bond Lv {bondLevel}
          </span>
          <InfoTooltip text={BOND_LEVEL_TOOLTIP} label="Bond level explainer" />
        </div>
      </div>
    {/if}
    {#if bondLevelTag}
      <span class="bond-level-tag" role="status">Bond level up! Lv {bondLevelTag}</span>
    {/if}
  </header>

  {#if companion}
    <div class="card-body">
      <div class="avatar-ring" aria-label={`Energy ${energyPct}`}>
        <div class="avatar-ring__meter" style={`--percent:${energyPct}`}>
          <img src={portraitSrc ?? companion.avatar_url ?? DEFAULT_AVATAR} alt="" class="avatar-ring__img" aria-hidden="true" />
        </div>
        <span class="avatar-ring__label">Energy {energyPct}%</span>
      </div>
      <div class="stat-block">
        <div>
          <span class="stat-label">Affection</span>
          <div class="stat-meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(affectionPct)}>
            <span style={`width:${affectionPct}%`}></span>
          </div>
        </div>
        <div>
          <span class="stat-label">Trust</span>
          <div class="stat-meter" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(trustPct)}>
            <span style={`width:${trustPct}%`}></span>
          </div>
        </div>
        <p class="mood-copy">{moodKey ? moodDescriptionFor(moodKey) : 'Steady · content by your side.'}</p>
        <p class="bonus-copy">{bonusSummary}</p>
      </div>
    </div>
    <a class="btn-check" href="/app/companions">Check in</a>
  {:else}
    <div class="empty-copy" role="status">
      <p class="empty-title">No active companion yet</p>
      <p class="empty-body">Choose a companion to travel with you through Looma and earn bonus XP.</p>
      <a class="btn-check empty-cta" href="/app/companions">Choose a companion</a>
    </div>
  {/if}
</article>

<style>
  .companion-card {
    border-radius: 22px;
    border: 1px solid rgba(255, 255, 255, 0.1);
    background: rgba(8, 10, 18, 0.9);
    padding: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .card-head {
    display: flex;
    justify-content: space-between;
    gap: 1rem;
    align-items: flex-start;
  }

  .card-head__meta {
    display: flex;
    gap: 0.6rem;
    align-items: center;
  }

  .pill-with-hint {
    display: inline-flex;
    gap: 0.35rem;
    align-items: center;
  }

  .bond-level-tag {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    border-radius: 999px;
    border: 1px solid rgba(251, 191, 36, 0.45);
    background: rgba(251, 191, 36, 0.12);
    color: rgba(251, 191, 36, 0.95);
    font-size: 0.75rem;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    padding: 0.18rem 0.85rem;
    margin-top: 0.4rem;
    animation: bondTagPop 0.4s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .card-label {
    margin: 0;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font-size: 0.75rem;
    color: rgba(255, 255, 255, 0.45);
  }

  .card-head h3 {
    margin: 0.15rem 0 0;
    font-size: 1.4rem;
  }

  .card-subtitle {
    margin: 0.2rem 0 0;
    color: rgba(255, 255, 255, 0.65);
    font-size: 0.95rem;
  }

  .mood-pill {
    align-self: flex-start;
    border-radius: 999px;
    padding: 0.25rem 0.85rem;
    border: 1px solid rgba(255, 255, 255, 0.15);
    font-size: 0.82rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }

  .mood-pill--radiant {
    border-color: rgba(94, 242, 255, 0.5);
    color: rgba(94, 242, 255, 0.9);
  }

  .mood-pill--calm,
  .mood-pill--quiet {
    border-color: rgba(255, 255, 255, 0.18);
    color: rgba(240, 244, 255, 0.82);
  }

  .mood-pill--waiting,
  .mood-pill--curious {
    border-color: rgba(236, 146, 255, 0.45);
    color: rgba(236, 146, 255, 0.9);
  }

  .mood-pill--steady {
    border-color: rgba(255, 255, 255, 0.15);
    color: rgba(240, 244, 255, 0.8);
  }

  .mood-pill--distant,
  .mood-pill--tired {
    border-color: rgba(255, 196, 120, 0.5);
    color: rgba(255, 196, 120, 0.85);
  }

  .mood-pill--resting,
  .mood-pill--sleep {
    border-color: rgba(255, 196, 120, 0.5);
    color: rgba(255, 196, 120, 0.85);
  }

  .bond-pill {
    align-self: flex-start;
    border-radius: 999px;
    padding: 0.2rem 0.75rem;
    border: 1px solid rgba(148, 163, 184, 0.4);
    font-size: 0.78rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: rgba(224, 231, 255, 0.85);
  }

  .card-body {
    display: grid;
    grid-template-columns: 160px 1fr;
    gap: 1.25rem;
    align-items: center;
  }

  .avatar-ring {
    display: flex;
    flex-direction: column;
    align-items: center;
    text-align: center;
    gap: 0.45rem;
  }

  .avatar-ring__meter {
    width: 120px;
    height: 120px;
    border-radius: 999px;
    background: conic-gradient(
      rgba(94, 242, 255, 0.9) calc(var(--percent, 0) * 1%),
      rgba(255, 255, 255, 0.08) calc(var(--percent, 0) * 1%)
    );
    padding: 4px;
    position: relative;
  }

  .avatar-ring__img {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: inherit;
    display: block;
    background: rgba(255, 255, 255, 0.05);
  }

  .avatar-ring__label {
    font-size: 0.85rem;
    color: rgba(255, 255, 255, 0.7);
  }

  .stat-block {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  .bonus-copy {
    margin: 0;
    font-size: 0.82rem;
    color: rgba(190, 227, 248, 0.82);
  }

  .stat-label {
    font-size: 0.72rem;
    letter-spacing: 0.2em;
    text-transform: uppercase;
    color: rgba(255, 255, 255, 0.55);
  }

  .stat-meter {
    height: 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.08);
    overflow: hidden;
    margin-top: 0.3rem;
  }

  .stat-meter span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: linear-gradient(90deg, rgba(94, 242, 255, 0.95), rgba(155, 92, 255, 0.9));
    transition: width 220ms ease;
  }

  .stat-block div:last-of-type .stat-meter span {
    background: linear-gradient(90deg, rgba(255, 196, 120, 0.95), rgba(255, 138, 74, 0.8));
  }

  .mood-copy {
    margin: 0.4rem 0 0;
    color: rgba(255, 255, 255, 0.78);
  }

  .btn-check {
    align-self: flex-start;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.18);
    padding: 0.55rem 1.35rem;
    text-decoration: none;
    text-transform: uppercase;
    letter-spacing: 0.18em;
    font-size: 0.75rem;
    transition: background 150ms ease, border-color 150ms ease;
  }

  .btn-check:hover,
  .btn-check:focus-visible {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.4);
  }

  .empty-copy {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    color: rgba(255, 255, 255, 0.72);
  }

  .empty-title {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 600;
    color: rgba(248, 250, 252, 0.92);
  }

  .empty-body {
    margin: 0;
    font-size: 0.95rem;
    color: rgba(255, 255, 255, 0.72);
  }

  .empty-cta {
    align-self: flex-start;
  }

  @keyframes bondTagPop {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .bond-level-tag {
      animation: none;
    }
  }

  @media (max-width: 720px) {
    .card-body {
      grid-template-columns: 1fr;
    }
  }
</style>
