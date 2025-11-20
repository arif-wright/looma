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
  description="Jump over glitch shards while your companion shields you. Short, sharp runs that feed your Looma streaks."
  gameId="runner"
  {createGame}
/>
