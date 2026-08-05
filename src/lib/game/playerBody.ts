export const PLAYER_BODIES = ['male', 'female'] as const;

export type PlayerBody = (typeof PLAYER_BODIES)[number];

export const DEFAULT_PLAYER_BODY: PlayerBody = 'male';

export const isPlayerBody = (value: unknown): value is PlayerBody =>
  typeof value === 'string' && PLAYER_BODIES.includes(value as PlayerBody);

export const normalizePlayerBody = (value: unknown): PlayerBody =>
  isPlayerBody(value) ? value : DEFAULT_PLAYER_BODY;

export const playerBodyManifestUrl = (value: unknown) =>
  `/game/sprites/players/${normalizePlayerBody(value)}/player.atlas.json`;
