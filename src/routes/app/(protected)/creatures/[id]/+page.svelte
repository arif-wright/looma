<script lang="ts">
  export let data: any;
  import CreatureDetailModal from '$lib/app/creatures/CreatureDetailModal.svelte';
  let open = true;
</script>

<div class="container py-6">
  <CreatureDetailModal {open} creature={data.creature} on:close={() => history.back()} />
</div>
