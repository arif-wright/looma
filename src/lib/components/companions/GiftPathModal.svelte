<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { Check, Lock, Sparkles, X } from 'lucide-svelte';
  import type { Companion } from '$lib/stores/companions';
  import {
    canStrengthenGift,
    getGiftStrengthenCost,
    type CompanionGift,
    type GiftCategory,
    type GiftState
  } from '$lib/companions/identity';

  type GiftPathModalGift = CompanionGift & {
    displayState: GiftState;
    displayLevel: number;
    iconElement: string;
  };

  export let open = false;
  export let companion: Companion | null = null;
  export let companionName = 'Companion';
  export let giftPathEntries: Array<[GiftCategory, GiftPathModalGift[]]> = [];
  export let selectedGiftId: string | null = null;
  export let giftCategoryLabels: Record<GiftCategory, string> = {
    core: 'Core Gift',
    element: 'Element Gift',
    bond: 'Bond Gift',
    story: 'Story Gift'
  };
  export let getElementAssetPath: (elementId: string | null | undefined) => string = () =>
    '/assets/Elements/element-light.png';
  export let onClose: () => void = () => {};

  type GiftFilter = GiftCategory | 'all';

  let dialogRef: HTMLDivElement | null = null;
  let activeFilter: GiftFilter = 'all';
  let localSelectedGiftId: string | null = null;
  let previousActiveElement: HTMLElement | null = null;
  let wasOpen = false;

  const filterLabels: Record<GiftFilter, string> = {
    all: 'All',
    core: 'Core',
    element: 'Element',
    bond: 'Bond',
    story: 'Story'
  };

  const titleCase = (value: string) =>
    value
      .replace(/[_-]+/g, ' ')
      .trim()
      .replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase());

  const handleClose = () => {
    onClose();
    void tick().then(() => previousActiveElement?.focus?.());
  };

  const selectGift = (gift: GiftPathModalGift) => {
    localSelectedGiftId = gift.id;
  };

  const stateLabel = (gift: GiftPathModalGift) =>
    gift.displayState === 'locked' ? 'Locked' : gift.displayState === 'active' ? `Lvl ${gift.displayLevel}` : titleCase(gift.displayState);

  const actionLabel = (gift: GiftPathModalGift | null) => {
    if (!gift) return 'Select a Gift';
    if (gift.displayState === 'locked') return 'Locked';
    if (gift.displayLevel >= gift.maxLevel) return 'Fully Strengthened';
    return 'Strengthen Gift';
  };

  $: availableFilters = (['all', ...giftPathEntries.map(([category]) => category)] as GiftFilter[]).filter(
    (filter, index, list) => list.indexOf(filter) === index
  );
  $: allGifts = giftPathEntries.flatMap(([, gifts]) => gifts);
  $: filteredGiftPathEntries =
    activeFilter === 'all' ? giftPathEntries : giftPathEntries.filter(([category]) => category === activeFilter);
  $: if (!availableFilters.includes(activeFilter)) activeFilter = 'all';
  $: if (open && (!localSelectedGiftId || !allGifts.some((gift) => gift.id === localSelectedGiftId))) {
    localSelectedGiftId = selectedGiftId ?? allGifts[0]?.id ?? null;
  }
  $: selectedGift = allGifts.find((gift) => gift.id === localSelectedGiftId) ?? allGifts[0] ?? null;
  $: selectedCost = selectedGift ? getGiftStrengthenCost(companion, selectedGift) : null;
  $: canStrengthenSelected =
    Boolean(selectedGift) &&
    selectedGift?.displayState !== 'locked' &&
    Boolean(selectedGift && canStrengthenGift(companion, selectedGift));

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
  <div class="gift-modal-shell" role="presentation">
    <button type="button" class="gift-modal-backdrop" aria-label="Close Gift Path" on:click={handleClose}></button>
    <div
      bind:this={dialogRef}
      class="gift-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="gift-path-title"
      tabindex="-1"
    >
      <header class="gift-modal__head">
        <div>
          <p>Gift Path</p>
          <h2 id="gift-path-title">{companionName}'s Gift Path</h2>
          <span>Core, Element, and Bond Gifts grow through rituals, memories, and connection.</span>
        </div>
        <button type="button" class="close-button" aria-label="Close Gift Path" on:click={handleClose}>
          <X size={18} />
        </button>
      </header>

      <div class="gift-filter-row" aria-label="Gift filters">
        {#each availableFilters as filter}
          <button
            type="button"
            class:is-active={activeFilter === filter}
            aria-pressed={activeFilter === filter}
            on:click={() => (activeFilter = filter)}
          >
            {filterLabels[filter]}
          </button>
        {/each}
      </div>

      <div class="gift-modal__body">
        <section class="gift-tree" aria-label="Full Gift Path">
          {#each filteredGiftPathEntries as [category, gifts]}
            <div class="gift-tree-group">
              <span>{giftCategoryLabels[category]}s</span>
              <div class="gift-tree-list">
                {#each gifts as gift (gift.id)}
                  <button
                    type="button"
                    class="gift-node"
                    class:is-selected={selectedGift?.id === gift.id}
                    class:is-locked={gift.displayState === 'locked'}
                    aria-label={`${gift.name}, ${giftCategoryLabels[gift.category]}, ${stateLabel(gift)}`}
                    on:click={() => selectGift(gift)}
                  >
                    <span class="gift-node__icon" aria-hidden="true">
                      <img src={getElementAssetPath(gift.iconElement)} alt="" loading="lazy" />
                    </span>
                    <span class="gift-node__copy">
                      <strong>{gift.name}</strong>
                      <small>
                        {gift.displayState === 'locked'
                          ? `Locked · ${gift.unlockConditionLabel}`
                          : `${stateLabel(gift)}${gift.displayState === 'evolving' ? ' · Evolving' : ''}`}
                      </small>
                    </span>
                    <span class="gift-node__state" aria-hidden="true">
                      {#if gift.displayState === 'locked'}
                        <Lock size={14} />
                      {:else}
                        <Check size={14} />
                      {/if}
                    </span>
                  </button>
                {/each}
              </div>
            </div>
          {/each}
        </section>

        <aside class="gift-detail" aria-label="Selected Gift details">
          {#if selectedGift}
            <div class="gift-detail__icon" aria-hidden="true">
              <img src={getElementAssetPath(selectedGift.iconElement)} alt="" loading="lazy" />
            </div>
            <div class="gift-detail__copy">
              <span>{giftCategoryLabels[selectedGift.category]}</span>
              <h3>{selectedGift.name}</h3>
              <div class="gift-detail__badges">
                <b>{selectedGift.displayState === 'locked' ? 'Locked' : `Lvl ${selectedGift.displayLevel}/${selectedGift.maxLevel}`}</b>
                {#if selectedGift.displayState !== 'active'}
                  <em>{titleCase(selectedGift.displayState)}</em>
                {/if}
              </div>
              <p>{selectedGift.description}</p>
            </div>

            <dl class="gift-detail-list">
              <div>
                <dt>Effect</dt>
                <dd>{selectedGift.effectSummary}</dd>
              </div>
              <div>
                <dt>Visual Response</dt>
                <dd>{selectedGift.visualBehavior}</dd>
              </div>
              <div>
                <dt>Emotional Purpose</dt>
                <dd>{selectedGift.emotionalPurpose}</dd>
              </div>
              <div>
                <dt>Requirement</dt>
                <dd>{selectedGift.displayState === 'locked' ? selectedGift.unlockConditionLabel : 'Open through the current bond.'}</dd>
              </div>
            </dl>

            <div class="gift-action-box">
              <div>
                <span>Cost</span>
                <strong>{selectedCost ? `${selectedCost.amount} ${selectedCost.resource}` : 'Select a Gift'}</strong>
              </div>
              <button type="button" disabled={!canStrengthenSelected}>
                <Sparkles size={17} />
                {actionLabel(selectedGift)}
              </button>
              <p>Strengthening support is ready for the future Gift economy.</p>
            </div>
          {:else}
            <div class="gift-detail__empty">
              <Sparkles size={28} />
              <p>Select a Gift to see its path.</p>
            </div>
          {/if}
        </aside>
      </div>
    </div>
  </div>
{/if}

<style>
  .gift-modal-shell {
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

  .gift-modal-backdrop {
    position: absolute;
    inset: 0;
    border: 0;
    background: transparent;
    cursor: default;
  }

  .gift-modal {
    position: relative;
    z-index: 1;
    width: min(66rem, 100%);
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

  .gift-modal__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    border-bottom: 1px solid rgba(153, 130, 236, 0.16);
    padding: 1.2rem 1.28rem 1rem;
  }

  .gift-modal__head p,
  .gift-tree-group > span,
  .gift-detail__copy > span,
  .gift-action-box span {
    margin: 0;
    color: #ddaa5c;
    font-size: 0.68rem;
    font-weight: 900;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  .gift-modal__head h2 {
    margin: 0.12rem 0 0.26rem;
    font-size: clamp(1.35rem, 2vw, 1.72rem);
    letter-spacing: 0;
  }

  .gift-modal__head span {
    color: rgba(220, 216, 237, 0.68);
    font-size: 0.86rem;
  }

  .close-button {
    display: grid;
    width: 2.45rem;
    height: 2.45rem;
    flex: 0 0 auto;
    place-items: center;
    border: 1px solid rgba(153, 130, 236, 0.2);
    border-radius: 0.82rem;
    background: rgba(255, 255, 255, 0.045);
    color: rgba(248, 246, 255, 0.88);
    cursor: pointer;
  }

  .gift-filter-row {
    display: flex;
    gap: 0.5rem;
    overflow-x: auto;
    border-bottom: 1px solid rgba(153, 130, 236, 0.12);
    padding: 0.82rem 1.28rem;
  }

  .gift-filter-row button {
    min-height: 2.15rem;
    border: 1px solid rgba(153, 130, 236, 0.18);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.045);
    color: rgba(220, 216, 237, 0.74);
    cursor: pointer;
    font-weight: 800;
    padding: 0 0.9rem;
  }

  .gift-filter-row button.is-active,
  .gift-filter-row button:hover,
  .close-button:hover,
  .gift-node:hover,
  .gift-node:focus-visible {
    border-color: rgba(183, 92, 255, 0.58);
    color: white;
    box-shadow: 0 0 1.1rem rgba(183, 92, 255, 0.16);
  }

  .gift-filter-row button.is-active {
    background: rgba(109, 55, 235, 0.34);
  }

  .gift-modal__body {
    display: grid;
    grid-template-columns: minmax(0, 1.18fr) minmax(19rem, 0.82fr);
    gap: 1rem;
    max-height: calc(min(44rem, 100vh - 2.5rem) - 8.6rem);
    overflow: auto;
    padding: 1.05rem 1.28rem 1.28rem;
  }

  .gift-tree,
  .gift-tree-group,
  .gift-tree-list,
  .gift-detail,
  .gift-detail__copy,
  .gift-detail-list,
  .gift-action-box {
    display: grid;
  }

  .gift-tree {
    gap: 1rem;
    align-content: start;
  }

  .gift-tree-group {
    gap: 0.58rem;
  }

  .gift-tree-list {
    position: relative;
    gap: 0.5rem;
  }

  .gift-node {
    position: relative;
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto;
    align-items: center;
    gap: 0.72rem;
    min-height: 4.15rem;
    border: 1px solid rgba(153, 130, 236, 0.16);
    border-radius: 0.92rem;
    background:
      radial-gradient(circle at 14% 0%, rgba(183, 92, 255, 0.13), transparent 56%),
      rgba(255, 255, 255, 0.045);
    color: rgba(248, 246, 255, 0.92);
    cursor: pointer;
    font: inherit;
    padding: 0.58rem 0.7rem;
    text-align: left;
  }

  .gift-node::after {
    content: '';
    position: absolute;
    left: 2.05rem;
    top: 100%;
    width: 1px;
    height: 0.52rem;
    background: linear-gradient(180deg, rgba(183, 92, 255, 0.34), transparent);
  }

  .gift-node:last-child::after {
    display: none;
  }

  .gift-node.is-selected {
    border-color: rgba(183, 92, 255, 0.68);
    background:
      radial-gradient(circle at 14% 0%, rgba(183, 92, 255, 0.24), transparent 58%),
      rgba(93, 57, 202, 0.16);
  }

  .gift-node.is-locked {
    opacity: 0.62;
  }

  .gift-node:focus-visible {
    outline: 2px solid rgba(183, 92, 255, 0.72);
    outline-offset: 2px;
  }

  .gift-node__icon,
  .gift-detail__icon {
    display: grid;
    place-items: center;
    border: 1px solid rgba(153, 88, 255, 0.34);
    border-radius: 999px;
    background:
      radial-gradient(circle at 50% 34%, rgba(183, 92, 255, 0.32), transparent 58%),
      rgba(13, 15, 38, 0.92);
    box-shadow: inset 0 0 0.8rem rgba(183, 92, 255, 0.14);
  }

  .gift-node__icon {
    width: 3rem;
    height: 3rem;
  }

  .gift-node__icon img {
    width: 2.05rem;
    height: 2.05rem;
    object-fit: contain;
    filter: drop-shadow(0 0 0.52rem rgba(183, 92, 255, 0.54));
  }

  .gift-node__copy {
    display: grid;
    min-width: 0;
    gap: 0.22rem;
  }

  .gift-node__copy strong {
    overflow: hidden;
    color: rgba(255, 250, 242, 0.98);
    font-size: 0.94rem;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .gift-node__copy small {
    color: rgba(220, 216, 237, 0.64);
    font-size: 0.74rem;
    font-weight: 800;
  }

  .gift-node__state {
    display: grid;
    width: 1.82rem;
    height: 1.82rem;
    place-items: center;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.07);
    color: rgba(221, 170, 92, 0.94);
  }

  .gift-detail {
    align-content: start;
    gap: 0.85rem;
    border: 1px solid rgba(153, 130, 236, 0.18);
    border-radius: 1rem;
    background:
      radial-gradient(circle at 50% 0%, rgba(183, 92, 255, 0.16), transparent 62%),
      rgba(255, 255, 255, 0.04);
    padding: 1rem;
  }

  .gift-detail__icon {
    width: 4.2rem;
    height: 4.2rem;
  }

  .gift-detail__icon img {
    width: 3rem;
    height: 3rem;
    object-fit: contain;
    filter: drop-shadow(0 0 0.7rem rgba(183, 92, 255, 0.56));
  }

  .gift-detail__copy {
    gap: 0.42rem;
  }

  .gift-detail__copy h3 {
    margin: 0;
    color: white;
    font-size: 1.18rem;
  }

  .gift-detail__copy p,
  .gift-action-box p,
  .gift-detail__empty p {
    margin: 0;
    color: rgba(220, 216, 237, 0.72);
    font-size: 0.82rem;
    font-weight: 650;
    line-height: 1.45;
  }

  .gift-detail__badges {
    display: flex;
    gap: 0.42rem;
    flex-wrap: wrap;
  }

  .gift-detail__badges b,
  .gift-detail__badges em {
    border-radius: 999px;
    font-size: 0.68rem;
    font-style: normal;
    font-weight: 900;
    padding: 0.26rem 0.52rem;
  }

  .gift-detail__badges b {
    border: 1px solid rgba(183, 92, 255, 0.28);
    background: rgba(183, 92, 255, 0.13);
    color: rgba(229, 213, 255, 0.94);
  }

  .gift-detail__badges em {
    border: 1px solid rgba(221, 170, 92, 0.22);
    background: rgba(221, 170, 92, 0.1);
    color: rgba(255, 234, 196, 0.92);
  }

  .gift-detail-list {
    gap: 0.64rem;
    margin: 0;
  }

  .gift-detail-list div {
    display: grid;
    gap: 0.18rem;
    border-top: 1px solid rgba(153, 130, 236, 0.12);
    padding-top: 0.62rem;
  }

  .gift-detail-list dt {
    color: rgba(220, 216, 237, 0.52);
    font-size: 0.66rem;
    font-weight: 900;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .gift-detail-list dd {
    margin: 0;
    color: rgba(248, 246, 255, 0.84);
    font-size: 0.78rem;
    font-weight: 650;
    line-height: 1.38;
  }

  .gift-action-box {
    gap: 0.68rem;
    border: 1px solid rgba(153, 130, 236, 0.15);
    border-radius: 0.88rem;
    background: rgba(10, 11, 31, 0.55);
    padding: 0.78rem;
  }

  .gift-action-box > div {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.7rem;
  }

  .gift-action-box strong {
    color: white;
    font-size: 0.82rem;
  }

  .gift-action-box button {
    display: inline-flex;
    min-height: 2.75rem;
    align-items: center;
    justify-content: center;
    gap: 0.52rem;
    border: 1px solid rgba(207, 100, 255, 0.52);
    border-radius: 0.82rem;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.12), transparent 44%),
      linear-gradient(135deg, #5c39f0 0%, #7f35ee 52%, #9c42f1 100%);
    color: white;
    cursor: pointer;
    font-weight: 900;
  }

  .gift-action-box button:disabled {
    cursor: default;
    filter: grayscale(0.18);
    opacity: 0.58;
  }

  .gift-detail__empty {
    display: grid;
    min-height: 20rem;
    place-items: center;
    align-content: center;
    gap: 0.8rem;
    text-align: center;
  }

  @media (max-width: 760px) {
    .gift-modal-shell {
      align-items: stretch;
      padding: 0.7rem;
    }

    .gift-modal {
      max-height: calc(100vh - 1.4rem);
    }

    .gift-modal__body {
      grid-template-columns: 1fr;
      max-height: calc(100vh - 10rem);
      padding: 0.85rem;
    }

    .gift-modal__head {
      padding: 1rem;
    }
  }
</style>
