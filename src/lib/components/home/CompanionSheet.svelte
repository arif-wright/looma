<script lang="ts">
  import BottomSheet from '$lib/components/ui/BottomSheet.svelte';

  export let open = false;
  export let companionId: string | null = null;
  export let name: string | null = null;
  export let status = 'Steady';
  export let bondTier = 'Tier 1';
  export let evolutionTag = 'Base form';
  export let imageUrl: string | null = null;
  export let energy = 0;
  export let eraTitle: string | null = null;
  export let eraBody: string | null = null;
  export let eraTone: 'care' | 'social' | 'mission' | 'play' | 'bond' | 'quiet' = 'quiet';
  export let onClose: () => void = () => {};
</script>

<BottomSheet {open} title="Companion" {onClose}>
  <section class="sheet">
    <div class="head">
      <img src={imageUrl ?? '/avatar.svg'} alt="" />
      <div>
        <h3>{name ?? 'Companion'}</h3>
        <p class="status">{status}</p>
      </div>
    </div>
    <div class="tags">
      <span>{bondTier}</span>
      <span>{evolutionTag}</span>
    </div>

    <div class="stats">
      <div><span>Link</span><strong>{status}</strong></div>
      <div><span>Energy</span><strong>{Math.round(energy)}</strong></div>
    </div>

    {#if eraTitle}
      <div class={`era era--${eraTone}`}>
        <span class="era__label">Current era</span>
        <strong>{eraTitle}</strong>
        {#if eraBody}
          <p>{eraBody}</p>
        {/if}
      </div>
    {/if}

    <div class="actions">
      <a class="cta cta--ghost" href={companionId ? `/app/memory?companion=${encodeURIComponent(companionId)}` : '/app/memory'}>Open journal</a>
      <a class="cta" href="/app/companions">Visit companion</a>
    </div>
  </section>
</BottomSheet>

<style>
  .sheet {
    display: grid;
    gap: 0.7rem;
  }

  .head {
    display: flex;
    align-items: center;
    gap: 0.6rem;
  }

  .head img {
    width: 2.7rem;
    height: 2.7rem;
    border-radius: 999px;
    object-fit: cover;
    border: 1px solid rgba(125, 211, 252, 0.42);
    background: rgba(15, 23, 42, 0.82);
  }

  h3 {
    margin: 0;
    font-size: 1.12rem;
    color: rgba(248, 250, 252, 0.98);
  }

  .status {
    margin: 0;
    color: rgba(186, 230, 253, 0.92);
    font-size: 0.82rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .tags {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  .tags span {
    border-radius: 999px;
    border: 1px solid rgba(148, 163, 184, 0.24);
    background: rgba(15, 23, 42, 0.52);
    color: rgba(186, 230, 253, 0.92);
    font-size: 0.68rem;
    letter-spacing: 0.05em;
    text-transform: uppercase;
    padding: 0.22rem 0.5rem;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.42rem;
  }

  .stats div {
    border-radius: 0.72rem;
    border: 1px solid rgba(148, 163, 184, 0.22);
    background: rgba(15, 23, 42, 0.64);
    padding: 0.45rem;
    display: grid;
    gap: 0.2rem;
  }

  .stats span {
    color: rgba(148, 163, 184, 0.95);
    font-size: 0.7rem;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .stats strong {
    color: rgba(240, 249, 255, 0.96);
    font-size: 1rem;
  }

  .era {
    border-radius: 0.85rem;
    border: 1px solid rgba(148, 163, 184, 0.22);
    background: rgba(15, 23, 42, 0.58);
    padding: 0.72rem 0.78rem;
    display: grid;
    gap: 0.18rem;
  }

  .era__label {
    color: rgba(186, 230, 253, 0.74);
    font-size: 0.66rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
  }

  .era strong {
    color: rgba(248, 250, 252, 0.97);
    font-size: 0.9rem;
    line-height: 1.3;
  }

  .era p {
    margin: 0;
    color: rgba(226, 232, 240, 0.86);
    line-height: 1.45;
    font-size: 0.82rem;
  }

  .era--care {
    border-color: rgba(132, 214, 179, 0.24);
    background: rgba(21, 41, 36, 0.46);
  }

  .era--social {
    border-color: rgba(233, 162, 122, 0.24);
    background: rgba(45, 27, 24, 0.46);
  }

  .era--mission {
    border-color: rgba(222, 186, 103, 0.24);
    background: rgba(43, 33, 20, 0.46);
  }

  .era--play {
    border-color: rgba(124, 220, 224, 0.24);
    background: rgba(20, 36, 45, 0.46);
  }

  .era--bond {
    border-color: rgba(214, 190, 141, 0.24);
    background: rgba(35, 29, 22, 0.46);
  }

  .era--quiet {
    border-color: rgba(148, 163, 184, 0.22);
    background: rgba(15, 23, 42, 0.58);
  }

  .actions {
    display: grid;
    gap: 0.55rem;
  }

  .cta {
    min-height: 2.7rem;
    border-radius: 0.8rem;
    display: inline-grid;
    place-items: center;
    text-decoration: none;
    font-weight: 700;
    color: rgba(7, 17, 36, 0.95);
    background: linear-gradient(135deg, rgba(45, 212, 191, 0.95), rgba(56, 189, 248, 0.95));
  }

  .cta--ghost {
    color: rgba(226, 232, 240, 0.96);
    border: 1px solid rgba(148, 163, 184, 0.24);
    background: rgba(15, 23, 42, 0.64);
  }
</style>
