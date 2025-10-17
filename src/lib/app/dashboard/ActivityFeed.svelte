<script lang="ts">
  import PanelFrame from '$lib/app/components/PanelFrame.svelte';
</script>

<PanelFrame title="Activity Feed" loading={false}>
  <div class="placeholder-text">Placeholder content</div>
  <svelte:fragment slot="skeleton">
    <div class="h-20 w-full animate-pulse rounded-lg" />
  </svelte:fragment>
</PanelFrame>

<style>
  .placeholder-text {
    font-size: 0.92rem;
    color: rgba(233, 195, 255, 0.78);
  }
</style>
