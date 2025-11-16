import Phaser from 'phaser';
import { World, type Vec2 } from '../ecs/components';
import { dashSystem, movementSystem } from '../ecs/systems';

const RUN_LIMIT_MS = 60000;
const TILESET_KEY = 'shardfront-iso-tiles';
const TILEMAP_KEY = 'shardfront-iso-map';
const HERO_KEY = 'hero-iso';
const AMBIENT_KEY = 'ambient-overlay';
const VIGNETTE_KEY = 'vignette-overlay';
const GLOW_PARTICLE_KEY = 'arpg-glow';
const BACKDROP_KEY = 'shardfront-backdrop';

export class GameScene extends Phaser.Scene {
  private static onGameOver: ((score: number) => void) | null = null;

  static setGameHandlers(handler: { onGameOver: (score: number) => void }) {
    GameScene.onGameOver = handler.onGameOver;
  }

  private world!: World;
  private playerId: number | null = null;
  private playerSprite!: Phaser.Physics.Arcade.Sprite;
  private map!: Phaser.Tilemaps.Tilemap;
  private wallLayer!: Phaser.Tilemaps.TilemapLayer;
  private collisionLayer!: Phaser.Tilemaps.TilemapLayer;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;
  private dashKeys: Phaser.Input.Keyboard.Key[] = [];
  private escKey!: Phaser.Input.Keyboard.Key;
  private lastDirection: Vec2 = { x: 1, y: 0 };
  private elapsedMs = 0;
  private ended = false;
  private backdrop!: Phaser.GameObjects.Image;
  private scoreText!: Phaser.GameObjects.Text;
  private instructionText!: Phaser.GameObjects.Text;
  private shadow!: Phaser.GameObjects.Ellipse;
  private ambientImage!: Phaser.GameObjects.Image;
  private vignetteImage!: Phaser.GameObjects.Image;
  private particleManager: Phaser.GameObjects.Particles.ParticleEmitterManager | null = null;
  private glowEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;

  preload() {
    this.load.image(TILESET_KEY, '/games/arpg/tileset_iso_v2.png');
    this.load.tilemapTiledJSON(TILEMAP_KEY, '/games/arpg/shardfront_iso.json');
    this.load.spritesheet(HERO_KEY, '/games/arpg/hero_iso_v2.png', {
      frameWidth: 80,
      frameHeight: 80
    });
    this.load.image(AMBIENT_KEY, '/games/arpg/ambient_core.png');
    this.load.image(VIGNETTE_KEY, '/games/arpg/vignette_soft.png');
    this.load.image(BACKDROP_KEY, '/games/arpg/backdrop.png');
  }

  create() {
    this.cameras.main.setBackgroundColor('#05050a');
    this.elapsedMs = 0;
    this.ended = false;
    this.world = new World();

    this.map = this.make.tilemap({ key: TILEMAP_KEY });
    const tileset = this.map.addTilesetImage('ShardfrontIsoV2', TILESET_KEY);
    if (!tileset) {
      throw new Error('Tileset missing for Shardfront Approach');
    }

    this.backdrop = this.add
      .image(this.map.widthInPixels / 2, this.map.heightInPixels / 2, BACKDROP_KEY)
      .setDepth(-10)
      .setAlpha(0.9);
    this.backdrop.setScale(
      Math.max(
        this.map.widthInPixels / this.backdrop.width,
        this.map.heightInPixels / this.backdrop.height
      ) * 1.1
    );
    this.backdrop.setScrollFactor(0.08);

    this.map.createLayer('floor', tileset, 0, 0)?.setDepth(0.5);
    this.wallLayer = this.map.createLayer('walls', tileset, 0, 0).setDepth(2);
    if (!this.wallLayer) {
      throw new Error('Wall layer missing from map');
    }
    this.collisionLayer = this.map.createLayer('collision', tileset, 0, 0);
    if (this.collisionLayer) {
      this.collisionLayer.setVisible(false);
      this.collisionLayer.setCollision([1, 2, 3, 4], true);
    }
    this.wallLayer.setAlpha(1);

    const spawnX = this.map.widthInPixels * 0.52;
    const spawnY = this.map.heightInPixels * 0.58;

    this.playerId = this.world.createEntity();
    this.world.setTransform(this.playerId, { x: spawnX, y: spawnY, rotation: 0 });
    this.world.setVelocity(this.playerId, { x: 0, y: 0, maxSpeed: 220, damping: 0.88 });
    this.world.setHealth(this.playerId, { max: 3, current: 3 });
    this.world.setDash(this.playerId, {
      speed: 520,
      durationMs: 220,
      cooldownMs: 700,
      remainingCooldown: 0,
      remainingDuration: 0,
      isDashing: false,
        queuedDirection: null
      });

    this.playerSprite = this.physics.add.sprite(spawnX, spawnY, HERO_KEY, 0);
    this.playerSprite.setOrigin(0.5, 0.92);
    this.playerSprite.setCollideWorldBounds(true);
    this.playerSprite.setDepth(7);
    this.playerSprite.body.setSize(32, 28);
    this.playerSprite.body.setOffset(20, 36);
    this.shadow = this.add.ellipse(spawnX, spawnY, 64, 22, 0x000000, 0.45);
    this.shadow.setDepth(6);
    this.shadow.setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.initGlowEmitter();

    this.createAnimations();
    this.playerSprite.play('hero-idle');

    this.physics.world.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);

