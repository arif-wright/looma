<script lang="ts">
  import GameWrapper from '$lib/components/games/GameWrapper.svelte';
  import NeonRun from '$lib/components/games/NeonRun.svelte';
  import type { LoomaGameResult } from '$lib/games/types';

  let wrapper: InstanceType<typeof GameWrapper> | null = null;
  let neonRun: InstanceType<typeof NeonRun> | null = null;

  const GAME_ID = 'runner';

  const handleGameOver = (event: CustomEvent<LoomaGameResult>) => {
    if (!event.detail) return;
    wrapper?.reportSessionResult({ ...event.detail, success: true });
  };

  const handleRestart = () => {
    neonRun?.restart();
  };
</script>

<GameWrapper bind:this={wrapper} gameId={GAME_ID} on:restart={handleRestart}>
  <NeonRun bind:this={neonRun} on:gameOver={handleGameOver} />
</GameWrapper>
