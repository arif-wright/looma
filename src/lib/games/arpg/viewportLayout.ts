/** Screen-space layout only. World positions, art scale and game timing stay unchanged. */
export const ARPG_DESKTOP_ZOOM = 1.35;

// Conservative untrimmed shop + entrance bounds relative to spawn (14,9).
// The gate contact at (18,9) is +256,+128; its readable prompt sits +40 below.
// Compact framing deliberately makes the hero smaller to keep this whole route
// clear of both UI strips. Desktop zoom and all world positions are unchanged.
export const TOWN_FRAMING_BOUNDS = { left: -40, right: 430, top: -216, bottom: 212 } as const;

export function arpgViewportLayout(rawWidth: number, rawHeight: number, town: boolean) {
  const width = Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : 960;
  const height = Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : 540;
  const compact = width < 640 || height < 360;
  if (!compact) {
    return {
      compact, width, height,
      hud: { x: 36, y: 32, width: 440, height: 180 },
      controls: { x: 36, y: 210, width: 360, height: 72 },
      playfield: { x: 0, y: 0, width, height },
      camera: { zoom: ARPG_DESKTOP_ZOOM, offsetX: 0, offsetY: 0 }
    };
  }
  const margin = 8;
  const hud = { x: margin, y: margin, width: Math.max(1, width - margin * 2), height: 44 };
  const controls = { x: margin, y: Math.max(hud.y + hud.height + margin, height - 62), width: hud.width, height: 54 };
  const playfield = {
    x: margin * 2, y: hud.y + hud.height + margin,
    width: Math.max(1, width - margin * 4),
    height: Math.max(1, controls.y - margin - (hud.y + hud.height + margin))
  };
  const bounds = town ? TOWN_FRAMING_BOUNDS : { left: -240, right: 240, top: -120, bottom: 120 };
  const zoom = Math.max(0.1, Math.min(1, playfield.width / (bounds.right - bounds.left), playfield.height / (bounds.bottom - bounds.top)));
  // Phaser follows target - offset. Shift the view, never the hero, so the
  // framed world box lands in the unobstructed space between the two UI strips.
  const offsetX = (playfield.x + playfield.width / 2 - width / 2) / zoom - (bounds.left + bounds.right) / 2;
  const offsetY = (playfield.y + playfield.height / 2 - height / 2) / zoom - (bounds.top + bounds.bottom) / 2;
  return { compact, width, height, hud, controls, playfield, camera: { zoom, offsetX, offsetY } };
}
