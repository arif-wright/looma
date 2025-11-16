import Phaser from 'phaser';
import { HERO_MANIFEST, SKELETON_MANIFEST, type CharacterManifest, type DirectionKey } from '../assets/manifest';
import { World, type EntityId, type Player, type Vec2 } from '../ecs/components';
import { dashSystem, movementSystem, type DashInput } from '../ecs/systems';

const MAX_RUN_MS = 90_000;
const TILE_WIDTH = 128;
const TILE_HEIGHT = 64;
const HALF_TILE_WIDTH = TILE_WIDTH / 2;
const HALF_TILE_HEIGHT = TILE_HEIGHT / 2;
const TILE_IMAGE_SIZE = 256;
const TILE_SCALE = TILE_WIDTH / TILE_IMAGE_SIZE;
const ROOM_WIDTH = 22;
const ROOM_HEIGHT = 14;
const ROOM_ORIGIN_X = ROOM_HEIGHT * HALF_TILE_WIDTH;
const ROOM_ORIGIN_Y = -250;
const HERO_SPEED = 220;
const ENEMY_SPEED = 150;
const HERO_MAX_HP = 140;
const ENEMY_HP = 45;
const HERO_ATTACK_COOLDOWN = 340;
const ENEMY_ATTACK_COOLDOWN = 1_000;
const HERO_ATTACK_DAMAGE = 25;
const ENEMY_ATTACK_DAMAGE = 16;
const DASH_COOLDOWN = 700;
const DASH_POWER = 220;

type GameHandlers = { onGameOver: (score: number) => void };

type EnemyActor = {
  id: EntityId;
  sprite: Phaser.GameObjects.Sprite;
  ring: Phaser.GameObjects.Image;
  hp: number;
  attackTimer: number;
  alive: boolean;
  state: 'idle' | 'chasing' | 'attacking' | 'dead';
  facing: DirectionKey;
};

type PropActor = {
  sprite: Phaser.GameObjects.Sprite;
  ring?: Phaser.GameObjects.Image;
  center: Vec2;
  blockingRadius: number;
  hp: number;
  alive: boolean;
  breakAnim: string | null;
  loot: 'gold' | null;
};

type LootActor = {
  sprite: Phaser.GameObjects.Sprite;
  indicator: Phaser.GameObjects.Image;
  glint: Phaser.GameObjects.Sprite;
  collected: boolean;
};

const HERO_ANIM_KEYS = {
  idle: 'knight_armed_idle',
  walk: 'knight_armed_walk',
  attack: 'knight_armed_attack',
  death: 'knight_special_death'
} as const;

const SKELETON_ANIM_KEYS = {
  idle: 'skeleton_default_idle',
  walk: 'skeleton_default_walk',
  attack: 'skeleton_default_attack',
  death: 'skeleton_special_death'
} as const;

const FLOOR_VARIANTS = [
  '/games/arpg/tiles/floor_tiles/N/tiles_N_90.0_0.png',
  '/games/arpg/tiles/floor_tiles/E/tiles_E_0.0_0.png',
  '/games/arpg/tiles/floor_tiles/S/tiles_S_270.0_0.png'
];

const WALL_VARIANT = '/games/arpg/tiles/wall1/N/wall1_N_90.0_0.png';

const PROP_TEXTURES = {
  barrel: '/games/arpg/props/barrel/N/barrel_N_90.0_0.png',
  barrelBreak: [
    '/games/arpg/props/barrel_break/S/barrel_break_S_270.0_0.png',
    '/games/arpg/props/barrel_break/S/barrel_break_S_270.0_1.png',
    '/games/arpg/props/barrel_break/S/barrel_break_S_270.0_2.png',
    '/games/arpg/props/barrel_break/S/barrel_break_S_270.0_3.png',
    '/games/arpg/props/barrel_break/S/barrel_break_S_270.0_4.png',
    '/games/arpg/props/barrel_break/S/barrel_break_S_270.0_5.png',
    '/games/arpg/props/barrel_break/S/barrel_break_S_270.0_6.png',
    '/games/arpg/props/barrel_break/S/barrel_break_S_270.0_7.png'
  ],
  crate: '/games/arpg/props/crate/N/crate_N_90.0_0.png',
  crateBreak: [
    '/games/arpg/props/crate_break/S/crate_break_S_270.0_0.png',
    '/games/arpg/props/crate_break/S/crate_break_S_270.0_1.png',
    '/games/arpg/props/crate_break/S/crate_break_S_270.0_2.png',
    '/games/arpg/props/crate_break/S/crate_break_S_270.0_3.png',
    '/games/arpg/props/crate_break/S/crate_break_S_270.0_4.png',
    '/games/arpg/props/crate_break/S/crate_break_S_270.0_5.png',
    '/games/arpg/props/crate_break/S/crate_break_S_270.0_6.png',
    '/games/arpg/props/crate_break/S/crate_break_S_270.0_7.png'
  ],
  gold: '/games/arpg/props/gold_drop/S/gold_drop_S_270.0_0.png'
} as const;

