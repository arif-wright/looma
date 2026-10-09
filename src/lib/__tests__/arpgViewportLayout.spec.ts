import { describe, expect, it, vi } from 'vitest';
import { arpgViewportLayout, ARPG_DESKTOP_ZOOM, TOWN_FRAMING_BOUNDS } from '../games/arpg/viewportLayout';
import { TOWN_CORNER_LAYOUT } from '../games/arpg/assets/townCorner';
import { World } from '../games/arpg/ecs/components';
vi.mock('phaser', () => ({ default: { Scene: class {}, Math: { Vector2: class {}, Between: (minimum: number) => minimum } } }));
import { GameScene } from '../games/arpg/scenes/GameScene';

const project = (layout: ReturnType<typeof arpgViewportLayout>, x: number, y: number) => ({
  x: layout.width / 2 + (x + layout.camera.offsetX) * layout.camera.zoom,
  y: layout.height / 2 + (y + layout.camera.offsetY) * layout.camera.zoom
});
const within = (point: { x: number; y: number }, rect: { x: number; y: number; width: number; height: number }) => {
  expect(point.x).toBeGreaterThanOrEqual(rect.x - 0.001);
  expect(point.x).toBeLessThanOrEqual(rect.x + rect.width + 0.001);
  expect(point.y).toBeGreaterThanOrEqual(rect.y - 0.001);
  expect(point.y).toBeLessThanOrEqual(rect.y + rect.height + 0.001);
};

describe('ARPG narrow viewport geometry (no renderer)', () => {
  it.each([[280, 280], [320, 280], [374, 280], [600, 340], [390, 420], [844, 320]])(
    'fits the full hero/shop framing box between readable UI strips at %sx%s', (width, height) => {
      const layout = arpgViewportLayout(width, height, true);
      expect(layout.compact).toBe(true);
      for (const rect of [layout.hud, layout.controls]) {
        within({ x: rect.x, y: rect.y }, { x: 0, y: 0, width, height });
        within({ x: rect.x + rect.width, y: rect.y + rect.height }, { x: 0, y: 0, width, height });
      }
      expect(layout.playfield.y).toBeGreaterThan(layout.hud.y + layout.hud.height);
      expect(layout.playfield.y + layout.playfield.height).toBeLessThan(layout.controls.y);
      const bounds = TOWN_FRAMING_BOUNDS;
      for (const x of [bounds.left, bounds.right]) for (const y of [bounds.top, bounds.bottom]) {
        within(project(layout, x, y), layout.playfield);
      }
      within(project(layout, 0, 0), layout.playfield);
      expect(layout.camera.zoom).toBeGreaterThan(0);
      expect(layout.camera.zoom).toBeLessThan(ARPG_DESKTOP_ZOOM);
    }
  );

  it('contains the actual untrimmed shop placement and hero silhouette in its framing box', () => {
    const shop = TOWN_CORNER_LAYOUT;
    const size = 1254 * shop.shopScale;
    const relativeX = ((shop.shopTile.x - shop.shopTile.y) - (14 - 9)) * 64;
    const relativeY = ((shop.shopTile.x + shop.shopTile.y) - (14 + 9)) * 32;
    const x = relativeX - shop.shopOrigin.x * size, y = relativeY - shop.shopOrigin.y * size;
    expect(x).toBeGreaterThan(TOWN_FRAMING_BOUNDS.left);
    expect(x + size).toBeLessThan(TOWN_FRAMING_BOUNDS.right);
    expect(y).toBeGreaterThan(TOWN_FRAMING_BOUNDS.top);
    expect(y + size).toBeLessThan(TOWN_FRAMING_BOUNDS.bottom);
    expect(TOWN_FRAMING_BOUNDS.left).toBeLessThan(-32);
    expect(TOWN_FRAMING_BOUNDS.top).toBeLessThan(-50);
    expect(TOWN_FRAMING_BOUNDS.bottom).toBeGreaterThan(15);
  });

  it.each([true, false])('preserves the desktop layout and camera exactly (town=%s)', (town) => {
    const layout = arpgViewportLayout(1068, 600, town);
    expect(layout.compact).toBe(false);
    expect(layout.hud).toEqual({ x: 36, y: 32, width: 440, height: 180 });
    expect(layout.controls).toEqual({ x: 36, y: 210, width: 360, height: 72 });
    expect(layout.camera).toEqual({ zoom: 1.35, offsetX: 0, offsetY: 0 });
  });

  it('centers the dungeon hero in the unobstructed playfield without a town offset', () => {
    const layout = arpgViewportLayout(374, 280, false);
    expect(layout.camera.offsetX).toBe(0);
    const hero = project(layout, 0, 0);
    expect(hero.x).toBe(layout.playfield.x + layout.playfield.width / 2);
    expect(hero.y).toBe(layout.playfield.y + layout.playfield.height / 2);
  });

  it('falls back to the original desktop dimensions for invalid measurements', () => {
    expect(arpgViewportLayout(NaN, 0, true)).toEqual(arpgViewportLayout(960, 540, true));
  });
});

