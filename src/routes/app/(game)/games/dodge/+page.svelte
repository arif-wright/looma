<script lang="ts">
  import GameShell from '$lib/games/GameShell.svelte';
  import { createDodgeSurvive } from '$lib/games/dodgeSurvive';

  const createGame = createDodgeSurvive;
</script>

<svelte:head>
  <title>Orbfield — Memvoya</title>
</svelte:head>

<GameShell
  title="Orbfield"
  description="Dodge together for one minute. Drag or use arrow keys to move; use Time warp for a little breathing room."
  gameId="dodge"
  {createGame}
/>
