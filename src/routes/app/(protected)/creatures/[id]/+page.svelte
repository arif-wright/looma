<script lang="ts">
  export let data: any;
  import CompanionDetailModal from '$lib/app/companions/CompanionDetailModal.svelte';
  let open = true;
</script>

<div class="container py-6">
  <CompanionDetailModal {open} creature={data.creature} on:close={() => history.back()} />
</div>
