export type WorldRenderer = 'phaser' | 'three';

export const selectWorldRenderer = (value: string | null | undefined): WorldRenderer =>
  value?.trim().toLowerCase() === 'three' ? 'three' : 'phaser';
