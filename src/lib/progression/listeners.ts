import { addBondEvent, addCompanionXP } from '$lib/companions/state';
import { subscribe } from '$lib/gameEvents';
import { sendGameEvent } from '$lib/games/sdk';
import { updateDailyChallenge, updateWeeklyChallenge } from '$lib/progression/challenges';
import { updateMissionProgress } from '$lib/progression/missions';

const unsubscribeNeonRun = subscribe('neonrun.completed', (result: any) => {
  void handleNeonRunCompleted(result);
});

const sumPowerups = (powerups?: Record<string, number>): number => {
  if (!powerups) return 0;
  return Object.values(powerups).reduce((sum, value) => (Number.isFinite(value) ? sum + (value as number) : sum), 0);
};

const handleNeonRunCompleted = async (result: any) => {
  if (!result) return;
  const score = typeof result.score === 'number' ? result.score : 0;
  const shards = typeof result.rewards?.shards === 'number' ? result.rewards.shards : 0;
  const powerupCount = sumPowerups(result.rewards?.powerupsUsed);

  updateDailyChallenge('neonrun_play', 1);
  updateDailyChallenge('neonrun_shards', shards);
  updateDailyChallenge('neonrun_powerups', powerupCount);
  updateWeeklyChallenge('neonrun_score', score);

  updateMissionProgress('minigames_played', 1);
  updateMissionProgress('shards_earned', shards);
  updateMissionProgress('neonrun_score', score);

  const companionXpGain = Math.round(score * 0.2);
  if (companionXpGain > 0) addCompanionXP(companionXpGain);
  addBondEvent('played_minigame', { score });

  sendGameEvent('neonrun.complete', {
    score,
    shards,
    powerups: result.rewards?.powerupsUsed ?? {}
  });
};

export const teardownProgressionListeners = () => {
  unsubscribeNeonRun();
};

// Re-export emitGameEvent to avoid unused import lint errors when consumers only need subscribe via this module.
