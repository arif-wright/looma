export type TodayCardInputs = {
  rewardPending: boolean;
  mission?: { id: string | null; name?: string | null; summary?: string | null; difficulty?: string | null } | null;
  failMissionId?: string | null;
  failMissionName?: string | null;
  creatureName?: string | null;
};

export type TodayCardComputed = {
  ctaState: 'reward' | 'retry' | 'resume' | 'quick';
  label: string;
  secondary: string;
  missionId: string | null;
  disabled: boolean;
};

export function computeTodayCardState(input: TodayCardInputs): TodayCardComputed {
  const rewardPending = input.rewardPending;
  const failMissionId = input.failMissionId ?? null;
  const mission = input.mission ?? null;
  const missionName = mission?.name ?? null;
  const failName = input.failMissionName ?? 'your last run';
  const creatureName = input.creatureName ?? 'your companion';

  const ctaState: TodayCardComputed['ctaState'] = rewardPending
    ? 'reward'
    : failMissionId
    ? 'retry'
    : mission?.id
    ? 'resume'
    : 'quick';

  let label: string;
  switch (ctaState) {
    case 'reward':
      label = 'Claim Bond Bonus';
      break;
    case 'retry':
      label = 'Retry Mission with Boosts';
      break;
    case 'resume':
      label = `Resume ${missionName ?? 'Mission'}`;
      break;
    default:
      label = 'Start Quick Mission';
  }

  let secondary: string;
  switch (ctaState) {
    case 'reward':
      secondary = 'Rewards boost your creature bond.';
      break;
    case 'retry':
      secondary = `Shake off ${failName} and go again.`;
      break;
    case 'resume':
      secondary = mission?.summary ?? `Pick up ${missionName ?? 'your mission'}`;
      break;
    default:
      secondary = `Visit ${creatureName}`;
  }

  const missionId =
    ctaState === 'resume' ? mission?.id ?? null : ctaState === 'retry' ? failMissionId : null;
  const disabled = ctaState !== 'quick' && ctaState !== 'reward' && !missionId;

  return {
    ctaState,
    label,
    secondary,
    missionId,
    disabled
  };
}
