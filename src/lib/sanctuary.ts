export const SANCTUARY_SLOTS = [
  'left_grove',
  'center_glade',
  'right_grove',
  'near_left',
  'near_right'
] as const;

export type SanctuarySlot = (typeof SANCTUARY_SLOTS)[number];
export type SanctuaryTone = 'care' | 'memory' | 'play' | 'wonder' | 'bond';

export type SanctuaryDecor = {
  id: string;
  slug: string;
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
    bond: `${name} rests near the ${decor.title}. It already feels like something that belongs to both of you.`
  };
  return reactions[decor.tone];
};
