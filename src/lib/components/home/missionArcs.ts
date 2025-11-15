export type MissionArcStatus = 'locked' | 'available' | 'in_progress' | 'completed';

export type MissionArc = {
  id: string;
  title: string;
  body: string;
  ctaLabel: string;
  href: string;
  status: MissionArcStatus;
  repeatable?: boolean;
};

export type MissionArcContext = {
  bondGenesisEnabled: boolean;
  companionCount: number | null | undefined;
};

const arcPriority: Record<MissionArcStatus, number> = {
  in_progress: 3,
  available: 2,
  completed: 1,
  locked: 0
};

export const buildMissionArcs = (ctx: MissionArcContext): MissionArc[] => {
  const { bondGenesisEnabled, companionCount } = ctx;
  const totalCompanions = typeof companionCount === 'number' ? companionCount : 0;
  const hasCompanion = totalCompanions > 0;

  let bondStatus: MissionArcStatus = 'locked';
  if (hasCompanion) {
    bondStatus = 'completed';
  } else if (bondGenesisEnabled) {
    bondStatus = 'available';
  }

  return [
    {
      id: 'bond_genesis',
      title: 'Find your first bond',
      body: 'Take a one-minute vibe quiz and spawn a companion tuned to you.',
      ctaLabel: 'Begin quiz',
      href: '/app/onboarding/companion',
      status: bondStatus,
      repeatable: false
    }
  ];
};

export const selectMissionArc = (arcs: MissionArc[]): MissionArc | null => {
  const candidates = arcs.filter((arc) => arc.status !== 'completed' || arc.repeatable);
  candidates.sort((a, b) => arcPriority[b.status] - arcPriority[a.status]);
  return candidates[0] ?? null;
};
