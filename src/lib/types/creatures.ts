export type Rarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export type Species = {
  id: string;
  name: string;
  rarity: Rarity;
  created_at: string;
};

export type Creature = {
  id: string;
  owner_id: string;
  species_id: string;
  nickname: string | null;
  bond_level: number;
  created_at: string;
};

export type CreatureView = Creature & {
  species_name: string;
  species_rarity: Rarity;
};