    this.cameras.main.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    this.cameras.main.setZoom(0.92);
    this.cameras.main.startFollow(this.playerSprite, true, 0.16, 0.16);
    this.cameras.main.roundPixels = true;

    this.ambientImage = this.add
      .image(0, 0, AMBIENT_KEY)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(8)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.vignetteImage = this.add
      .image(0, 0, VIGNETTE_KEY)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(20)
      .setAlpha(0.75);
    this.positionOverlays();

    this.scoreText = this.add
      .text(36, 74, 'Score 0', {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '26px',
        color: '#f4fbff'
      })
      .setScrollFactor(0)
      .setDepth(30);
    this.scoreText.setShadow(0, 2, '#010208', 6, true, true);

    this.instructionText = this.add
      .text(36, 40, 'WASD or arrows to move — Shift/Space to dash', {
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '16px',
        color: '#c7d6ff'
      })
      .setScrollFactor(0)
      .setDepth(30);
    this.instructionText.setShadow(0, 2, '#02030a', 4, true, true);

    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      w: Phaser.Input.Keyboard.KeyCodes.W,
      a: Phaser.Input.Keyboard.KeyCodes.A,
      s: Phaser.Input.Keyboard.KeyCodes.S,
      d: Phaser.Input.Keyboard.KeyCodes.D
    }) as Record<'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;

    this.dashKeys = [
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT),
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE)
    ];

    this.escKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.dashKeys.forEach((key) => key.destroy());
      this.escKey.destroy();
      this.particleManager?.destroy();
      this.particleManager = null;
      this.glowEmitter = null;
    });
  }

  update(_time: number, delta: number) {
    if (this.ended || !this.playerId) return;

    this.elapsedMs += delta;
    const score = Math.max(0, Math.floor(this.elapsedMs));
    this.scoreText.setText(`Score ${score}`);

    const currentTransform = this.playerId ? this.world.getTransform(this.playerId) : null;
    const previous = currentTransform ? { x: currentTransform.x, y: currentTransform.y } : null;
    const hasInput = this.handleInput();
    dashSystem(this.world, delta);
    movementSystem(this.world, delta);
    if (previous) {
      this.resolveEnvironment(previous);
    }
    this.syncSpriteWithTransform();
    this.updateAnimation(hasInput);

    this.positionOverlays();

    if (this.elapsedMs >= RUN_LIMIT_MS || Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this.endRun();
    }
  }

  private handleInput() {
    const velocity = this.playerId ? this.world.getVelocity(this.playerId) : null;
    const dash = this.playerId ? this.world.getDash(this.playerId) : null;
    if (!velocity) return false;

    const axis = this.sampleInput();
    const hasInput = Math.hypot(axis.x, axis.y) > 0.01;
    const canSteer = !dash?.isDashing;

    if (hasInput) {
      const magnitude = Math.hypot(axis.x, axis.y) || 1;
      const normalized = { x: axis.x / magnitude, y: axis.y / magnitude };
      this.lastDirection = normalized;
      if (canSteer) {
        velocity.x = normalized.x * velocity.maxSpeed;
        velocity.y = normalized.y * velocity.maxSpeed;
      }
    } else if (canSteer) {
      velocity.x *= velocity.damping;
      velocity.y *= velocity.damping;
    }

    const wantsDash = this.dashKeys.some((key) => Phaser.Input.Keyboard.JustDown(key));
    if (wantsDash && dash && (!dash.isDashing || dash.remainingCooldown <= 0)) {
      const direction = hasInput ? axis : this.lastDirection;
      this.world.queueDash(this.playerId!, direction);
    }

    return hasInput;
  }

  private sampleInput(): Vec2 {
    const axis = { x: 0, y: 0 };
    if (this.cursors.left?.isDown || this.wasd.a.isDown) axis.x -= 1;
    if (this.cursors.right?.isDown || this.wasd.d.isDown) axis.x += 1;
    if (this.cursors.up?.isDown || this.wasd.w.isDown) axis.y -= 1;
    if (this.cursors.down?.isDown || this.wasd.s.isDown) axis.y += 1;
    return axis;
  }

  private resolveEnvironment(previous: Vec2) {
    if (!this.playerId) return;
    const transform = this.world.getTransform(this.playerId);
    if (!transform) return;

    const body = this.playerSprite.body as Phaser.Physics.Arcade.Body;
    const halfW = (body?.width ?? 20) * 0.5;
    const halfH = (body?.height ?? 20) * 0.5;
    const minX = halfW;
    const minY = halfH;
    const maxX = this.map.widthInPixels - halfW;
    const maxY = this.map.heightInPixels - halfH;

    transform.x = Phaser.Math.Clamp(transform.x, minX, maxX);
    transform.y = Phaser.Math.Clamp(transform.y, minY, maxY);

    if (this.hitsWall(transform.x, transform.y)) {
      transform.x = previous.x;
      transform.y = previous.y;
    }
  }

  private hitsWall(x: number, y: number) {
    const body = this.playerSprite.body as Phaser.Physics.Arcade.Body;
    const halfW = (body?.width ?? 20) * 0.5;
    const halfH = (body?.height ?? 20) * 0.5;
    const probes: Vec2[] = [
      { x: -halfW, y: -halfH },
      { x: halfW, y: -halfH },
      { x: -halfW, y: halfH },
      { x: halfW, y: halfH }
    ];
    return probes.some((offset) => {
      const layer = this.collisionLayer ?? this.wallLayer;
      const tile = layer.getTileAtWorldXY(x + offset.x, y + offset.y, true);
      return tile ? tile.collides || tile.index > 0 : false;
    });
  }

  private syncSpriteWithTransform() {
    if (!this.playerId || !this.playerSprite) return;
    const transform = this.world.getTransform(this.playerId);
    if (!transform) return;
    const smoothX = Phaser.Math.Linear(this.playerSprite.x, transform.x, 0.35);
    const smoothY = Phaser.Math.Linear(this.playerSprite.y, transform.y, 0.35);
    this.playerSprite.setPosition(smoothX, smoothY);
    if (this.shadow) {
      this.shadow.setPosition(smoothX, smoothY + 8);
    }
  }

  private updateAnimation(isMoving: boolean) {
    const animKey = isMoving ? 'hero-walk' : 'hero-idle';
    if (this.playerSprite.anims.currentAnim?.key !== animKey) {
      this.playerSprite.play(animKey, true);
    }
    if (this.lastDirection.x !== 0) {
      this.playerSprite.setFlipX(this.lastDirection.x < 0);
    }
    if (this.shadow) {
      const squish = Phaser.Math.Linear(this.shadow.scaleX, isMoving ? 0.92 : 1.05, 0.2);
      this.shadow.setScale(squish, 1);
    }
  }

  private createAnimations() {
    if (!this.anims.get('hero-idle')) {
      this.anims.create({
        key: 'hero-idle',
        frames: [{ key: HERO_KEY, frame: 0 }],
        frameRate: 1,
        repeat: -1
      });
    }
    if (!this.anims.get('hero-walk')) {
      this.anims.create({
        key: 'hero-walk',
        frames: this.anims.generateFrameNumbers(HERO_KEY, { start: 0, end: 3 }),
        frameRate: 10,
        repeat: -1
      });
    }
  }

  private initGlowEmitter() {
    if (!this.playerSprite) return;
    if (!this.textures.exists(GLOW_PARTICLE_KEY)) {
      const brush = this.make.graphics({ x: 0, y: 0, add: false });
      brush.fillStyle(0xffffff, 0.9);
      brush.fillCircle(12, 12, 12);
      brush.generateTexture(GLOW_PARTICLE_KEY, 24, 24);
      brush.destroy();
    }
    this.particleManager = this.add.particles(GLOW_PARTICLE_KEY).setDepth(6.5);
    this.glowEmitter = this.particleManager.createEmitter({
      follow: this.playerSprite,
      followOffset: { x: 0, y: -16 },
      frequency: 90,
      lifespan: 1400,
      speed: { min: 8, max: 32 },
      scale: { start: 0.5, end: 0 },
      alpha: { start: 0.35, end: 0 },
      angle: { min: 160, max: 340 },
      blendMode: Phaser.BlendModes.ADD,
      gravityY: 0
    });
  }

  private positionOverlays() {
    if (!this.ambientImage || !this.vignetteImage) return;
    const cam = this.cameras.main;
    const viewportWidth = cam.width / cam.zoom;
    const viewportHeight = cam.height / cam.zoom;
    const cx = viewportWidth / 2;
    const cy = viewportHeight / 2;
    this.ambientImage.setPosition(cx, cy);
    this.vignetteImage.setPosition(cx, cy);
    const ambientScale = Math.max(
      (viewportWidth / this.ambientImage.width) * 1.2,
      (viewportHeight / this.ambientImage.height) * 1.2
    );
    const vignetteScale = Math.max(
      (viewportWidth / this.vignetteImage.width) * 1.15,
      (viewportHeight / this.vignetteImage.height) * 1.15
    );
    this.ambientImage.setScale(ambientScale);
    this.vignetteImage.setScale(vignetteScale);
  }

  private endRun() {
    if (this.ended) return;
    this.ended = true;
    const score = Math.max(0, Math.floor(this.elapsedMs));
    GameScene.onGameOver?.(score);
  }
}
