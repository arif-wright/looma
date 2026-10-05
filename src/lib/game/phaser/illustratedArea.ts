import Phaser from 'phaser';
import type { WorldArea } from '../areas';
import { MOONBERRY_INTERACTION, type TraversalBlocker } from '../traversal';

const ENV = '/game/environment/v1/';
export const AREA_ART = {
  grass: `${ENV}terrain/grass-base-01.png`,
  meadow: `${ENV}terrain/grass-base-02.png`,
  path: `${ENV}terrain/dirt-path.png`,
  tree: `${ENV}props/trees/broadleaf-v2/idle/s-frame-00.png`,
  evergreen: `${ENV}props/trees/evergreen-idle-frame-00.png`,
  rock: `${ENV}props/rocks/large-rock-01.png`,
  flower: `${ENV}props/vegetation/flower-cluster-01-idle-frame-00.png`,
  tuft: `${ENV}props/vegetation/grass-tuft-01-idle-frame-00.png`,
  aether: `${ENV}props/magical/aether-plant-01-idle-frame-00.png`,
  moonberry: `${ENV}props/magical/moonberry-01-idle-frame-00.png`,
  portal: '/game/world/connected-wilds/lantern-portal.png',
  cottage: '/game/world/connected-wilds/lantern-cottage.png'
} as const;

type OwnedObject = Phaser.GameObjects.GameObject;

/** Presentation-only scenery. Authoritative circles remain the only prediction blockers. */
export class IllustratedArea {
  private readonly objects: OwnedObject[] = [];
  private readonly props: Array<{ image: Phaser.GameObjects.Image; x: number; y: number; radius: number; height: number }> = [];
  private readonly motes: Array<{ dot: Phaser.GameObjects.Arc; x: number; y: number; phase: number }> = [];
  private readonly masks: Phaser.Display.Masks.GeometryMask[] = [];
  private readonly failed = new Set<string>();
  private portalGlow: Phaser.GameObjects.Ellipse | null = null;
  readonly area: WorldArea;

  static preload(scene: Phaser.Scene) {
    for (const [id, url] of Object.entries(AREA_ART)) scene.load.image(`wilds-area-${id}`, url);
  }

  constructor(private readonly scene: Phaser.Scene, area: WorldArea) {
    this.area = area;
    const town = area.id === 'wilds-town';
    scene.cameras.main.setBackgroundColor(town ? '#354631' : '#1f4538');
    const base = this.keep(scene.add.rectangle(480, 270, 960, 540, town ? 0x4d6240 : 0x325b40).setDepth(-100));
    void base;
    if (scene.textures.exists(`wilds-area-${town ? 'meadow' : 'grass'}`)) {
      this.keep(scene.add.tileSprite(480, 270, 960, 540, `wilds-area-${town ? 'meadow' : 'grass'}`)
        .setTileScale(0.38).setTint(town ? 0xc5b47d : 0x86b58c).setDepth(-90));
    } else this.failed.add('Ground');
    this.keep(scene.add.rectangle(480, 270, 960, 540, town ? 0x634221 : 0x113c38, 0.13).setDepth(-89));
    this.path(town);

    for (const blocker of area.traversal.blockers) this.blocker(blocker);
    this.plantPockets(town);
    if (!town) {
      this.prop('moonberry', MOONBERRY_INTERACTION.x, MOONBERRY_INTERACTION.y, 94, 0.91, -1);
      this.label(MOONBERRY_INTERACTION.x, MOONBERRY_INTERACTION.y + 18, 'Moonberry patch', '#dfd6ff', 11);
    }
    this.portalGlow = this.keep(scene.add.ellipse(area.portal.x, area.portal.y - 2, 106, 36, 0xbda5ff, 0.15).setDepth(0));
    this.prop('portal', area.portal.x, area.portal.y, 143, 0.92, area.portal.y + 8);
    this.label(area.portal.x, area.portal.y + 19, `To ${area.portal.targetName}`, '#fff1ca', 12);
    this.label(area.portal.x, area.portal.y + 40, 'Approach to travel', '#d0ded5', 10);

    // Area title/status belongs to the accessible native mount; retain only the quiet map index.
    this.keep(scene.add.text(940, 517, town ? 'II · LANTERN HOLLOW' : 'I · MOONBERRY GROVE', {
      fontFamily: 'system-ui, sans-serif', fontSize: '10px', color: '#e6dbb7', letterSpacing: 2
    }).setOrigin(1, 0).setAlpha(0.8).setDepth(1401));
    if (this.failed.size) this.keep(scene.add.text(24, 83, `Some scenery is unavailable: ${[...this.failed].join(', ')}`, {
      fontFamily: 'system-ui, sans-serif', fontSize: '11px', color: '#ffe7be', backgroundColor: '#362e24', padding: { x: 8, y: 5 }
    }).setDepth(1600));
    for (let index = 0; index < 13; index++) {
      const x = (index * 173 + 63) % 910 + 25;
      const y = (index * 97 + 76) % 420 + 75;
      const dot = this.keep(scene.add.circle(x, y, index % 3 === 0 ? 1.5 : 1, town ? 0xffd181 : 0xc6ffd9, 0.7).setDepth(900));
      this.motes.push({ dot, x, y, phase: index * 0.73 });
    }
  }