const UI_TEXTURES = {
  ringBlue: '/games/arpg/ui/highlight/highlight_blue.png',
  ringRed: '/games/arpg/ui/highlight/highlight_red.png',
  lootIndicator: '/games/arpg/ui/loot-indicator/loot_indicator_yellow.png',
  vignette: '/games/arpg/ui/filter/filter_vignette.png'
} as const;

const VFX_TEXTURES = {
  swoosh: [
    '/games/arpg/vfx/swoosh/swoosh_0.png',
    '/games/arpg/vfx/swoosh/swoosh_1.png',
    '/games/arpg/vfx/swoosh/swoosh_2.png',
    '/games/arpg/vfx/swoosh/swoosh_3.png'
  ],
  glint: [
    '/games/arpg/vfx/glint/glint_0.png',
    '/games/arpg/vfx/glint/glint_1.png',
    '/games/arpg/vfx/glint/glint_2.png',
    '/games/arpg/vfx/glint/glint_3.png',
    '/games/arpg/vfx/glint/glint_4.png',
    '/games/arpg/vfx/glint/glint_5.png',
    '/games/arpg/vfx/glint/glint_6.png',
    '/games/arpg/vfx/glint/glint_7.png'
  ]
} as const;

const frameKeyFromPath = (path: string) => path.replace(/[^a-zA-Z0-9]+/g, '_');

export class GameScene extends Phaser.Scene {
  private static handlers: GameHandlers | null = null;

  static setGameHandlers(handlers: GameHandlers) {
    GameScene.handlers = handlers;
  }

  private world!: World;
  private playerId: EntityId | null = null;
  private playerSprite!: Phaser.GameObjects.Sprite;
  private heroRing!: Phaser.GameObjects.Image;
  private playerShadow!: Phaser.GameObjects.Ellipse;
  private dashKeys: Phaser.Input.Keyboard.Key[] = [];
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;
  private movementInput = new Phaser.Math.Vector2(0, 0);
  private lastMoveDir = new Phaser.Math.Vector2(0, 0);
  private heroFacing: DirectionKey = 'S';
  private heroAttacking = false;
  private pointerAttack = false;
  private attackCooldown = 0;
  private killCount = 0;
  private pendingDash = false;
  private previousPositions = new Map<EntityId, Vec2>();
  private ended = false;
  private elapsed = 0;
  private dashAfterimages: Phaser.GameObjects.Group | null = null;

  private instructionsText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private hpText!: Phaser.GameObjects.Text;
  private hpBarFill!: Phaser.GameObjects.Graphics;
  private hpBarBg!: Phaser.GameObjects.Graphics;
  private uiContainer!: Phaser.GameObjects.Container;
  private vignetteSprite?: Phaser.GameObjects.Image;

  private wallTiles = new Set<string>();
  private props: PropActor[] = [];
  private loot: LootActor[] = [];
  private skeletons: EnemyActor[] = [];

  constructor() {
    super({ key: 'GameScene' });
  }

  preload() {
    FLOOR_VARIANTS.forEach((path, index) => {
      this.load.image(`floor_${index}`, path);
    });
    this.load.image('wall_tile', WALL_VARIANT);
    this.preloadPropTextures();
    this.preloadCharacterManifest(HERO_MANIFEST);
    this.preloadCharacterManifest(SKELETON_MANIFEST);
    Object.entries(UI_TEXTURES).forEach(([key, path]) => this.load.image(key, path));
    VFX_TEXTURES.swoosh.forEach((path, idx) => this.load.image(`vfx_swoosh_${idx}`, path));
    VFX_TEXTURES.glint.forEach((path, idx) => this.load.image(`vfx_glint_${idx}`, path));
    this.load.image('vfx_glow', '/games/arpg/vfx/glow.png');
    this.load.image('vfx_zone', '/games/arpg/vfx/zone.png');
  }

  create() {
    this.cameras.main.setBackgroundColor(0x05060a);
    this.world = new World();
    this.resetState();
    this.buildDungeonRoom();
    this.registerCharacterAnimations('hero', HERO_MANIFEST);
    this.registerCharacterAnimations('skeleton', SKELETON_MANIFEST);
    this.setupPlayer();
    this.setupInput();
    this.setupUI();
    this.spawnSkeletons();
    this.createProps();
    this.createOverlays();
  }

  update(_time: number, delta: number) {
    if (this.ended || !this.playerId) return;
    this.elapsed += delta;
    if (this.elapsed >= MAX_RUN_MS) {
      this.endRun();
      return;
    }

    this.attackCooldown = Math.max(0, this.attackCooldown - delta);

    const health = this.world.getHealth(this.playerId);
    if (!health || health.current <= 0) {
      this.endRun();
      return;
    }

    this.handleInput();
    const dashResult = this.handleDash(delta);

    const snapshots = this.captureTransforms();
    movementSystem(this.world, delta);
    this.resolveCollisions(snapshots);
    this.syncSprites();
    this.updateEnemyBehavior(delta);
    this.updateLootCollection();

    if (this.pointerAttack && this.attackCooldown <= 0 && !this.heroAttacking) {
      this.performAttack();
    }

    if (dashResult?.activated) {
      this.spawnDashAfterimage();
    }
    this.updateUIState();
  }

