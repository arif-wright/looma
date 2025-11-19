<script lang="ts">
  import GameShell from '$lib/games/GameShell.svelte';
  import { createEndlessRunner } from '$lib/games/endlessRunner';

  const createGame = createEndlessRunner;
</script>

<svelte:head>
  <title>Neon Run — Looma</title>
</svelte:head>

<GameShell
  title="Neon Run"
  description="Jump over glitch shards, let your companion shield you once per run, and push for a high score."
  gameId="runner"
  {createGame}
/>
