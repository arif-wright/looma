<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { Gift, Heart, Leaf, Sparkles, Trophy, X } from 'lucide-svelte';

  type GrowthStageView = {
    label: string;
    unlockLevel: number;
  };

  type GrowthMilestoneView = {
    title: string;
    description: string;
    time: string;
    type: 'level' | 'bond' | 'gift' | 'trait' | 'story' | 'ritual';
  };

  export let open = false;
  export let companionName = 'Companion';
  export let stages: GrowthStageView[] = [];
  export let currentStageIndex = 0;
  export let level = 1;
  export let bond = 0;
  export let growthBonus = 0;
  export let giftsLearned = 0;
  export let resonancePotential = 'Steady';
  export let growthHarmony = 'Steady';
  export let traits: string[] = [];
  export let milestones: GrowthMilestoneView[] = [];
  export let nextStageLabel: string | null = null;
  export let nextStageLevel: number | null = null;
  export let onClose: () => void = () => {};

  let dialogRef: HTMLDivElement | null = null;
  let previousActiveElement: HTMLElement | null = null;
  let wasOpen = false;

  const handleClose = () => {
    onClose();
    void tick().then(() => previousActiveElement?.focus?.());
  };

  const stageStatus = (index: number) => {
    if (index < currentStageIndex) return 'completed';
    if (index === currentStageIndex) return 'current';
    return 'locked';
  };

  const milestoneIcon = (type: GrowthMilestoneView['type']) => {
    if (type === 'bond') return Heart;
    if (type === 'gift') return Gift;
    if (type === 'trait') return Leaf;
    if (type === 'level') return Trophy;
    return Sparkles;
  };

  $: unlockedTraits = traits.length ? traits : ['Reflective', 'Gentle', 'Observant'];
  $: lockedTraits = ['Deeper Recall', 'Ritual Attunement', 'Living Memory'].filter(
    (trait) => !unlockedTraits.includes(trait)
  );

  $: if (open && !wasOpen) {
    wasOpen = true;
    if (typeof document !== 'undefined') {
      previousActiveElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    }
    void tick().then(() => dialogRef?.focus());
  }

  $: if (!open && wasOpen) {
    wasOpen = false;
  }

  onMount(() => {
    const handleKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && open) handleClose();
    };
    window.addEventListener('keydown', handleKeydown);
    return () => window.removeEventListener('keydown', handleKeydown);
  });
</script>