  private keep<T extends OwnedObject>(object: T): T { this.objects.push(object); return object; }

  private path(town: boolean) {
    const edge = this.keep(this.scene.add.graphics().setDepth(-70));
    const points: Phaser.Types.Math.Vector2Like[] = [];
    for (let x = -40; x <= 1000; x += 40) points.push({ x, y: 270 + Math.sin(x / 130) * 13 - (town ? 62 : 47) + Math.sin(x / 37) * 4 });
    for (let x = 1000; x >= -40; x -= 40) points.push({ x, y: 270 + Math.sin(x / 130) * 13 + (town ? 62 : 47) + Math.sin(x / 41) * 5 });
    edge.fillStyle(0x6b7250, 0.5).fillPoints(points, true);
    edge.lineStyle(14, town ? 0xada274 : 0x9aa270, 0.18).strokePoints(points, true);
    const maskGraphics = this.keep(this.scene.make.graphics({ x: 0, y: 0 }));
    maskGraphics.fillStyle(0xffffff).fillPoints(points, true);
    if (town) {
      maskGraphics.fillEllipse(490, 272, 340, 200);
      for (const blocker of this.area.traversal.blockers.filter((item) => item.id.startsWith('cottage'))) {
        maskGraphics.fillRoundedRect(blocker.x - 29, blocker.y + 10, 58, 190, 23);
      }
    } else {
      maskGraphics.fillRoundedRect(765, 117, 69, 166, 32);
      maskGraphics.fillEllipse(798, 141, 120, 102);
    }
    maskGraphics.setVisible(false);
    if (this.scene.textures.exists('wilds-area-path')) {
      const mask = maskGraphics.createGeometryMask();
      this.masks.push(mask);
      this.keep(this.scene.add.tileSprite(480, 270, 960, 540, 'wilds-area-path')
        .setTileScale(0.37).setTint(town ? 0xffdea0 : 0xe4ce9e).setMask(mask).setDepth(-60));
    } else {
      maskGraphics.setVisible(true).setDepth(-60).setAlpha(0.3);
      this.failed.add('Path');
    }
    // Inset stones are explicitly ground marks, never colliders or raised obstacles.
    const stones = this.keep(this.scene.add.graphics().setDepth(-55));
    for (let index = 0; index < 32; index++) {
      const x = (index * 97 + 39) % 960;
      const y = 247 + ((index * 31) % 53) + Math.sin(x / 130) * 13;
      stones.fillStyle(index % 3 ? 0xbca781 : 0x7b7862, 0.33);
      stones.fillEllipse(x, y, 6 + index % 7, 3 + index % 3);
    }
  }

