import { isOwnedItemId } from '$lib/items/story';

export type MoonberryUseRequest = {
  action: 'share_moonberry'; userItemId: string; companionId: string; requestId: string;
};
export const isMoonberryUseRequest = (value: unknown): value is MoonberryUseRequest => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return Object.keys(row).length === 4 && row.action === 'share_moonberry' &&
    isOwnedItemId(row.userItemId) && isOwnedItemId(row.companionId) && isOwnedItemId(row.requestId);
};

export const canShareMoonberry = (owned: {
  quantity: number; source_type: string; source_key?: string | null;
  item: { item_key: string; kind?: string; capabilities: string[] } | null | undefined;
}) => owned.item?.item_key === 'world-moonberry' && owned.item.kind === 'consumable' &&
  owned.source_type === 'world' && owned.source_key === 'moonberry-bush' &&
  Number.isInteger(owned.quantity) && owned.quantity > 0 &&
  owned.item.capabilities.includes('consumable') && owned.item.capabilities.includes('giftable') &&
  !owned.item.capabilities.includes('placeable');
