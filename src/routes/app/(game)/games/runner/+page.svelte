<script lang="ts">
  import GameWrapper from '$lib/components/games/GameWrapper.svelte';
  import NeonRun from '$lib/components/games/NeonRun.svelte';
  import type { GameSessionResult } from '$lib/games/sdk';

  let wrapper: InstanceType<typeof GameWrapper> | null = null;
  let neonRun: InstanceType<typeof NeonRun> | null = null;
  let ready = false;

  const GAME_ID = 'runner';

  const handleGameOver = (event: CustomEvent<GameSessionResult>) => {
    if (!event.detail) return;
    wrapper?.reportSessionResult(event.detail);
  };

  const handleRestart = () => {
    neonRun?.reset();
  };
</script>

<GameWrapper bind:this={wrapper} bind:ready={ready} gameId={GAME_ID} on:restart={handleRestart}>
  <NeonRun bind:this={neonRun} {ready} on:gameOver={handleGameOver} />
</GameWrapper>