  private resetState() {
    this.previousPositions.clear();
    this.killCount = 0;
    this.attackCooldown = 0;
    this.pendingDash = false;
    this.heroAttacking = false;
    this.heroFacing = 'S';
    this.wallTiles.clear();
    this.props = [];
    this.loot = [];
    this.skeletons = [];
    this.ended = false;
    this.elapsed = 0;
  }

  private preloadPropTextures() {
    Object.entries(PROP_TEXTURES).forEach(([key, value]) => {
      if (Array.isArray(value)) {
        value.forEach((path, idx) => this.load.image(`${key}_${idx}`, path));
      } else {
        this.load.image(key, value);
      }
    });
  }

  private preloadCharacterManifest(manifest: CharacterManifest) {
    Object.values(manifest).forEach((framesByDir) => {
      Object.values(framesByDir).forEach((frames) => {
        frames.forEach((path) => {
          const key = frameKeyFromPath(path);
          if (!this.textures.exists(key)) {
            this.load.image(key, path);
          }
        });
      });
    });
  }

  private registerCharacterAnimations(prefix: string, manifest: CharacterManifest) {
    Object.entries(manifest).forEach(([animName, dirMap]) => {
      Object.entries(dirMap).forEach(([dir, frames]) => {
        const key = `${prefix}-${animName}-${dir}`;
        if (this.anims.exists(key)) return;
        const frameRate = animName.includes('walk')
          ? 10
          : animName.includes('attack')
            ? 14
            : animName.includes('death')
              ? 12
              : 6;
        const repeat = animName.includes('attack') || animName.includes('death') ? 0 : -1;
        this.anims.create({
          key,
          frames: frames.map((path) => ({ key: frameKeyFromPath(path) })),
          frameRate,
          repeat
        });
      });
    });
  }

  private buildDungeonRoom() {
    for (let ty = 0; ty < ROOM_HEIGHT; ty++) {
      for (let tx = 0; tx < ROOM_WIDTH; tx++) {
        const pos = this.isoToWorld(tx, ty);
        const key = Phaser.Utils.Array.GetRandom(['floor_0', 'floor_1', 'floor_2']);
        const tile = this.add.image(pos.x, pos.y, key);
        tile.setScale(TILE_SCALE);
        tile.setDepth(pos.y);
      }
    }
    const placeWall = (tx: number, ty: number) => {
      const pos = this.isoToWorld(tx, ty);
      const wall = this.add.image(pos.x, pos.y - 40, 'wall_tile');
      wall.setScale(TILE_SCALE);
      wall.setDepth(pos.y + 150);
      this.wallTiles.add(`${tx},${ty}`);
    };
    for (let tx = 0; tx < ROOM_WIDTH; tx++) {
      placeWall(tx, 0);
      placeWall(tx, ROOM_HEIGHT - 1);
    }
    for (let ty = 1; ty < ROOM_HEIGHT - 1; ty++) {
      placeWall(0, ty);
      placeWall(ROOM_WIDTH - 1, ty);
    }
    const pillars: Array<[number, number]> = [
      [5, 5],
      [ROOM_WIDTH - 6, 5],
      [5, ROOM_HEIGHT - 6],
      [ROOM_WIDTH - 6, ROOM_HEIGHT - 6]
    ];
    pillars.forEach(([x, y]) => placeWall(x, y));
  }

  private setupPlayer() {
    const spawn = this.isoToWorld(Math.floor(ROOM_WIDTH / 2), Math.floor(ROOM_HEIGHT / 2));
    this.playerId = this.world.createEntity();
    this.world.setTransform(this.playerId, { x: spawn.x, y: spawn.y, rot: 0 });
    this.world.setVelocity(this.playerId, { vx: 0, vy: 0, speed: HERO_SPEED });
    this.world.setHealth(this.playerId, { max: HERO_MAX_HP, current: HERO_MAX_HP });
    this.world.setDash(this.playerId, {
      cd: 0,
      cdMax: DASH_COOLDOWN,
      power: DASH_POWER,
      duration: 140,
      timer: 0,
      lastDir: { x: 1, y: 0 }
    });
    this.world.tagPlayer(this.playerId, { score: 0 });

    const initialFrame = frameKeyFromPath(
      HERO_MANIFEST[HERO_ANIM_KEYS.idle]?.S?.[0] ?? HERO_MANIFEST[HERO_ANIM_KEYS.idle]?.N?.[0] ?? ''
    );
    this.playerSprite = this.add.sprite(spawn.x, spawn.y, initialFrame);
    this.playerSprite.setOrigin(0.5, 0.8);
    this.playerSprite.setDepth(spawn.y + 20);
    this.playerSprite.play(`hero-${HERO_ANIM_KEYS.idle}-S`);

    this.playerShadow = this.add.ellipse(spawn.x, spawn.y + 18, 80, 30, 0x000000, 0.4);
    this.playerShadow.setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.playerShadow.setDepth(spawn.y - 5);

    this.heroRing = this.add.image(spawn.x, spawn.y + 15, 'ringBlue');
    this.heroRing.setScale(0.35);
    this.heroRing.setAlpha(0.7);
    this.heroRing.setBlendMode(Phaser.BlendModes.ADD);
    this.heroRing.setDepth(spawn.y - 10);

    this.cameras.main.setBounds(-500, -800, 3000, 2000);
    this.cameras.main.startFollow(this.playerSprite, true, 0.12, 0.12);

    this.dashAfterimages = this.add.group();
  }