  private blocker(blocker: TraversalBlocker) {
    const cottage = blocker.id.startsWith('cottage');
    const moonberry = blocker.id.includes('moonberry');
    this.keep(this.scene.add.ellipse(blocker.x, blocker.y, blocker.radius * 2.1, blocker.radius * 1.32, 0x102b25, 0.31).setDepth(blocker.y));
    if (moonberry) return; // The harvest plant itself communicates this small footprint.
    const art = cottage ? 'cottage' : blocker.kind === 'rock' ? 'rock' : blocker.id.includes('northwest') ? 'evergreen' : 'tree';
    const height = cottage ? blocker.radius * 3.35 : blocker.kind === 'tree' ? 145 : blocker.radius * 2.85;
    const image = this.prop(art, blocker.x, blocker.y + (cottage ? blocker.radius * 0.23 : 3), height,
      cottage ? 0.87 : blocker.kind === 'tree' ? 0.8 : 0.87, blocker.y + 10);
    if (image) this.props.push({ image, x: blocker.x, y: blocker.y, radius: blocker.radius, height });
  }

  private prop(art: keyof typeof AREA_ART, x: number, y: number, height: number, anchor: number, depth: number) {
    const key = `wilds-area-${art}`;
    if (!this.scene.textures.exists(key)) {
      this.failed.add(art);
      this.keep(this.scene.add.circle(x, y, art === 'portal' ? 25 : 18, art === 'portal' ? 0xa991df : 0x586b55, 0.7).setStrokeStyle(2, 0xe6d8b3).setDepth(depth));
      this.label(x, y - 24, `${art} · art unavailable`, '#ffe0b7', 10);
      return null;
    }
    const image = this.scene.add.image(x, y, key);
    image.setDisplaySize(height * image.width / image.height, height).setOrigin(0.5, anchor).setDepth(depth);
    return this.keep(image);
  }

  private plantPockets(town: boolean) {
    for (let index = 0; index < 53; index++) {
      const x = 28 + ((index * 173 + (town ? 79 : 17)) % 910);
      const y = 89 + ((index * 97 + 37) % 427);
      const pathDistance = Math.abs(y - (270 + Math.sin(x / 130) * 13));
      if (pathDistance < (town ? 95 : 74)) continue;
      if (this.area.traversal.blockers.some((blocker) => Math.hypot(x - blocker.x, y - blocker.y) < blocker.radius + 32)) continue;
      if (Math.hypot(x - this.area.portal.x, y - this.area.portal.y) < 90) continue;
      if (!town && Math.hypot(x - MOONBERRY_INTERACTION.x, y - MOONBERRY_INTERACTION.y) < 80) continue;
      const art = index % 9 === 0 ? 'aether' : index % 3 === 0 ? 'flower' : 'tuft';
      this.prop(art, x, y, art === 'aether' ? 49 : 25 + index % 16, 0.92, y - 5);
    }
  }

  private label(x: number, y: number, text: string, color: string, size: number) {
    this.keep(this.scene.add.text(x, y, text, { fontFamily: 'system-ui, sans-serif', fontSize: `${size}px`, color,
      stroke: '#14302d', strokeThickness: 4, align: 'center' }).setOrigin(0.5, 0).setDepth(1450));
  }

  update(time: number, player: { x: number; y: number }, reducedMotion: boolean) {
    for (const prop of this.props) {
      const behind = Math.abs(player.x - prop.x) < prop.radius + 32 && player.y < prop.y + 2 && player.y > prop.y - prop.height * 0.65;
      prop.image.setAlpha(behind ? 0.46 : 1);
    }
    this.portalGlow?.setAlpha(reducedMotion ? 0.16 : 0.14 + Math.sin(time / 1500) * 0.04);
    for (const mote of this.motes) {
      mote.dot.setVisible(!reducedMotion);
      if (!reducedMotion) mote.dot.setPosition(mote.x + Math.sin(time / 4500 + mote.phase) * 8, mote.y + Math.sin(time / 2900 + mote.phase) * 5)
        .setAlpha(0.28 + (Math.sin(time / 1900 + mote.phase) + 1) * 0.22);
    }
  }

  destroy() {
    for (const object of this.objects) object.destroy();
    for (const mask of this.masks) mask.destroy();
  }
}
