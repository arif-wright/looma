import Phaser from 'phaser';
import { classifyFacing, type FacingDirection } from '../facing';
import { parseSpriteAssetContract, sequenceFor, type SpriteAssetContract } from '../sprites/assetContract';
import { selectCompanionSpriteAsset } from '../sprites/companionAsset';
import { SPRITE_CACHE_TARGET_BYTES, spritePageEvictions } from './spriteCache';

export const CHARACTER_MANIFESTS = {
  male: '/game/sprites/players/male/player.atlas.json',
  female: '/game/sprites/players/female/player.atlas.json',
  muse: '/game/sprites/companions/muse/muse.atlas.json',
  echo: '/game/sprites/companions/echo/echo.atlas.json'
} as const;
export type CharacterArt = keyof typeof CHARACTER_MANIFESTS | 'unknown';

export const companionArt = (kind: string): CharacterArt => {
  const selection = selectCompanionSpriteAsset(kind);
  return selection.archetype === 'muse' || selection.archetype === 'echo' ? selection.archetype : 'unknown';
};

/** Pages load on demand. All authored frames and explicit direction mappings are preserved. */
export class ProductionSpriteBank {
  private readonly assets = new Map<CharacterArt, SpriteAssetContract>();
  private readonly queued = new Set<string>();
  private readonly failed = new Set<string>();
  private readonly touched = new Map<string, number>();
  private readonly pageBytes = new Map<string, number>();
  private readonly activePages = new Set<string>();
  readonly metrics = { loadedPages: 0, estimatedDecodedBytes: 0, protectedDecodedBytes: 0, targetBytes: SPRITE_CACHE_TARGET_BYTES };
  private readonly completeHandler = (key: string) => { this.queued.delete(key); };
  private readonly errorHandler = (file: Phaser.Loader.File) => {
    this.queued.delete(file.key);
    this.failed.add(file.key);
  };

  static preload(scene: Phaser.Scene) {
    for (const [id, url] of Object.entries(CHARACTER_MANIFESTS)) scene.load.json(`character-manifest-${id}`, url);
    scene.load.svg('wilds-player-fallback', '/game/world/player-placeholder.svg');
    scene.load.svg('wilds-companion-fallback', '/game/world/companion-placeholder.svg');
  }

  constructor(private readonly scene: Phaser.Scene) {
    for (const id of Object.keys(CHARACTER_MANIFESTS) as Array<Exclude<CharacterArt, 'unknown'>>) {
      const asset = parseSpriteAssetContract(scene.cache.json.get(`character-manifest-${id}`));
      if (asset?.status === 'production') this.assets.set(id, asset);
    }
    scene.load.on('loaderror', this.errorHandler);
    scene.load.on('filecomplete', this.completeHandler);
    scene.events.once('shutdown', () => {
      scene.load.off('loaderror', this.errorHandler);
      scene.load.off('filecomplete', this.completeHandler);
    });
  }

  beginFrame() { this.activePages.clear(); }

  render(sprite: Phaser.GameObjects.Sprite, art: CharacterArt, state: 'idle' | 'walk', facing: FacingDirection, seconds: number, reducedMotion: boolean) {
    const asset = this.assets.get(art);
    if (!asset) return { loaded: false, failed: true };
    const selection = sequenceFor(asset, state, facing);
    const frames = selection.sequence.frames;
    const elapsedFrame = Math.floor(seconds * selection.fps);
    const frameIndex = reducedMotion ? 0 : selection.loop ? elapsedFrame % frames.length : Math.min(elapsedFrame, frames.length - 1);
    const frame = frames[frameIndex]!;
    // Queue both pages of this direction, never every character atlas at once.
    for (const pageId of new Set(reducedMotion ? [frame.page] : frames.map((item) => item.page))) {
      const key = `wilds-character-${art}-${pageId}`;
      this.touched.set(key, this.scene.time.now);
      this.activePages.add(key);
      if (this.scene.textures.exists(key) || this.queued.has(key) || this.failed.has(key)) continue;
      const page = asset.pages.find((item) => item.id === pageId)!;
      this.pageBytes.set(key, page.imageWidth * page.imageHeight * 4);
      const base = CHARACTER_MANIFESTS[art as Exclude<CharacterArt, 'unknown'>];
      const url = base.slice(0, base.lastIndexOf('/') + 1) + page.image;
      this.queued.add(key);
      this.scene.load.image(key, url);
    }
    if (!this.scene.load.isLoading() && this.queued.size) this.scene.load.start();
    const key = `wilds-character-${art}-${frame.page}`;
    if (!this.scene.textures.exists(key)) return { loaded: false, failed: this.failed.has(key) };
    this.queued.delete(key);
    const texture = this.scene.textures.get(key);
    const frameName = `${frame.column}:${frame.row}`;
    if (!texture.has(frameName)) texture.add(frameName, 0, frame.column * selection.clip.frameWidth,
      frame.row * selection.clip.frameHeight, selection.clip.frameWidth, selection.clip.frameHeight);
    sprite.setTexture(key, frameName).setOrigin(selection.clip.feet.x, selection.clip.feet.y);
    sprite.setData('productionArt', art);
    return { loaded: true, failed: false };
  }

