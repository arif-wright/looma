import type { FacingDirection } from './facing';

export type VisualMovementState = 'idle' | 'moving';
export type VisualConnectionState = 'connected' | 'reconnecting';

export type PlayerVisualState = {
  entityId: string;
  worldPosition: { x: number; z: number };
  previousWorldPosition: { x: number; z: number };
  renderPosition: { x: number; z: number };
  facing: FacingDirection;
  movementState: VisualMovementState;
  movementMagnitude: number;
  local: boolean;
  displayName: string;
  handle: string;
  companionOwnerEntityId: string | null;
  connectionState: VisualConnectionState;
};

export const movementState = (x: number, z: number, threshold = 0.01) => {
  const movementMagnitude = Math.hypot(x, z);
  return { movementMagnitude, movementState: movementMagnitude >= threshold ? 'moving' : 'idle' } as const;
};
