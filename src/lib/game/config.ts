export const WORLD_WIDTH = 960;
export const WORLD_HEIGHT = 540;
export const PLAYER_SPEED = 220;

export type WorldViewport = {
  width: number;
  height: number;
};

export const fitWorldViewport = (
  availableWidth: number,
  availableHeight: number,
  logicalWidth = WORLD_WIDTH,
  logicalHeight = WORLD_HEIGHT
): WorldViewport => {
  if (
    !Number.isFinite(availableWidth) ||
    !Number.isFinite(availableHeight) ||
    availableWidth <= 0 ||
    availableHeight <= 0 ||
    logicalWidth <= 0 ||
    logicalHeight <= 0
  ) {
    return { width: 0, height: 0 };
  }

  const scale = Math.min(availableWidth / logicalWidth, availableHeight / logicalHeight);
  return {
    width: Math.max(1, Math.floor(logicalWidth * scale)),
    height: Math.max(1, Math.floor(logicalHeight * scale))
  };
};

export const normalizeMovement = (x: number, y: number) => {
  const safeX = Number.isFinite(x) ? Math.max(-1, Math.min(1, x)) : 0;
  const safeY = Number.isFinite(y) ? Math.max(-1, Math.min(1, y)) : 0;
  const magnitude = Math.hypot(safeX, safeY);
  if (magnitude <= 1 || magnitude === 0) return { x: safeX, y: safeY };
  return { x: safeX / magnitude, y: safeY / magnitude };
};