  /** Keep active full sequences plus displayed pages; immediately trim cold history to a byte target. */
  prune(liveTextureKeys: Set<string>) {
    const loaded = [...this.touched].filter(([key]) => this.scene.textures.exists(key))
      .map(([key, lastUsed]) => ({ key, lastUsed, bytes: this.pageBytes.get(key) ?? 0 }));
    const protectedKeys = new Set([...liveTextureKeys, ...this.activePages]);
    const { evictions, remainingBytes } = spritePageEvictions(loaded, protectedKeys);
    for (const key of evictions) {
      this.scene.textures.remove(key);
      this.touched.delete(key);
      this.pageBytes.delete(key);
      this.queued.delete(key);
    }
    this.metrics.loadedPages = loaded.length - evictions.length;
    this.metrics.estimatedDecodedBytes = remainingBytes;
    this.metrics.protectedDecodedBytes = loaded.reduce((total, page) => total + (protectedKeys.has(page.key) ? page.bytes : 0), 0);
  }

}

export class IllustratedActor {
  readonly sprite: Phaser.GameObjects.Sprite;
  readonly shadow: Phaser.GameObjects.Ellipse;
  readonly label: Phaser.GameObjects.Text;
  facing: FacingDirection = 's';
  private elapsed = 0;
  private state: 'idle' | 'walk' = 'idle';
  private name: string;
  private art: CharacterArt;
  private readonly companion: boolean;
  private readonly height: number;
  private failed = false;

  constructor(private readonly scene: Phaser.Scene, private readonly bank: ProductionSpriteBank,
    x: number, y: number, art: CharacterArt, name: string, role: 'player' | 'local' | 'companion' | 'resident') {
    this.name = name;
    this.art = art;
    this.companion = role === 'companion';
    this.height = this.companion ? 64 : 94;
    this.shadow = scene.add.ellipse(x, y - 1, this.companion ? 25 : 29, 10, 0x071a19, 0.3);
    this.sprite = scene.add.sprite(x, y, this.companion ? 'wilds-companion-fallback' : 'wilds-player-fallback');
    this.sprite.setDisplaySize(this.companion ? 36 : 42, this.companion ? 36 : 42).setOrigin(0.5, 0.88);
    this.label = scene.add.text(x, y - (this.companion ? 50 : 77), name, {
      fontFamily: 'system-ui, sans-serif', fontSize: this.companion ? '11px' : '12px',
      color: role === 'resident' ? '#ffe4a6' : role === 'local' ? '#e4fff3' : '#fff3db',
      align: 'center', backgroundColor: role === 'resident' ? '#4a352bd9' : '#142c2bd4',
      padding: { x: 6, y: 3 }
    }).setOrigin(0.5, 1);
  }

  setIdentity(art: CharacterArt, name: string) {
    if (art !== this.art) {
      this.art = art;
      this.sprite.setTexture(this.companion ? 'wilds-companion-fallback' : 'wilds-player-fallback');
      this.sprite.setDisplaySize(this.companion ? 36 : 42, this.companion ? 36 : 42);
    }
    this.name = name;
  }

  update(x: number, y: number, dx: number, dy: number, moving: boolean, delta: number, reducedMotion: boolean, alpha = 1) {
    const state = moving ? 'walk' : 'idle';
    if (state !== this.state) { this.elapsed = 0; this.state = state; }
    this.elapsed += Math.min(delta, 100) / 1000;
    if (moving) this.facing = classifyFacing(dx, dy, this.facing, 0.001);
    const result = this.bank.render(this.sprite, this.art, this.state, this.facing, this.elapsed, reducedMotion);
    if (result.loaded) this.sprite.setDisplaySize(this.height, this.height);
    this.failed = result.failed;
    this.sprite.setPosition(x, y).setAlpha(alpha).setDepth(y + 10);
    this.shadow.setPosition(x, y - 1).setAlpha(alpha * 0.7).setDepth(y + 1);
    this.label.setText(this.name + (this.failed ? '\nArt unavailable' : ''));
    this.label.setPosition(x, y - (this.companion ? 48 : 72)).setAlpha(alpha).setDepth(1000 + y);
    return result;
  }

  destroy() { this.sprite.destroy(); this.shadow.destroy(); this.label.destroy(); }
}
