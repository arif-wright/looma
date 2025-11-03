export type ShopItem = {
  id: string;
  name: string;
  price: number;
  currency: 'shards';
};

const SHOP_ITEMS: Record<string, ShopItem> = {
  'booster-small': { id: 'booster-small', name: 'Small Booster', price: 120, currency: 'shards' },
  'booster-medium': { id: 'booster-medium', name: 'Medium Booster', price: 280, currency: 'shards' },
  'booster-large': { id: 'booster-large', name: 'Large Booster', price: 520, currency: 'shards' },
  'perk-lucky': { id: 'perk-lucky', name: 'Lucky Charm', price: 360, currency: 'shards' }
};

export const getShopItem = (id: string | null | undefined): ShopItem | null => {
  if (!id) return null;
  const item = SHOP_ITEMS[id];
  return item ?? null;
};

export const listShopItems = () => Object.values(SHOP_ITEMS);
