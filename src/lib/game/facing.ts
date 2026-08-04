export type FacingDirection = 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

export const FACING_DIRECTIONS: readonly FacingDirection[] = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
export const FACING_LABELS: Record<FacingDirection, string> = {
  n: 'N', ne: 'NE', e: 'E', se: 'SE', s: 'S', sw: 'SW', w: 'W', nw: 'NW'
};

export const classifyFacing = (worldX: number, worldZ: number, fallback: FacingDirection = 's', threshold = 0.001) => {
  if (!Number.isFinite(worldX) || !Number.isFinite(worldZ) || Math.hypot(worldX, worldZ) < threshold) return fallback;
  const clockwiseFromNorth = Math.atan2(worldX, -worldZ);
  const index = (Math.round(clockwiseFromNorth / (Math.PI / 4)) + 8) % 8;
  return FACING_DIRECTIONS[index];
};

export class FacingState {
  value: FacingDirection;
  constructor(initial: FacingDirection = 's') { this.value = initial; }
  update(worldX: number, worldZ: number, threshold = 0.001) {
    this.value = classifyFacing(worldX, worldZ, this.value, threshold);
    return this.value;
  }
}
