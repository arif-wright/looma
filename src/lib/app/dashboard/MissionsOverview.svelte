<script lang="ts">
  import PanelFrame from '$lib/app/components/PanelFrame.svelte';
</script>

<PanelFrame title="Missions Overview" loading={false}>
  <div class="placeholder-text">Placeholder content</div>
  <svelte:fragment slot="skeleton">
    <div class="skeleton">
      <div class="skeleton-row"></div>
      <div class="skeleton-row"></div>
      <div class="skeleton-row"></div>
    </div>
  </svelte:fragment>
</PanelFrame>

<style>
  .placeholder-text {
    font-size: 0.92rem;
    color: rgba(233, 195, 255, 0.78);
  }

  .skeleton {
    display: grid;
    gap: 0.75rem;
  }

  .skeleton-row {
    height: 1.5rem;
    border-radius: 0.75rem;
    background: rgba(255, 255, 255, 0.08);
  }
</style>
