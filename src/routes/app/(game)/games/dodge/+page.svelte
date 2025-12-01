<script lang="ts">
  import GameShell from '$lib/games/GameShell.svelte';
  import { createDodgeSurvive } from '$lib/games/dodgeSurvive';

  const createGame = createDodgeSurvive;
</script>

<svelte:head>
  <title>Orbfield — Looma</title>
</svelte:head>

<GameShell
  title="Orbfield"
  description="Drag to dodge incoming shards. Tap space to trigger your companion's time warp."
  gameId="dodge"
  {createGame}
/>
