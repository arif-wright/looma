export const SANCTUARY_SLOTS = [
  'left_grove',
  'center_glade',
  'right_grove',
  'near_left',
  'near_right'
] as const;

export type SanctuarySlot = (typeof SANCTUARY_SLOTS)[number];
export type SanctuaryTone = 'care' | 'memory' | 'play' | 'wonder' | 'bond' | 'social' | 'mission';

export type SanctuaryDecor = {
  id: string;
  slug?: string;
  title: string;
  description: string;
  tone: SanctuaryTone;
  visual_key: string;
};

export const isSanctuarySlot = (value: unknown): value is SanctuarySlot =>
  typeof value === 'string' && SANCTUARY_SLOTS.includes(value as SanctuarySlot);

export const buildSanctuaryReaction = (companionName: string, decor: Pick<SanctuaryDecor, 'title' | 'tone'>) => {
  const name = companionName.trim() || 'Your companion';
  const reactions: Record<SanctuaryTone, string> = {
    care: `${name} settles near the ${decor.title}. The sanctuary feels easier to return to.`,
    memory: `${name} studies the ${decor.title}, as if it is holding onto something you shared.`,
    play: `${name} circles the ${decor.title} with a sudden burst of bright energy.`,
    wonder: `${name} pauses beside the ${decor.title}, completely absorbed in its strange light.`,
    bond: `${name} rests near the ${decor.title}. It already feels like something that belongs to both of you.`,
    social: `${name} follows the movement of the ${decor.title}, remembering the connections that shaped it.`,
    mission: `${name} studies the ${decor.title}, ready for the next path you choose together.`
  };
  return reactions[decor.tone];
};

export const buildSharedRestReaction = (companionName: string, energyBefore: number, energyAfter: number) => {
  const name = companionName.trim() || 'Your companion';
  const restored = Math.max(0, Math.round(energyAfter) - Math.round(energyBefore));
  if (energyBefore <= 20) {
    return `${name} curls into the Moss Seat beside you. After a quiet while, their breathing steadies and ${restored} spark returns.`;
  }
  if (energyBefore <= 55) {
    return `${name} settles into the Moss Seat with you. The sanctuary grows still, and ${restored} spark returns.`;
  }
  return `${name} rests beside you on the Moss Seat. Nothing was urgent; the quiet itself became the memory.`;
};