  private setupInput() {
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = {
      w: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      a: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      s: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      d: this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D)
    };
    this.dashKeys = [
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT)
    ];
    this.input.keyboard.addCapture(this.dashKeys.map((key) => key.keyCode));

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 0) {
        this.pointerAttack = true;
      }
    });
    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (pointer.button === 0) {
        this.pointerAttack = false;
      }
    });
  }

  private setupUI() {
    this.uiContainer = this.add.container(40, 32);
    this.uiContainer.setScrollFactor(0);
    this.uiContainer.setDepth(2000);
    const panel = this.add.rectangle(0, 0, 360, 140, 0x050c18, 0.65).setOrigin(0);
    panel.setStrokeStyle(1, 0x0e2244, 0.4);
    this.instructionsText = this.add
      .text(
        16,
        12,
        'WASD move  •  Space/Shift dash\nLeft click attack  •  Break crates for loot',
        {
          fontFamily: 'Space Grotesk, sans-serif',
          fontSize: '16px',
          color: '#e5f6ff'
        }
      )
      .setShadow(0, 0, '#000', 6, true, true);
    this.scoreText = this.add
      .text(16, 58, 'Kills 0  •  Score 0', {
        fontFamily: 'Space Grotesk, sans-serif',
        fontSize: '20px',
        color: '#f8fafc'
      })
      .setShadow(0, 0, '#000', 4, true, true);
    this.hpText = this.add.text(16, 98, 'HP 0/0', {
      fontFamily: 'Space Grotesk, sans-serif',
      fontSize: '16px',
      color: '#c8f7ff'
    });
    this.hpBarBg = this.add.graphics();
    this.hpBarFill = this.add.graphics();
    this.hpBarBg.setPosition(16, 120);
    this.hpBarFill.setPosition(16, 120);
    this.drawHpBar(1);
    this.uiContainer.add([panel, this.instructionsText, this.scoreText, this.hpText, this.hpBarBg, this.hpBarFill]);
  }

  private createOverlays() {
    this.vignetteSprite = this.add
      .image(0, 0, 'vignette')
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2500)
      .setAlpha(0.65);
    this.resizeVignette();
    this.scale.on('resize', () => this.resizeVignette());
  }

  private spawnSkeletons() {
    const slots: Array<[number, number]> = [
      [4, 3],
      [ROOM_WIDTH - 5, 4],
      [5, ROOM_HEIGHT - 4],
      [ROOM_WIDTH - 6, ROOM_HEIGHT - 4]
    ];
    slots.forEach((slot) => this.spawnSkeleton(slot[0], slot[1]));
  }

  private spawnSkeleton(tx: number, ty: number) {
    const spawn = this.isoToWorld(tx, ty);
    const id = this.world.createEntity();
    this.world.setTransform(id, { x: spawn.x, y: spawn.y, rot: 0 });
    this.world.setVelocity(id, { vx: 0, vy: 0, speed: ENEMY_SPEED });
    this.world.setHealth(id, { max: ENEMY_HP, current: ENEMY_HP });
    this.world.tagEnemy(id, {
      speed: ENEMY_SPEED,
      chaseRadius: 420,
      attackRange: 80,
      attackDelay: ENEMY_ATTACK_COOLDOWN,
      damage: ENEMY_ATTACK_DAMAGE,
      timer: 0
    });

    const initialFrame = frameKeyFromPath(
      SKELETON_MANIFEST[SKELETON_ANIM_KEYS.idle]?.S?.[0] ??
        SKELETON_MANIFEST[SKELETON_ANIM_KEYS.idle]?.N?.[0] ??
        ''
    );
    const sprite = this.add.sprite(spawn.x, spawn.y, initialFrame);
    sprite.setOrigin(0.5, 0.85);
    sprite.setDepth(spawn.y + 10);
    sprite.play(`skeleton-${SKELETON_ANIM_KEYS.idle}-S`);

    const ring = this.add.image(spawn.x, spawn.y + 10, 'ringRed');
    ring.setScale(0.27);
    ring.setAlpha(0.4);
    ring.setDepth(spawn.y - 5);

    this.skeletons.push({
      id,
      sprite,
      ring,
      hp: ENEMY_HP,
      attackTimer: 0,
      alive: true,
      state: 'idle',
      facing: 'S'
    });
  }

  private createProps() {
    const placements: Array<{ type: 'barrel' | 'crate'; tile: [number, number]; loot?: 'gold' }> = [
      { type: 'barrel', tile: [8, 7], loot: 'gold' },
      { type: 'crate', tile: [13, 6], loot: 'gold' },
      { type: 'barrel', tile: [6, ROOM_HEIGHT - 5], loot: 'gold' },
      { type: 'crate', tile: [ROOM_WIDTH - 7, ROOM_HEIGHT - 5], loot: 'gold' }
    ];
    placements.forEach((placement) => this.createProp(placement.type, placement.tile[0], placement.tile[1], placement.loot ?? null));
  }

  private createProp(type: 'barrel' | 'crate', tx: number, ty: number, loot: 'gold' | null) {
    const pos = this.isoToWorld(tx, ty);
    const textureKey = type === 'barrel' ? 'barrel' : 'crate';
    const sprite = this.add.sprite(pos.x, pos.y, textureKey);
    sprite.setScale(0.6);
    sprite.setDepth(pos.y + 20);
    const ring = this.add.image(pos.x, pos.y + 10, 'ringBlue');
    ring.setScale(0.2);
    ring.setAlpha(0.2);
    ring.setDepth(pos.y - 10);
    const actor: PropActor = {
      sprite,
      ring,
      center: pos,
      blockingRadius: 50,
      hp: 30,
      alive: true,
      breakAnim: this.registerPropBreakAnimation(type),
      loot
    };
    this.props.push(actor);
  }

  private registerPropBreakAnimation(type: 'barrel' | 'crate') {
    const frames = type === 'barrel' ? PROP_TEXTURES.barrelBreak : PROP_TEXTURES.crateBreak;
    const key = `prop-${type}-break`;
    if (!this.anims.exists(key)) {
      this.anims.create({
        key,
        frames: frames.map((path, idx) => ({ key: `${type}Break_${idx}` })),
        frameRate: 18,
        repeat: 0
      });
    }
    return key;
  }

  private createLoot(pos: Vec2) {
    const sprite = this.add.sprite(pos.x, pos.y, 'gold');
    sprite.setScale(0.5);
    sprite.setDepth(pos.y + 10);
    const indicator = this.add.image(pos.x, pos.y - 40, 'lootIndicator');
    indicator.setScale(0.5);
    indicator.setDepth(pos.y + 50);
    const glint = this.add.sprite(pos.x, pos.y, 'vfx_glint_0');
    if (!this.anims.exists('vfx-glint')) {
      this.anims.create({
        key: 'vfx-glint',
        frames: VFX_TEXTURES.glint.map((_, idx) => ({ key: `vfx_glint_${idx}` })),
        frameRate: 10,
        repeat: -1
      });
    }
    glint.play('vfx-glint');
    glint.setBlendMode(Phaser.BlendModes.ADD);
    glint.setDepth(pos.y + 20);
    this.loot.push({ sprite, indicator, glint, collected: false });
  }

  private createSwooshEffect(center: Vec2) {
    if (!this.anims.exists('vfx-swoosh')) {
      this.anims.create({
        key: 'vfx-swoosh',
        frames: VFX_TEXTURES.swoosh.map((_, idx) => ({ key: `vfx_swoosh_${idx}` })),
        frameRate: 18,
        repeat: 0
      });
    }
    const swoosh = this.add.sprite(center.x, center.y, 'vfx_swoosh_0');
    swoosh.setBlendMode(Phaser.BlendModes.ADD);
    swoosh.setDepth(center.y + 30);
    swoosh.play('vfx-swoosh');
    swoosh.on(Phaser.Animations.Events.ANIMATION_COMPLETE, () => swoosh.destroy());
  }

  private handleInput() {
    const x =
      (this.isKeyDown('d') || this.cursors.right.isDown ? 1 : 0) -
      (this.isKeyDown('a') || this.cursors.left.isDown ? 1 : 0);
    const y =
      (this.isKeyDown('s') || this.cursors.down.isDown ? 1 : 0) -
      (this.isKeyDown('w') || this.cursors.up.isDown ? 1 : 0);
    this.movementInput.set(x, y);
    if (this.movementInput.lengthSq() > 0) {
      this.movementInput.normalize();
      this.lastMoveDir.copy(this.movementInput);
      this.heroFacing = this.directionFromVector(this.lastMoveDir);
    }

    const dashPressed = this.dashKeys.some((key) => Phaser.Input.Keyboard.JustDown(key));
    this.pendingDash = dashPressed;

    if (!this.playerId) return;
    const velocity = this.world.getVelocity(this.playerId);
    if (!velocity) return;
    velocity.vx = this.movementInput.x * velocity.speed;
    velocity.vy = this.movementInput.y * velocity.speed;
    this.updateHeroAnimation();
  }

  private handleDash(delta: number) {
    if (!this.playerId) return undefined;
    const dashInput: DashInput = {
      entity: this.playerId,
      dash: this.pendingDash,
      direction:
        this.lastMoveDir.lengthSq() > 0
          ? { x: this.lastMoveDir.x, y: this.lastMoveDir.y }
          : { x: this.heroFacing === 'E' ? 1 : this.heroFacing === 'W' ? -1 : 0, y: this.heroFacing === 'S' ? 1 : this.heroFacing === 'N' ? -1 : 0 }
    };
    this.pendingDash = false;
    return dashSystem(this.world, delta, dashInput);
  }

  private captureTransforms() {
    const snapshot = new Map<EntityId, Vec2>();
    this.world.forEachTransform((entity, transform) => {
      snapshot.set(entity, { x: transform.x, y: transform.y });
    });
    return snapshot;
  }

  private resolveCollisions(previous: Map<EntityId, Vec2>) {
    const apply = (entity: EntityId, radius: number) => {
      const transform = this.world.getTransform(entity);
      if (!transform) return;
      if (this.isBlocked(transform.x, transform.y, radius)) {
        const prev = previous.get(entity);
        if (prev) {
          transform.x = prev.x;
          transform.y = prev.y;
        }
        const velocity = this.world.getVelocity(entity);
        if (velocity) {
          velocity.vx = 0;
          velocity.vy = 0;
        }
      }
    };
    if (this.playerId) {
      apply(this.playerId, 38);
    }
    this.skeletons.forEach((enemy) => apply(enemy.id, 32));
  }

  private isBlocked(x: number, y: number, radius: number) {
    const tile = this.worldToTile(x, y);
    if (!tile) return true;
    if (tile.tx < 1 || tile.tx >= ROOM_WIDTH - 1 || tile.ty < 1 || tile.ty >= ROOM_HEIGHT - 1) {
      return true;
    }
    const offsets: Vec2[] = [
      { x: 0, y },
      { x: x + radius, y },
      { x: x - radius, y },
      { x, y: y + radius },
      { x, y: y - radius }
    ];
    for (const offset of offsets) {
      const t = this.worldToTile(offset.x, offset.y);
      if (!t) return true;
      if (this.wallTiles.has(`${t.tx},${t.ty}`)) return true;
    }
    return this.props.some((prop) => prop.alive && Phaser.Math.Distance.Between(x, y, prop.center.x, prop.center.y) < radius + prop.blockingRadius);
  }

  private syncSprites() {
    if (!this.playerId) return;
    const transform = this.world.getTransform(this.playerId);
    const velocity = this.world.getVelocity(this.playerId);
    if (transform && velocity) {
      this.playerSprite.setPosition(transform.x, transform.y);
      this.playerSprite.setDepth(transform.y + 20);
      this.playerShadow.setPosition(transform.x, transform.y + 18);
      this.heroRing.setPosition(transform.x, transform.y + 15);
      const squish = velocity.vx !== 0 || velocity.vy !== 0 ? 0.9 : 1.05;
      this.playerShadow.setScale(Phaser.Math.Linear(this.playerShadow.scaleX, squish, 0.12), 1);
    }
    this.skeletons.forEach((enemy) => {
      const t = this.world.getTransform(enemy.id);
      const v = this.world.getVelocity(enemy.id);
      if (!t || !v || !enemy.alive) return;
      enemy.sprite.setPosition(t.x, t.y);
      enemy.sprite.setDepth(t.y + 15);
      enemy.ring.setPosition(t.x, t.y + 12);
      const moving = Math.abs(v.vx) > 5 || Math.abs(v.vy) > 5;
      const desiredAnim = moving ? SKELETON_ANIM_KEYS.walk : SKELETON_ANIM_KEYS.idle;
      const facing = moving ? this.directionFromVector(new Phaser.Math.Vector2(v.vx, v.vy)) : enemy.facing;
      enemy.facing = facing;
      const animKey = `skeleton-${desiredAnim}-${facing}`;
      if (enemy.sprite.anims.currentAnim?.key !== animKey && !enemy.sprite.anims.isPlaying) {
        enemy.sprite.play(animKey);
      }
    });
  }

  private updateEnemyBehavior(delta: number) {
    if (!this.playerId) return;
    const playerTransform = this.world.getTransform(this.playerId);
    if (!playerTransform) return;
    const playerHealth = this.world.getHealth(this.playerId);
    const playerVelocity = this.world.getVelocity(this.playerId);
    if (!playerHealth || !playerVelocity) return;

    this.skeletons = this.skeletons.filter((enemy) => {
      const health = this.world.getHealth(enemy.id);
      if (!health || health.current <= 0) {
        if (enemy.alive) {
          enemy.alive = false;
          const anim = `skeleton-${SKELETON_ANIM_KEYS.death}-${enemy.facing}`;
          enemy.sprite.play(anim);
          enemy.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
            enemy.sprite.destroy();
            enemy.ring.destroy();
          });
          this.world.destroyEntity(enemy.id);
          this.killCount += 1;
          const player = this.world.getPlayer(this.playerId!);
          if (player) {
            player.score += 400;
          }
        }
        return false;
      }
      return true;
    });

    this.skeletons.forEach((enemy) => {
      const transform = this.world.getTransform(enemy.id);
      const velocity = this.world.getVelocity(enemy.id);
      if (!transform || !velocity) return;
      const dx = playerTransform.x - transform.x;
      const dy = playerTransform.y - transform.y;
      const distance = Math.hypot(dx, dy);
      enemy.attackTimer = Math.max(0, enemy.attackTimer - delta);
      if (distance < 360 && enemy.alive) {
        const dirX = dx / Math.max(1, distance);
        const dirY = dy / Math.max(1, distance);
        velocity.vx = dirX * ENEMY_SPEED;
        velocity.vy = dirY * ENEMY_SPEED;
        enemy.facing = this.directionFromVector(new Phaser.Math.Vector2(dirX, dirY));
        if (distance < 90 && enemy.attackTimer === 0) {
          enemy.attackTimer = ENEMY_ATTACK_COOLDOWN;
          velocity.vx = 0;
          velocity.vy = 0;
          const animKey = `skeleton-${SKELETON_ANIM_KEYS.attack}-${enemy.facing}`;
          enemy.sprite.play(animKey);
          enemy.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
            if (Phaser.Math.Distance.Between(playerTransform.x, playerTransform.y, transform.x, transform.y) < 120) {
              playerHealth.current = Math.max(0, playerHealth.current - ENEMY_ATTACK_DAMAGE);
              playerVelocity.vx -= dirX * 60;
              playerVelocity.vy -= dirY * 60;
            }
          });
        }
      } else {
        velocity.vx *= 0.9;
        velocity.vy *= 0.9;
      }
    });
  }

  private updateLootCollection() {
    if (!this.playerId) return;
    const playerTransform = this.world.getTransform(this.playerId);
    if (!playerTransform) return;
    this.loot = this.loot.filter((loot) => {
      if (loot.collected) {
        loot.sprite.destroy();
        loot.indicator.destroy();
        loot.glint.destroy();
        return false;
      }
      if (Phaser.Math.Distance.Between(playerTransform.x, playerTransform.y, loot.sprite.x, loot.sprite.y) < 90) {
        loot.collected = true;
        const player = this.world.getPlayer(this.playerId!);
        if (player) {
          player.score += 200;
        }
        this.createSwooshEffect({ x: loot.sprite.x, y: loot.sprite.y - 20 });
        return false;
      }
      return true;
    });
  }

  private performAttack() {
    if (!this.playerId) return;
    const transform = this.world.getTransform(this.playerId);
    if (!transform) return;

    this.heroAttacking = true;
    const animKey = `hero-${HERO_ANIM_KEYS.attack}-${this.heroFacing}`;
    this.playerSprite.play(animKey);
    this.playerSprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      this.heroAttacking = false;
    });

    const pointer = this.input.activePointer;
    const aim = new Phaser.Math.Vector2(pointer.worldX - transform.x, pointer.worldY - transform.y);
    if (aim.lengthSq() === 0 && this.lastMoveDir.lengthSq() > 0) {
      aim.copy(this.lastMoveDir);
    }
    if (aim.lengthSq() === 0) {
      aim.set(this.heroFacing === 'E' ? 1 : this.heroFacing === 'W' ? -1 : 0, this.heroFacing === 'S' ? 1 : -1);
    }
    aim.normalize();

    const reach = 120;
    const radius = 70;
    const center = new Phaser.Math.Vector2(transform.x + aim.x * reach, transform.y + aim.y * reach);
    const hitCircle = new Phaser.Geom.Circle(center.x, center.y, radius);
    this.createSwooshEffect(center);

    this.skeletons.forEach((enemy) => {
      if (!enemy.alive) return;
      const enemyTransform = this.world.getTransform(enemy.id);
      const enemyHealth = this.world.getHealth(enemy.id);
      if (!enemyTransform || !enemyHealth) return;
      if (Phaser.Geom.Circle.Contains(hitCircle, enemyTransform.x, enemyTransform.y)) {
        enemyHealth.current = Math.max(0, enemyHealth.current - HERO_ATTACK_DAMAGE);
        enemy.sprite.setTintFill(0xffffff);
        this.time.delayedCall(120, () => enemy.sprite.clearTint());
        const velocity = this.world.getVelocity(enemy.id);
        if (velocity) {
          velocity.vx += aim.x * 160;
          velocity.vy += aim.y * 160;
        }
      }
    });

    this.props.forEach((prop) => {
      if (!prop.alive) return;
      if (Phaser.Geom.Circle.Contains(hitCircle, prop.center.x, prop.center.y)) {
        prop.hp -= HERO_ATTACK_DAMAGE;
        if (prop.hp <= 0) {
          this.breakProp(prop);
        }
      }
    });

    this.attackCooldown = HERO_ATTACK_COOLDOWN;
  }

  private breakProp(prop: PropActor) {
    prop.alive = false;
    prop.ring?.destroy();
    if (prop.breakAnim) {
      prop.sprite.play(prop.breakAnim);
      prop.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        prop.sprite.destroy();
      });
    } else {
      prop.sprite.destroy();
    }
    if (prop.loot === 'gold') {
      this.createLoot(prop.center);
    }
  }

  private spawnDashAfterimage() {
    if (!this.playerSprite || !this.dashAfterimages) return;
    const frameName = this.playerSprite.frame.texture.key;
    const image = this.add.sprite(this.playerSprite.x, this.playerSprite.y, frameName).setAlpha(0.5);
    image.setDepth(this.playerSprite.depth - 1);
    image.setScale(this.playerSprite.scale);
    image.setBlendMode(Phaser.BlendModes.ADD);
    this.dashAfterimages.add(image);
    this.tweens.add({
      targets: image,
      alpha: 0,
      duration: 200,
      onComplete: () => image.destroy()
    });
  }

  private updateHeroAnimation() {
    if (this.heroAttacking) return;
    const moving = this.movementInput.lengthSq() > 0.01;
    const anim = moving ? HERO_ANIM_KEYS.walk : HERO_ANIM_KEYS.idle;
    const key = `hero-${anim}-${this.heroFacing}`;
    if (this.playerSprite.anims.currentAnim?.key !== key) {
      this.playerSprite.play(key, true);
    }
  }

  private updateUIState() {
    if (!this.playerId) return;
    const player = this.world.getPlayer(this.playerId) as Player | undefined;
    const health = this.world.getHealth(this.playerId);
    const score = player?.score ?? this.killCount * 250;
    this.scoreText.setText(`Kills ${this.killCount}  •  Score ${score}`);
    if (health) {
      this.hpText.setText(`HP ${Math.max(0, Math.ceil(health.current))}/${health.max}`);
      this.drawHpBar(health.current / health.max);
    }
  }

  private drawHpBar(ratio: number) {
    const width = 240;
    const height = 16;
    this.hpBarBg.clear();
    this.hpBarBg.fillStyle(0x0c1b27, 0.8);
    this.hpBarBg.fillRoundedRect(0, 0, width, height, 8);
    this.hpBarFill.clear();
    const clamped = Phaser.Math.Clamp(ratio, 0, 1);
    const color = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(0xff6363),
      Phaser.Display.Color.ValueToColor(0x8affda),
      100,
      Math.floor(clamped * 100)
    );
    const fillColor = Phaser.Display.Color.GetColor(color.r, color.g, color.b);
    this.hpBarFill.fillStyle(fillColor, 1);
    this.hpBarFill.fillRoundedRect(0, 0, width * clamped, height, 8);
  }

  private resizeVignette() {
    if (!this.vignetteSprite) return;
    const { width, height } = this.scale.gameSize;
    this.vignetteSprite.setPosition(width / 2, height / 2);
    const scale = Math.max(width / this.vignetteSprite.width, height / this.vignetteSprite.height) * 1.3;
    this.vignetteSprite.setScale(scale);
  }

  private tileToWorld(tx: number, ty: number): Vec2 {
    return this.isoToWorld(tx, ty);
  }

  private isoToWorld(tx: number, ty: number): Vec2 {
    const x = (tx - ty) * HALF_TILE_WIDTH + ROOM_ORIGIN_X;
    const y = (tx + ty) * HALF_TILE_HEIGHT + ROOM_ORIGIN_Y;
    return { x, y };
  }

  private worldToTile(x: number, y: number) {
    const relX = x - ROOM_ORIGIN_X;
    const relY = y - ROOM_ORIGIN_Y;
    const tx = (relY / HALF_TILE_HEIGHT + relX / HALF_TILE_WIDTH) / 2;
    const ty = (relY / HALF_TILE_HEIGHT - relX / HALF_TILE_WIDTH) / 2;
    if (Number.isNaN(tx) || Number.isNaN(ty)) return null;
    return { tx: Math.round(tx), ty: Math.round(ty) };
  }

  private directionFromVector(vec: Phaser.Math.Vector2): DirectionKey {
    if (Math.abs(vec.x) > Math.abs(vec.y)) {
      return vec.x >= 0 ? 'E' : 'W';
    }
    return vec.y >= 0 ? 'S' : 'N';
  }

  private isKeyDown(key: 'w' | 'a' | 's' | 'd') {
    return this.wasd[key].isDown;
  }

  private endRun() {
    if (this.ended) return;
    this.ended = true;
    const player = this.playerId ? (this.world.getPlayer(this.playerId) as Player | undefined) : undefined;
    const score = player?.score ?? this.killCount * 250;
    GameScene.handlers?.onGameOver(Math.max(0, Math.floor(score)));
    this.scene.pause();
  }
}
