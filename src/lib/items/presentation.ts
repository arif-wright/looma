export type ItemProvenance = Record<string, unknown> | null | undefined;

const textValue = (value: unknown) => (typeof value === 'string' && value.trim() ? value.trim() : null);

export const itemSourceLabel = (sourceType: string, tone?: string | null) => {
  if (sourceType === 'care_milestone') return 'Earned through shared care';

  if (sourceType === 'chapter_reward') {
    if (tone === 'care') return 'Formed during a care chapter';
    if (tone === 'mission') return 'Formed during a mission chapter';
    if (tone === 'play') return 'Formed during a playful chapter';
    if (tone === 'social') return 'Formed through shared connection';
    if (tone === 'bond') return 'Formed as your bond deepened';
    return 'Formed during a companion chapter';
  }

  return sourceType.replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
};

export const itemSourceDetail = (provenance: ItemProvenance) =>
  textValue(provenance?.reason) ?? textValue(provenance?.body) ?? textValue(provenance?.title);

export const capabilityLabel = (capability: string) => {
  if (capability === 'placeable') return 'Sanctuary object';
  if (capability === 'interactive') return 'Shared interaction';
  if (capability === 'keepsake') return 'Relationship keepsake';
  if (capability === 'giftable') return 'Can be gifted';
  if (capability === 'wearable') return 'Can be worn';
  if (capability === 'consumable') return 'Can be used';
  return capability.replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
};

export const sanctuarySlotLabel = (slot: string) =>
  slot.replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
