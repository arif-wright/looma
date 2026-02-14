<script lang="ts">
  import BottomSheet from '$lib/components/ui/BottomSheet.svelte';

  export let open = false;
  export let name: string | null = null;
  export let status = 'Steady';
  export let bondTier = 'Tier 1';
  export let evolutionTag = 'Base form';
  export let imageUrl: string | null = null;
  export let energy = 0;
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

    <a class="cta" href="/app/companions">Visit companion</a>
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
</style>
