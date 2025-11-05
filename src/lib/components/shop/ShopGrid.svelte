<script lang="ts">
  import ShopCard from './ShopCard.svelte';
  export let items: any[] = [];
</script>

<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 2xl:grid-cols-5">
  {#each items as item}
    <ShopCard {item} />
  {/each}
</div>
