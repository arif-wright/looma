<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import ShopCard from './ShopCard.svelte';

  export let items: any[] = [];

  const dispatch = createEventDispatcher<{ open: { item: any } }>();
</script>

<div class="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 2xl:grid-cols-5">
  {#each items as item}
    <ShopCard {item} on:open={(event) => dispatch('open', event.detail)} />
  {/each}
</div>
