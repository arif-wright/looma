<script lang="ts">
  import BottomSheet from '$lib/components/ui/BottomSheet.svelte';

  export let open = false;
  export let name: string | null = null;
  export let status = 'Steady';
  export let energy = 0;
  export let affection = 0;
  export let trust = 0;
  export let onClose: () => void = () => {};
</script>

<BottomSheet {open} title="Companion" {onClose}>
  <section class="sheet">
    <h3>{name ?? 'Companion'}</h3>
    <p class="status">{status}</p>

    <div class="stats">
      <div><span>Energy</span><strong>{Math.round(energy)}</strong></div>
      <div><span>Affection</span><strong>{Math.round(affection)}</strong></div>
      <div><span>Trust</span><strong>{Math.round(trust)}</strong></div>
    </div>

    <a class="cta" href="/app/companions">Visit companion</a>
  </section>
</BottomSheet>

<style>
  .sheet {
    display: grid;
    gap: 0.7rem;
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

  .stats {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
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