{#if open}
  <div class="growth-modal-shell" role="presentation">
    <button type="button" class="growth-modal-backdrop" aria-label="Close Growth Path" on:click={handleClose}></button>
    <div
      bind:this={dialogRef}
      class="growth-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="growth-path-title"
      tabindex="-1"
    >
      <header class="growth-modal__head">
        <div>
          <p>Growth Path</p>
          <h2 id="growth-path-title">{companionName}'s Growth Path</h2>
          <span>Growth is shaped by level, bond, rituals, gifts, and shared memories.</span>
        </div>
        <button type="button" class="close-button" aria-label="Close Growth Path" on:click={handleClose}>
          <X size={18} />
        </button>
      </header>

      <div class="growth-modal__body">
        <section class="growth-path-section growth-path-section--wide" aria-label="Life Stages">
          <div class="section-head">
            <span>Life Stages</span>
            <strong>{nextStageLabel ? `Next: ${nextStageLabel}` : 'Current path is open'}</strong>
          </div>
          <div class="stage-path">
            {#each stages as stage, index}
              <article class:current={stageStatus(index) === 'current'} class:locked={stageStatus(index) === 'locked'}>
                <span><Sparkles size={18} /></span>
                <strong>{stage.label}</strong>
                <small>
                  {stageStatus(index) === 'completed'
                    ? 'Completed'
                    : stageStatus(index) === 'current'
                      ? 'Current Stage'
                      : `Level ${stage.unlockLevel}`}
                </small>
              </article>
            {/each}
          </div>
        </section>

        <section class="growth-path-section">
          <div class="section-head">
            <span>Growth Traits</span>
            <strong>{unlockedTraits.length} active</strong>
          </div>
          <div class="trait-list">
            {#each unlockedTraits as trait}
              <article>
                <Leaf size={16} />
                <p><strong>{trait}</strong><small>Shapes rituals, reactions, and story memories.</small></p>
              </article>
            {/each}
            {#each lockedTraits as trait}
              <article class="locked">
                <Leaf size={16} />
                <p><strong>{trait}</strong><small>Opens through deeper shared history.</small></p>
              </article>
            {/each}
          </div>
        </section>

        <section class="growth-path-section">
          <div class="section-head">
            <span>Milestone History</span>
            <strong>Recent</strong>
          </div>
          <div class="milestone-list">
            {#each milestones as milestone}
              {@const Icon = milestoneIcon(milestone.type)}
              <article>
                <span><Icon size={16} /></span>
                <p><strong>{milestone.title}</strong><small>{milestone.description}</small></p>
                <time>{milestone.time}</time>
              </article>
            {/each}
          </div>
        </section>

        <section class="growth-path-section">
          <div class="section-head">
            <span>What Shapes Growth</span>
            <strong>{growthHarmony}</strong>
          </div>
          <div class="shaping-grid">
            <article><Heart size={17} /><strong>Bond</strong><small>{bond}% connection</small></article>
            <article><Gift size={17} /><strong>Gifts</strong><small>{giftsLearned} learned</small></article>
            <article><Sparkles size={17} /><strong>Rituals</strong><small>{growthBonus}% growth bonus</small></article>
            <article><Trophy size={17} /><strong>Journey</strong><small>Level {level}</small></article>
          </div>
        </section>

        <section class="growth-path-section next-unlocks">
          <div class="section-head">
            <span>Next Unlocks</span>
            <strong>{resonancePotential}</strong>
          </div>
          <p>
            {nextStageLabel && nextStageLevel
              ? `${companionName} is moving toward ${nextStageLabel} at Level ${nextStageLevel}.`
              : `${companionName} is continuing to deepen through rituals, Gifts, and shared memories.`}
          </p>
          <small>Next trait: Ritual Attunement</small>
          <small>Next reward: Gift slot and deeper bond capacity</small>
        </section>
      </div>
    </div>
  </div>
{/if}

<style>
  .growth-modal-shell {
    position: fixed;
    inset: 0;
    z-index: 9500;
    display: grid;
    place-items: center;
    background:
      radial-gradient(circle at 50% 30%, rgba(142, 87, 255, 0.24), transparent 24rem),
      rgba(3, 4, 13, 0.78);
    padding: 1.25rem;
    backdrop-filter: blur(14px);
  }

  .growth-modal-backdrop {
    position: absolute;
    inset: 0;
    border: 0;
    background: transparent;
  }

  .growth-modal {
    position: relative;
    z-index: 1;
    width: min(64rem, 100%);
    max-height: min(44rem, calc(100vh - 2.5rem));
    overflow: hidden;
    border: 1px solid rgba(153, 130, 236, 0.24);
    border-radius: 1.25rem;
    background:
      radial-gradient(circle at 16% 0%, rgba(183, 92, 255, 0.18), transparent 24rem),
      radial-gradient(circle at 82% 14%, rgba(221, 170, 92, 0.1), transparent 21rem),
      rgba(8, 9, 27, 0.98);
    box-shadow: 0 2rem 5rem rgba(0, 0, 0, 0.56), inset 0 1px 0 rgba(255, 255, 255, 0.06);
    color: rgba(248, 246, 255, 0.94);
    outline: none;
  }

  .growth-modal__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    border-bottom: 1px solid rgba(153, 130, 236, 0.16);
    padding: 1.2rem 1.28rem 1rem;
  }

  .growth-modal__head p,
  .section-head span {
    margin: 0;
    color: #ddaa5c;
    font-size: 0.68rem;
    font-weight: 900;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .growth-modal__head h2 {
    margin: 0.12rem 0 0.26rem;
    font-size: clamp(1.35rem, 2vw, 1.72rem);
  }

  .growth-modal__head span {
    color: rgba(220, 216, 237, 0.68);
    font-size: 0.86rem;
  }

  .close-button {
    display: grid;
    width: 2.45rem;
    height: 2.45rem;
    place-items: center;
    border: 1px solid rgba(153, 130, 236, 0.2);
    border-radius: 0.82rem;
    background: rgba(255, 255, 255, 0.045);
    color: rgba(248, 246, 255, 0.88);
    cursor: pointer;
  }

  .growth-modal__body {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 1rem;
    max-height: calc(min(44rem, 100vh - 2.5rem) - 5.7rem);
    overflow: auto;
    padding: 1.05rem 1.28rem 1.28rem;
  }

  .growth-path-section {
    display: grid;
    align-content: start;
    gap: 0.82rem;
    border: 1px solid rgba(153, 130, 236, 0.18);
    border-radius: 1rem;
    background:
      radial-gradient(circle at 16% 0%, rgba(183, 92, 255, 0.13), transparent 58%),
      rgba(255, 255, 255, 0.04);
    padding: 1rem;
  }

  .growth-path-section--wide {
    grid-column: 1 / -1;
  }

  .section-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
  }

  .section-head strong {
    color: rgba(255, 250, 242, 0.96);
    font-size: 0.86rem;
  }

  .stage-path {
    display: grid;
    grid-template-columns: repeat(5, minmax(0, 1fr));
    gap: 0.65rem;
  }

  .stage-path article,
  .trait-list article,
  .milestone-list article,
  .shaping-grid article {
    border: 1px solid rgba(153, 130, 236, 0.15);
    border-radius: 0.84rem;
    background: rgba(10, 11, 31, 0.42);
  }

  .stage-path article {
    display: grid;
    place-items: center;
    gap: 0.34rem;
    min-height: 6.2rem;
    padding: 0.7rem;
    text-align: center;
  }

  .stage-path article > span {
    display: grid;
    width: 2.5rem;
    height: 2.5rem;
    place-items: center;
    border-radius: 999px;
    background: rgba(183, 92, 255, 0.12);
    color: #b75cff;
  }

  .stage-path article.current {
    border-color: rgba(183, 92, 255, 0.62);
    box-shadow: 0 0 1.2rem rgba(183, 92, 255, 0.18);
  }

  .stage-path article.locked {
    opacity: 0.58;
  }

  .stage-path strong,
  .trait-list strong,
  .milestone-list strong,
  .shaping-grid strong {
    color: white;
    font-size: 0.82rem;
  }

  .stage-path small,
  .trait-list small,
  .milestone-list small,
  .shaping-grid small,
  .next-unlocks small,
  .next-unlocks p {
    margin: 0;
    color: rgba(220, 216, 237, 0.66);
    font-size: 0.75rem;
    font-weight: 700;
    line-height: 1.4;
  }

  .trait-list,
  .milestone-list,
  .shaping-grid {
    display: grid;
    gap: 0.55rem;
  }

  .trait-list article,
  .milestone-list article {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.65rem;
    padding: 0.65rem;
  }

  .trait-list article {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .trait-list article.locked {
    opacity: 0.58;
  }

  .trait-list p,
  .milestone-list p {
    display: grid;
    gap: 0.16rem;
    margin: 0;
  }

  .milestone-list article > span {
    display: grid;
    width: 2.1rem;
    height: 2.1rem;
    place-items: center;
    border-radius: 0.7rem;
    background: rgba(183, 92, 255, 0.12);
    color: #c87bff;
  }

  .milestone-list time {
    color: rgba(220, 216, 237, 0.54);
    font-size: 0.7rem;
    font-weight: 800;
  }

  .shaping-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .shaping-grid article {
    display: grid;
    gap: 0.28rem;
    padding: 0.72rem;
  }

  .shaping-grid :global(svg),
  .trait-list :global(svg) {
    color: #b75cff;
  }

  .next-unlocks {
    background:
      radial-gradient(circle at 50% 0%, rgba(183, 92, 255, 0.18), transparent 62%),
      rgba(255, 255, 255, 0.04);
  }

  @media (max-width: 760px) {
    .growth-modal-shell {
      align-items: stretch;
      padding: 0.7rem;
    }

    .growth-modal__body,
    .stage-path,
    .shaping-grid {
      grid-template-columns: 1fr;
    }
  }
</style>