function uiObject() {
  const value: any = { x: 0, y: 0, width: 100, height: 100, visible: true };
  value.setPosition = vi.fn((x: number, y: number) => { value.x = x; value.y = y; return value; });
  value.setSize = vi.fn((width: number, height: number) => { value.width = width; value.height = height; return value; });
  value.setVisible = vi.fn((visible: boolean) => { value.visible = visible; return value; });
  value.setFontSize = vi.fn((size: number) => { value.fontSize = size; return value; });
  value.setText = vi.fn((text: string) => { value.text = text; return value; });
  for (const method of ['setScale', 'setWordWrapWidth', 'setMaxLines', 'setPadding', 'setAlpha', 'setTint', 'setDepth']) {
    value[method] = vi.fn(() => value);
  }
  return value;
}
function makeScene(width = 374, height = 280) {
  const s: any = new GameScene({ isCurrent: () => true, onReady: vi.fn(), onError: vi.fn(), onGameOver: vi.fn() });
  for (const name of ['uiContainer', 'controlContainer', 'hudPanel', 'controlPanel', 'instructionsText',
    'scoreText', 'hpText', 'hpBarBg', 'hpBarFill', 'areaText', 'controlStatus', 'primaryControl', 'secondaryControl', 'vignetteSprite']) {
    s[name] = uiObject();
  }
  const camera: any = { zoom: 1.35, centerOn: vi.fn(), setFollowOffset: vi.fn(), setBounds: vi.fn() };
  camera.setZoom = vi.fn((zoom: number) => { camera.zoom = zoom; });
  s.cameras = { main: camera }; s.uiCamera = { setSize: vi.fn() };
  s.scale = { width, height, gameSize: { width, height } };
  s.playerSprite = { x: 1472, y: 536 };
  s.world = new World(); s.playerId = s.world.createEntity();
  s.world.setTransform(s.playerId, { x: 1472, y: 536, rot: 0 });
  s.world.setHealth(s.playerId, { current: 140, max: 140 });
  s.world.tagPlayer(s.playerId, { score: 5600 });
  s.townMessage = 'Town is untimed. Depart when ready.';
  s.drawHpBar = vi.fn();
  return s;
}

