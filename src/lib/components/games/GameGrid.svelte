<script lang="ts">
  import { games as catalog } from '$lib/data/games';
  import type { GameMeta } from '$lib/data/games';
  import GameCard from '$lib/components/games/GameCard.svelte';

  export let aspect: '16:9' | '1:1' = '16:9';
  export let items: GameMeta[] | null = null;

  $: list = items ?? catalog;
</script>

<div
  class="grid grid-cols-2 gap-4 sm:grid-cols-3 sm:gap-5 lg:grid-cols-4 2xl:grid-cols-5"
  data-testid="game-grid"
>
  {#each list as game (game.id)}
    <GameCard {game} aspect={aspect} />
  {/each}
</div>
