<script lang="ts">
  import SanctuaryPageFrame from '$lib/components/ui/sanctuary/SanctuaryPageFrame.svelte';
  import EmotionalChip from '$lib/components/ui/sanctuary/EmotionalChip.svelte';

  type InventoryRow = {
    acquired_at: string;
    item: {
      id: string;
      slug: string;
      title: string;
      subtitle?: string | null;
      image_url?: string | null;
      rarity?: string | null;
      type?: string | null;
    };
  };

  type CompanionRewardRow = {
    reward_key: string;
    reward_title: string;
    reward_body: string;
    reward_tone?: string | null;
    unlocked_at: string;
    companion?: {
      id: string;
      name: string;
      species?: string | null;
    } | null;
  };

  export let data: { items: InventoryRow[]; companionRewards: CompanionRewardRow[]; error?: string | null };

  const items = Array.isArray(data?.items) ? data.items : [];
  const companionRewards = Array.isArray(data?.companionRewards) ? data.companionRewards : [];
  const error = data?.error ?? null;

  const formatDate = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.valueOf())
      ? 'Unknown'
      : date.toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        });
  };

  const titleCase = (value: string | null | undefined) =>
    value ? value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()) : 'Unknown';

  $: typeCounts = items.reduce<Record<string, number>>((acc, row) => {
    const key = (row?.item?.type ?? 'other').toLowerCase();
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  $: rarityCounts = items.reduce<Record<string, number>>((acc, row) => {
    const key = (row?.item?.rarity ?? 'common').toLowerCase();
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {});

  $: topTypes = Object.entries(typeCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  $: topRarity =
    Object.entries(rarityCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  $: latestAcquiredAt = items[0]?.acquired_at ?? null;
  $: latestRewardAt = companionRewards[0]?.unlocked_at ?? null;
</script>

<SanctuaryPageFrame
  eyebrow="Collection"
  title="Inventory"
  subtitle="Keep your owned cosmetics, boosts, and unlocks visible without breaking the sanctuary flow."
>
  <svelte:fragment slot="actions">
    <EmotionalChip tone="warm">{items.length + companionRewards.length} owned</EmotionalChip>
    <EmotionalChip tone="muted">{topRarity ? titleCase(topRarity) : 'Empty vault'}</EmotionalChip>
  </svelte:fragment>

  <main class="inventory-shell">
    <section class="inventory-pulse" aria-label="Inventory pulse">
      <div class="inventory-pulse__copy">
        <p class="inventory-pulse__eyebrow">Owned collection</p>
        <h2>{items.length + companionRewards.length === 0 ? 'Nothing stored yet' : `${items.length + companionRewards.length} keepsakes in your vault`}</h2>
        <p class="inventory-pulse__lede">
          {#if error}
            Inventory could not be loaded right now. Your owned items are still safe.
          {:else if items.length === 0}
            Visit the marketplace when you want new cosmetics, utility items, or bundle unlocks.
          {:else}
            Your inventory should feel like a living record of what you have gathered for play, care, and self-expression.
          {/if}
        </p>
      </div>

      <div class="inventory-pulse__stats">
        <article class="stat-card">
          <span class="stat-card__label">Latest addition</span>
          <strong>{latestRewardAt ? formatDate(latestRewardAt) : latestAcquiredAt ? formatDate(latestAcquiredAt) : 'No unlocks yet'}</strong>
          <span>
            {#if latestRewardAt}
              Most recent companion keepsake unlock.
            {:else if latestAcquiredAt}
              Most recent item arrival.
            {:else}
              Your first unlock will appear here.
            {/if}
          </span>
        </article>
        <article class="stat-card">
          <span class="stat-card__label">Top category</span>
          <strong>{topTypes[0] ? `${titleCase(topTypes[0][0])} x${topTypes[0][1]}` : 'None yet'}</strong>
          <span>What your collection currently leans toward.</span>
        </article>
      </div>

      <div class="inventory-quicklinks" aria-label="Inventory actions">
        <a class="quicklink quicklink--primary" href="/app/shop">Open marketplace</a>
        <a class="quicklink" href="/app/wallet">Check wallet</a>
      </div>
    </section>

    {#if error}
      <section class="inventory-state inventory-state--error" aria-live="polite">
        <h3>Inventory unavailable</h3>
        <p>Failed to load inventory: {error}</p>
      </section>
    {:else if !items.length && !companionRewards.length}
      <section class="inventory-state" aria-live="polite">
        <h3>Your vault is quiet</h3>
        <p>No items owned yet. Explore the shop to pick up your first cosmetic, utility item, or bundle.</p>
      </section>
    {:else}
      <section class="inventory-overview" aria-label="Inventory overview">
        <article class="overview-card">
          <span class="overview-card__label">Categories</span>
          <div class="overview-card__chips">
            {#each topTypes as [type, count]}
              <span class="overview-chip">{titleCase(type)} · {count}</span>
            {/each}
          </div>
        </article>
        <article class="overview-card">
          <span class="overview-card__label">Rarity pulse</span>
          <div class="overview-card__chips">
            {#each Object.entries(rarityCounts).sort((a, b) => b[1] - a[1]).slice(0, 4) as [rarity, count]}
              <span class="overview-chip">{titleCase(rarity)} · {count}</span>
            {/each}
          </div>
        </article>
      </section>

      {#if companionRewards.length > 0}
        <section class="inventory-overview" aria-label="Companion keepsakes">
          <article class="overview-card">
            <span class="overview-card__label">Companion keepsakes</span>
            <div class="overview-card__chips">
              {#each companionRewards.slice(0, 4) as reward}
                <span class="overview-chip">{reward.companion?.name ?? 'Companion'} · {reward.reward_title}</span>
              {/each}
            </div>
          </article>
        </section>

        <section class="inventory-grid" aria-label="Companion keepsakes">
          {#each companionRewards as reward}
            <article class="inventory-card" aria-label={`${reward.reward_title} companion keepsake`}>
              <div class="inventory-media">
                <div class="inventory-media__placeholder" aria-hidden="true">
                  {(reward.companion?.name ?? reward.reward_title).slice(0, 1)}
                </div>
                <span class="inventory-rarity">{titleCase(reward.reward_tone)}</span>
              </div>

              <div class="inventory-body">
                <div class="inventory-body__heading">
                  <div>
                    <h3>{reward.reward_title}</h3>
                    <p class="subtitle">{reward.companion?.name ?? 'Companion'} · {reward.companion?.species ?? 'Muse'}</p>
                  </div>
                  <span class="inventory-type">Keepsake</span>
                </div>

                <p class="subtitle">{reward.reward_body}</p>
                <p class="meta">Unlocked {formatDate(reward.unlocked_at)}</p>
              </div>
            </article>
          {/each}
        </section>
      {/if}

      <section class="inventory-grid" aria-label="Owned items">
        {#each items as row}
          <article class="inventory-card" data-test="inventory-card" aria-label={`${row.item.title} owned item`}>
            <div class="inventory-media">
              {#if row.item.image_url}
                <img src={row.item.image_url} alt={`${row.item.title} cover`} loading="lazy" />
              {:else}
                <div class="inventory-media__placeholder" aria-hidden="true">{row.item.title.slice(0, 1)}</div>
              {/if}
              <span class="inventory-rarity">{titleCase(row.item.rarity)}</span>
            </div>

            <div class="inventory-body">
              <div class="inventory-body__heading">
                <div>
                  <h3>{row.item.title}</h3>
                  {#if row.item.subtitle}
                    <p class="subtitle">{row.item.subtitle}</p>
                  {/if}
                </div>
                <span class="inventory-type">{titleCase(row.item.type)}</span>
              </div>

              <p class="meta">Acquired {formatDate(row.acquired_at)}</p>
            </div>
          </article>
        {/each}
      </section>
    {/if}
  </main>
</SanctuaryPageFrame>

<style>
  .inventory-shell {
    padding: 1rem 0 calc(6rem + env(safe-area-inset-bottom));
    display: grid;
    gap: 1rem;
  }

  .inventory-pulse {
    border-radius: 1.3rem;
    border: 1px solid rgba(214, 190, 141, 0.16);
    background:
      linear-gradient(160deg, rgba(25, 21, 16, 0.8), rgba(10, 13, 17, 0.9)),
      radial-gradient(circle at top left, rgba(214, 190, 141, 0.14), transparent 44%);
    padding: 1rem;
    display: grid;
    gap: 0.95rem;
  }

  .inventory-pulse__eyebrow,
  .stat-card__label,
  .overview-card__label {
    margin: 0;
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: rgba(215, 191, 143, 0.78);
  }

  .inventory-pulse h2 {
    margin: 0.18rem 0 0;
    font-family: var(--san-font-display);
    font-size: clamp(1.8rem, 5.4vw, 2.7rem);
    line-height: 1.04;
    color: rgba(249, 243, 230, 0.98);
  }

  .inventory-pulse__lede {
    margin: 0.42rem 0 0;
    max-width: 42rem;
    color: rgba(223, 211, 188, 0.78);
    line-height: 1.55;
  }

  .inventory-pulse__stats,
  .inventory-overview {
    display: grid;
    gap: 0.75rem;
  }

  .stat-card,
  .overview-card,
  .inventory-state,
  .inventory-card {
    border-radius: 1.1rem;
    border: 1px solid rgba(214, 190, 141, 0.14);
    background:
      linear-gradient(180deg, rgba(30, 24, 17, 0.66), rgba(13, 16, 19, 0.9)),
      radial-gradient(circle at top, rgba(214, 190, 141, 0.08), transparent 58%);
  }

  .stat-card {
    padding: 0.9rem;
    display: grid;
    gap: 0.18rem;
  }

  .stat-card strong {
    color: rgba(247, 240, 227, 0.96);
    font-size: 1rem;
  }

  .stat-card span:last-child {
    color: rgba(221, 209, 187, 0.68);
    line-height: 1.45;
  }

  .inventory-quicklinks {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }

  .quicklink {
    min-height: 3rem;
    border-radius: 999px;
    border: 1px solid rgba(214, 190, 141, 0.2);
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 0.8rem 1rem;
    text-decoration: none;
    color: rgba(244, 236, 223, 0.92);
    background: rgba(255, 255, 255, 0.04);
    font-weight: 600;
  }

  .quicklink--primary {
    background: linear-gradient(135deg, rgba(214, 190, 141, 0.2), rgba(125, 211, 252, 0.14));
  }

  .inventory-state {
    padding: 1rem;
    display: grid;
    gap: 0.35rem;
    color: rgba(240, 231, 215, 0.88);
  }

  .inventory-state--error {
    border-color: rgba(220, 83, 83, 0.24);
    background:
      linear-gradient(180deg, rgba(59, 18, 18, 0.6), rgba(20, 9, 9, 0.9)),
      radial-gradient(circle at top, rgba(248, 113, 113, 0.14), transparent 58%);
  }

  .inventory-state h3 {
    margin: 0;
    font-size: 1.02rem;
    color: rgba(249, 243, 230, 0.98);
  }

  .inventory-state p {
    margin: 0;
    line-height: 1.5;
  }

  .overview-card {
    padding: 0.95rem;
    display: grid;
    gap: 0.7rem;
  }

  .overview-card__chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .overview-chip,
  .inventory-rarity,
  .inventory-type {
    border-radius: 999px;
    padding: 0.28rem 0.62rem;
    font-size: 0.68rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }

  .overview-chip,
  .inventory-type {
    border: 1px solid rgba(214, 190, 141, 0.14);
    background: rgba(255, 255, 255, 0.04);
    color: rgba(231, 220, 198, 0.84);
  }

  .inventory-grid {
    display: grid;
    gap: 0.9rem;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  }

  .inventory-card {
    overflow: hidden;
  }

  .inventory-media {
    position: relative;
    aspect-ratio: 16 / 10;
    background: linear-gradient(135deg, rgba(23, 26, 36, 0.9), rgba(45, 31, 19, 0.8));
  }

  .inventory-media img,
  .inventory-media__placeholder {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .inventory-media img {
    object-fit: cover;
  }

  .inventory-media__placeholder {
    display: grid;
    place-items: center;
    font-family: var(--san-font-display);
    font-size: 2rem;
    color: rgba(244, 236, 223, 0.7);
  }

  .inventory-rarity {
    position: absolute;
    top: 0.65rem;
    right: 0.65rem;
    border: 1px solid rgba(214, 190, 141, 0.18);
    background: rgba(13, 15, 18, 0.78);
    color: rgba(245, 236, 222, 0.9);
  }

  .inventory-body {
    padding: 0.95rem 1rem 1rem;
    display: grid;
    gap: 0.75rem;
  }

  .inventory-body__heading {
    display: grid;
    gap: 0.65rem;
  }

  .inventory-body h3 {
    margin: 0;
    font-size: 1rem;
    color: rgba(249, 243, 230, 0.98);
  }

  .subtitle,
  .meta {
    margin: 0;
    color: rgba(220, 208, 186, 0.7);
  }

  .subtitle {
    margin-top: 0.35rem;
    font-size: 0.88rem;
    line-height: 1.45;
  }

  .meta {
    font-size: 0.76rem;
  }

  @media (min-width: 720px) {
    .inventory-pulse__stats,
    .inventory-overview {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .inventory-body__heading {
      grid-template-columns: minmax(0, 1fr) auto;
      align-items: start;
    }
  }

  @media (max-width: 639px) {
    .inventory-quicklinks {
      grid-template-columns: 1fr;
    }
  }
</style>
