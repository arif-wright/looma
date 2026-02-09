export type Category = 'all' | 'cosmetic' | 'boost' | 'bundle' | 'token' | 'other';
export type Rarity = 'all' | 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic';
export type SortKey = 'newest' | 'priceAsc' | 'priceDesc' | 'rarity';

export type FilterState = {
  category: Category;
  rarity: Rarity;
  sortKey: SortKey;
};
