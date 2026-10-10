/** Screen-space layout only. World positions, art scale and game timing stay unchanged. */
export const ARPG_DESKTOP_ZOOM = 1.35;

// Conservative untrimmed shop + entrance bounds relative to spawn (14,9).
// The gate contact at (18,9) is +256,+128; its readable prompt sits +40 below.
// These conservative extents retain the released zoom and vertical fit. The
// horizontal anchor below uses actual art/source limits to reduce empty left space.
export const TOWN_FRAMING_BOUNDS = { left: -40, right: 430, top: -216, bottom: 212 } as const;
// Alpha>=32 right edge of the original entrance relative to spawn. Its large
// transparent source margin is not a visual boundary. Source bytes are pinned.
export const TOWN_VISIBLE_RIGHT = 256 + (1214 - 666) * (110 / 780);
export const TOWN_SOURCE_RIGHT = 256 + (1536 - 666) * (110 / 780);
export const TOWN_HERO_SCREEN_FRACTION = 0.26;
export const TOWN_VISIBLE_EDGE_CLEARANCE = 24;

export function arpgViewportLayout(rawWidth: number, rawHeight: number, town: boolean) {
  const width = Number.isFinite(rawWidth) && rawWidth > 0 ? rawWidth : 960;
  const height = Number.isFinite(rawHeight) && rawHeight > 0 ? rawHeight : 540;
  const compact = width < 640 || height < 360;
  if (!compact) {
    return {
      compact, width, height,
      hud: town ? { x: 24, y: 20, width: 480, height: 90 } : { x: 36, y: 32, width: 440, height: 180 },
      controls: town ? { x: 24, y: height - 92, width: 420, height: 72 } : { x: 36, y: 210, width: 360, height: 72 },
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
  // vertical framing lands between UI strips; horizontal framing is clamped below.
  let offsetX = (playfield.x + playfield.width / 2 - width / 2) / zoom - (bounds.left + bounds.right) / 2;
  if (town) {
    const heroX = width / 2 + offsetX * zoom;
    // Shift only when the hero is too close to the left edge. Clamp against
    // visible entrance pixels, the complete padded source, and a 120px prompt.
    // The source retains 2px canvas clearance so the existing renderer gate stays strict.
    const shift = Math.max(0, Math.min(width * TOWN_HERO_SCREEN_FRACTION - heroX,
      width - TOWN_VISIBLE_EDGE_CLEARANCE - (heroX + TOWN_VISIBLE_RIGHT * zoom),
      width - 2 - (heroX + TOWN_SOURCE_RIGHT * zoom),
      width - 12 - (heroX + 256 * zoom + 60)));
    offsetX += shift / zoom;
  }
  const offsetY = (playfield.y + playfield.height / 2 - height / 2) / zoom - (bounds.top + bounds.bottom) / 2;
  return { compact, width, height, hud, controls, playfield, camera: { zoom, offsetX, offsetY } };
}