describe('real ARPG scene applies and restores responsive layout (renderer mocked)', () => {
  it('uses compact text and screen-space strips without moving the hero or changing a session', () => {
    const s = makeScene();
    s.elapsed = 1234; s.durationLimit = 90_000; s.expeditionActive = false;
    const transform = { ...s.world.getTransform(s.playerId) };
    s.updateFixedUITransforms();
    expect(s.hudPanel.setSize).toHaveBeenLastCalledWith(358, 44);
    expect(s.controlContainer.setPosition).toHaveBeenLastCalledWith(8, 218);
    expect(s.controlPanel.setSize).toHaveBeenLastCalledWith(358, 54);
    expect(s.instructionsText.visible).toBe(false);
    expect(s.scoreText.fontSize).toBe(12); expect(s.hpText.fontSize).toBe(11);
    expect(s.scoreText.text).toBe('Lv 1 · XP 0/100 · Score 5600');
    expect(s.areaText.text).toBe('Lantern Sq. · G0/0');
    expect(s.controlStatus.text).toBe('Town · No time limit');
    expect(s.primaryControl.text).toBe('Enter ruins');
    expect(s.primaryControl.fontSize).toBe(12);
    expect(s.secondaryControl.visible).toBe(false);
    expect(s.uiContainer.setScale).toHaveBeenLastCalledWith(1);
    expect(s.hpBarSize).toEqual({ width: 52, height: 8 });
    expect(s.world.getTransform(s.playerId)).toEqual(transform);
    expect(s.playerSprite).toEqual({ x: 1472, y: 536 });
    expect([s.elapsed, s.durationLimit, s.expeditionActive]).toEqual([1234, 90_000, false]);
    expect(s.handlers.onGameOver).not.toHaveBeenCalled();
    expect(s.cameras.main.setZoom.mock.calls[0][0]).toBeCloseTo(150 / 272);
  });

  it('restores desktop positions, text, sizes, wrapping and camera after a resize', () => {
    const s = makeScene(); s.updateFixedUITransforms();
    s.scale = { width: 1068, height: 600, gameSize: { width: 1068, height: 600 } };
    s.updateFixedUITransforms();
    expect(s.hudPanel.setSize).toHaveBeenLastCalledWith(440, 180);
    expect(s.uiContainer.setPosition).toHaveBeenLastCalledWith(36, 32);
    expect(s.controlContainer.setPosition).toHaveBeenLastCalledWith(36, 210);
    expect(s.controlPanel.setSize).toHaveBeenLastCalledWith(360, 72);
    expect(s.instructionsText.visible).toBe(true);
    expect(s.scoreText.fontSize).toBe(20); expect(s.hpText.fontSize).toBe(16);
    expect(s.scoreText.text).toBe('Hero Lv 1 · XP 0/100 · Score 5600');
    expect(s.areaText.text).toBe('Lantern Square · Gold 0 carried / 0 banked');
    expect(s.controlStatus.text).toBe('Town is untimed. Depart when ready.');
    expect(s.primaryControl.fontSize).toBe(16);
    expect(s.primaryControl.setPadding).toHaveBeenLastCalledWith(10, 4);
    expect(s.primaryControl.setWordWrapWidth).toHaveBeenLastCalledWith(0);
    expect(s.primaryControl.setMaxLines).toHaveBeenLastCalledWith(0);
    expect(s.hpBarSize).toEqual({ width: 240, height: 16 });
    expect(s.cameras.main.setZoom).toHaveBeenLastCalledWith(1.35);
    expect(s.cameras.main.setFollowOffset).toHaveBeenLastCalledWith(0, 0);
    expect(s.cameras.main.centerOn).toHaveBeenLastCalledWith(1472, 536);
    expect(s.uiCamera.setSize).toHaveBeenLastCalledWith(1068, 600);
  });

  it('does not recenter or rerasterize text on every unchanged frame', () => {
    const s = makeScene(); s.updateFixedUITransforms();
    s.playerSprite.x += 20; s.updateFixedUITransforms(); s.updateFixedUITransforms();
    expect(s.cameras.main.centerOn).toHaveBeenCalledOnce();
    expect(s.scoreText.setFontSize).toHaveBeenCalledOnce();
  });

  it('invalidates the layout cache on a same-size scene reset', () => {
    const s = makeScene(); s.updateFixedUITransforms();
    s.heroFacingVec = { set: vi.fn() };
    s.resetState();
    expect(s.viewportLayoutKey).toBe('');
    s.updateFixedUITransforms();
    expect(s.cameras.main.centerOn).toHaveBeenCalledTimes(2);
    expect(s.compactHUD).toBe(true);
  });

  it('reapplies narrow framing after a same-area room rebuild resets the camera', () => {
    const s = makeScene(); s.updateFixedUITransforms();
    s.add = { image: () => uiObject() }; s.addToWorld = vi.fn();
    s.buildDungeonRoom();
    expect(s.viewportLayoutKey).toBe('');
    expect(s.cameras.main.zoom).toBe(1.35);
    s.updateFixedUITransforms();
    expect(s.cameras.main.zoom).toBeCloseTo(150 / 272);
    expect(s.cameras.main.centerOn).toHaveBeenCalledTimes(2);
  });

  it('changes framing and existing action labels when a narrow town enters the dungeon', () => {
    const s = makeScene(); s.updateFixedUITransforms();
    s.expedition.area = 1; s.runState = 'running'; s.elapsed = 1234; s.expeditionActive = true;
    s.updateFixedUITransforms();
    expect(s.cameras.main.setFollowOffset).toHaveBeenLastCalledWith(0, -8);
    expect(s.primaryControl.text).toBe('Pause'); expect(s.secondaryControl.text).toBe('Retreat');
    expect(s.secondaryControl.visible).toBe(true);
    expect(s.controlStatus.text).toBe('Exploring · 89s left');
    expect(s.expeditionActive).toBe(true); expect(s.elapsed).toBe(1234); expect(s.durationLimit).toBe(90_000);
    s.expedition.area = 0; s.updateFixedUITransforms();
    expect(s.cameras.main.setFollowOffset.mock.calls.at(-1)[0]).toBe(-145);
    expect(s.secondaryControl.visible).toBe(false);
    s.scale = { width: 1068, height: 600, gameSize: { width: 1068, height: 600 } };
    s.updateFixedUITransforms();
    expect(s.cameras.main.setFollowOffset).toHaveBeenLastCalledWith(0, 0);
    expect(s.cameras.main.zoom).toBe(1.35);
    expect(s.controlStatus.text).toBe('Town is untimed. Depart when ready.');
    expect(s.primaryControl.text).toBe('Enter ruins');
    expect(s.primaryControl.fontSize).toBe(16);
  });

  it('keeps the vignette covering the view while zooming out and restores its desktop scale', () => {
    const s = makeScene(); s.updateFixedUITransforms();
    const narrowZoom = s.cameras.main.zoom;
    expect(s.vignetteSprite.setScale.mock.calls.at(-1)[0] * narrowZoom).toBeCloseTo(3.74 * 1.3 * 1.35);
    s.scale = { width: 1068, height: 600, gameSize: { width: 1068, height: 600 } };
    s.updateFixedUITransforms();
    expect(s.vignetteSprite.setScale).toHaveBeenLastCalledWith(10.68 * 1.3);
  });
});
