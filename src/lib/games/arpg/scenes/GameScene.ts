import Phaser from 'phaser';
import type { TownStatus } from '../main';
import { arpgViewportLayout, ARPG_DESKTOP_ZOOM } from '../viewportLayout';
import { HERO_MANIFEST, SKELETON_MANIFEST, type CharacterManifest, type DirectionKey } from '../assets/manifest';
import { createTownCorner, TOWN_RUNTIME_ASSETS, TOWN_CORNER_LAYOUT, type TownCorner } from '../assets/townCorner';
import { World, type EntityId, type Player, type Vec2 } from '../ecs/components';
import { dashSystem, movementSystem, type DashInput } from '../ecs/systems';

import { AREAS, createExpedition, enterRuins, recordKill, collectGold, returnToTown, advanceArea, canAdvance, heroLevel, heroMaxHp, heroDamage } from '../expedition';

const MAX_RUN_MS = 90_000;
const TILE_WIDTH = 128;
const TILE_HEIGHT = 64;
const HALF_TILE_WIDTH = TILE_WIDTH / 2;
const HALF_TILE_HEIGHT = TILE_HEIGHT / 2;
const TILE_IMAGE_SIZE = 256;
const TILE_SCALE = TILE_WIDTH / TILE_IMAGE_SIZE;
const ROOM_WIDTH = 28;
const ROOM_HEIGHT = 18;
const ROOM_ORIGIN_X = ROOM_HEIGHT * HALF_TILE_WIDTH;
const ROOM_ORIGIN_Y = -200;
// Floor PNGs overlap neighboring cells. Keep their entire y-sorted range below
// all room actors/markers, rather than letting foreground floor rows cover them.
const FLOOR_DEPTH_OFFSET = -(ROOM_WIDTH + ROOM_HEIGHT) * HALF_TILE_HEIGHT;
const CAMERA_ZOOM = ARPG_DESKTOP_ZOOM;
const CAMERA_PADDING = 140;
const HERO_SPEED = 220;
const ENEMY_SPEED = 135;
const HERO_MAX_HP = 140;
const ENEMY_HP = 45;
const HERO_ATTACK_COOLDOWN = 320;
const ENEMY_ATTACK_COOLDOWN = 1_050;
const ENEMY_ATTACK_RANGE = 85;
const ENEMY_ATTACK_DAMAGE = 12;
const DASH_COOLDOWN = 700;
const DASH_POWER = 230;
const ATTACK_RANGE_OFFSET = 110;
const ATTACK_RADIUS = 85;

type GameHandlers = {
  onGameOver: (score: number, durationMs?: number) => void;
  onDepartureRequested?: () => void;
  onRetryRequested?: () => void;
  onReady: () => void;
  onError: (error: Error) => void;
  isCurrent: () => boolean;
};

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

const FLOOR_TEXTURES = [
  '/games/arpg/tiles/ground_stone1.png',
  '/games/arpg/tiles/ground_variation1.png',
  '/games/arpg/tiles/ground_variation2.png'
];

const WALL_TEXTURES = [
  '/games/arpg/tiles/wall1/N/wall1_N_90.0_0.png',
  '/games/arpg/tiles/wall2/N/wall2_N_90.0_0.png',
  '/games/arpg/tiles/wall3/N/wall3_N_90.0_0.png'
];

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

const SCENERY_TEXTURES = [
  '/games/arpg/props/bones1/S/bones1_S_270.0_0.png',
  '/games/arpg/props/bones2/S/bones2_S_270.0_0.png',
  '/games/arpg/props/bones3/S/bones3_S_270.0_0.png',
  '/games/arpg/props/rocks/S/rocks_S_270.0_0.png',
  '/games/arpg/props/mushrooms/S/mushrooms_S_270.0_0.png',
  '/games/arpg/props/torch/N/torch_N_90.0_0.png'
] as const;

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
  private expedition = createExpedition();
  private expeditionActive = false;
  private durationLimit = MAX_RUN_MS;
  private expeditionStartedAt = 0;
  private townStatus: TownStatus = 'ready';
  private townMessage = '';
  private areaEpoch = 0;
  private interactKey?: Phaser.Input.Keyboard.Key;
  private areaText!: Phaser.GameObjects.Text;
  private portalText!: Phaser.GameObjects.Text;
  private startupFailed = false;
  private initialized = false;
  private readonly requiredTextures = new Set<string>();
  private townCorner: TownCorner | null = null;

  private clearTownCorner = () => {
    this.townCorner?.destroy();
    this.townCorner = null;
  };

  private readonly handleLoadError = () => {
    this.failStartup(new Error('Game assets could not be loaded. Please start a new run.'));
  };

  private failStartup(error: unknown) {
    if (this.startupFailed || this.initialized || !this.handlers.isCurrent()) return;
    this.startupFailed = true;
    this.clearTownCorner();
    this.ended = true;
    this.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, this.handleLoadError);
    this.handlers.onError(error instanceof Error ? error : new Error('Game initialization failed.'));
  }

  private world!: World;
  private worldLayer!: Phaser.GameObjects.Layer;
  private uiCamera?: Phaser.Cameras.Scene2D.Camera;
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
  private heroFacingVec = new Phaser.Math.Vector2(0, 1);
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
  private hudPanel!: Phaser.GameObjects.Rectangle;
  private controlPanel!: Phaser.GameObjects.Rectangle;
  private compactHUD = false;
  private viewportLayoutKey = '';
  private hpBarSize = { width: 240, height: 16 };
  private controlContainer!: Phaser.GameObjects.Container;
  private primaryControl!: Phaser.GameObjects.Text;
  private secondaryControl!: Phaser.GameObjects.Text;
  private controlStatus!: Phaser.GameObjects.Text;
  private vignetteSprite?: Phaser.GameObjects.Image;

  private wallTiles = new Set<string>();
  private props: PropActor[] = [];
  private loot: LootActor[] = [];
  private skeletons: EnemyActor[] = [];
  private roomBounds = { minX: -800, maxX: 800, minY: -800, maxY: 800 };
  private runState: 'idle' | 'running' | 'paused' = 'idle';
  private readonly hudMargin = { x: 36, y: 32 };
  private readonly controlOffset = { x: 36, y: 210 };

  constructor(private readonly handlers: GameHandlers) {
    super({ key: 'GameScene' });
  }

  preload() {
    if (!this.handlers.isCurrent() || this.startupFailed) return;
    this.load.once(Phaser.Loader.Events.FILE_LOAD_ERROR, this.handleLoadError);
    try {
      this.queueAssets();
    } catch (error) {
      this.failStartup(error);
    }
  }

  private queueImage(key: string, path: string) {
    this.requiredTextures.add(key);
    this.load.image(key, path);
  }

  private queueAssets() {
    FLOOR_TEXTURES.forEach((path, idx) => this.queueImage(`floor_${idx}`, path));
    WALL_TEXTURES.forEach((path, idx) => this.queueImage(`wall_${idx}`, path));
    this.preloadPropTextures();
    this.preloadCharacterManifest(HERO_MANIFEST);
    this.preloadCharacterManifest(SKELETON_MANIFEST);
    Object.entries(UI_TEXTURES).forEach(([key, path]) => this.queueImage(key, path));
    VFX_TEXTURES.swoosh.forEach((path, idx) => this.queueImage(`vfx_swoosh_${idx}`, path));
    VFX_TEXTURES.glint.forEach((path, idx) => this.queueImage(`vfx_glint_${idx}`, path));
    this.queueImage('vfx_glow', '/games/arpg/vfx/glow.png');
    this.queueImage('vfx_zone', '/games/arpg/vfx/zone.png');
    Object.values(TOWN_RUNTIME_ASSETS).forEach(({ key, url }) => this.queueImage(key, url));
  }

  create() {
    if (!this.handlers.isCurrent() || this.startupFailed) return;
    this.load.off(Phaser.Loader.Events.FILE_LOAD_ERROR, this.handleLoadError);
    try {
      // Phaser loaderror covers download failures but not every image decode
      // failure. Its loader can complete without adding the failed texture.
      if ([...this.requiredTextures].some((key) => !this.textures.exists(key))) {
        throw new Error('Game assets could not be loaded. Please start a new run.');
      }
      this.initializeScene();
      // Phaser emits CREATE only after create() returns and the scene is running.
      // This is scene initialization evidence, not a first-render guarantee.
      this.events.once(Phaser.Scenes.Events.CREATE, () => {
        if (!this.handlers.isCurrent() || this.startupFailed) return;
        this.initialized = true;
        this.handlers.onReady();
      });
    } catch (error) {
      this.failStartup(error);
    }
  }

  private initializeScene() {
    const releaseTownCorner = () => {
      this.clearTownCorner();
      this.events.off(Phaser.Scenes.Events.SHUTDOWN, releaseTownCorner);
      this.events.off(Phaser.Scenes.Events.DESTROY, releaseTownCorner);
    };
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, releaseTownCorner);
    this.events.once(Phaser.Scenes.Events.DESTROY, releaseTownCorner);
    this.cameras.main.setBackgroundColor(0x05060a);
    this.world = new World();
    this.worldLayer = this.add.layer();
    this.resetState();
    this.buildDungeonRoom();
    this.registerCharacterAnimations('hero', HERO_MANIFEST);
    this.registerCharacterAnimations('skeleton', SKELETON_MANIFEST);
    this.setupPlayer();
    this.setupInput();
    this.setupUI();
    this.buildAreaContent();
    this.createOverlays();
    this.setupUICamera();
    this.updateFixedUITransforms();
  }

  update(_time: number, delta: number) {
    if (!this.initialized || !this.handlers.isCurrent() || this.ended || !this.playerId) return;
    if (this.expeditionActive) {
      this.elapsed = Math.min(this.durationLimit, Math.max(0, performance.now() - this.expeditionStartedAt));
      if (this.elapsed >= this.durationLimit) {
        this.endRun();
        return;
      }
    }

    if (this.runState !== 'running') {
      this.updateUIState();
      return;
    }

    this.attackCooldown = Math.max(0, this.attackCooldown - delta);

    const health = this.world.getHealth(this.playerId);
    if (!health || health.current <= 0) {
      this.changeArea(returnToTown(this.expedition, true));
      return;
    }

    if (this.interactKey && Phaser.Input.Keyboard.JustDown(this.interactKey)) this.interactWithPortal();
    this.handleInput();
    const snapshots = this.captureTransforms();
    const dashResult = this.handleDash(delta);
    movementSystem(this.world, delta);
    this.resolveCollisions(snapshots);
    this.syncSprites();
    if (this.expedition.area !== 0) this.updateEnemyBehavior(delta);
    this.updateLootCollection();

    if (this.expedition.area !== 0 && this.pointerAttack && this.attackCooldown <= 0 && !this.heroAttacking) {
      this.performAttack();
    }

    if (dashResult?.activated) {
      this.spawnDashAfterimage();
    }
    this.updateUIState();
    this.updateFixedUITransforms();
  }

  private resetState() {
    this.viewportLayoutKey = '';
    this.compactHUD = false;
    this.hpBarSize = { width: 240, height: 16 };
    this.previousPositions.clear();
    this.killCount = 0;
    this.attackCooldown = 0;
    this.pendingDash = false;
    this.heroAttacking = false;
    this.heroFacing = 'S';
    this.heroFacingVec.set(0, 1);
    this.wallTiles.clear();
    this.props = [];
    this.loot = [];
    this.skeletons = [];
    this.ended = false;
    this.elapsed = 0;
    this.runState = 'running';
    this.expedition = createExpedition();
  }

  private preloadPropTextures() {
    Object.entries(PROP_TEXTURES).forEach(([key, value]) => {
      if (typeof value === 'string') {
        this.queueImage(key, value);
      } else {
        Array.from(value).forEach((path, idx) => this.queueImage(`${key}_${idx}`, path));
      }
    });
    SCENERY_TEXTURES.forEach((path, idx) => {
      this.queueImage(`scenery_${idx}`, path);
    });
  }

  private preloadCharacterManifest(manifest: CharacterManifest) {
    Object.values(manifest).forEach((framesByDir) => {
      Object.values(framesByDir).forEach((frames) => {
        frames.forEach((path) => {
          const key = frameKeyFromPath(path);
          if (!this.textures.exists(key)) {
            this.queueImage(key, path);
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
    // Rebuilding resets the camera, even when viewport and area are unchanged.
    this.viewportLayoutKey = '';
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;

    const recordBounds = (world: Vec2, heightOffset = 0) => {
      minX = Math.min(minX, world.x - HALF_TILE_WIDTH);
      maxX = Math.max(maxX, world.x + HALF_TILE_WIDTH);
      minY = Math.min(minY, world.y - HALF_TILE_HEIGHT + heightOffset);
      maxY = Math.max(maxY, world.y + HALF_TILE_HEIGHT + heightOffset);
    };

    for (let ty = 0; ty < ROOM_HEIGHT; ty++) {
      for (let tx = 0; tx < ROOM_WIDTH; tx++) {
        const pos = this.isoToWorld(tx, ty);
        const isBorder =
          tx === 0 || ty === 0 || tx === ROOM_WIDTH - 1 || ty === ROOM_HEIGHT - 1;
        const isPillar = this.expedition.area === 1
          ? tx === 8 && ty >= 3 && ty <= 5
          : this.expedition.area === 2 && ((tx === 10 && ty >= 11 && ty <= 14) || (tx === 20 && ty >= 5 && ty <= 7));
        if (isBorder || isPillar) {
          const texture = `wall_${Phaser.Math.Between(0, WALL_TEXTURES.length - 1)}`;
          const wall = this.add.image(pos.x, pos.y - 42, texture);
          wall.setScale(TILE_SCALE);
          wall.setDepth(pos.y + 160);
          this.addToWorld(wall);
          this.wallTiles.add(`${tx},${ty}`);
          recordBounds(pos, 70);
        } else {
          // Town uses one continuous, clipped surface. Keep the same cell
          // bounds and collision loop; dungeon floor rendering is unchanged.
          if (this.expedition.area !== 0) {
            const texture = `floor_${Phaser.Math.Between(0, FLOOR_TEXTURES.length - 1)}`;
            const tile = this.add.image(pos.x, pos.y, texture);
            tile.setScale(TILE_SCALE);
            tile.setTint(AREAS[this.expedition.area].tint);
            tile.setDepth(FLOOR_DEPTH_OFFSET + pos.y);
            this.addToWorld(tile);
          }
          recordBounds(pos);
        }
      }
    }

    this.roomBounds = { minX, maxX, minY, maxY };
    const cam = this.cameras.main;
    cam.setZoom(CAMERA_ZOOM);
    cam.setBounds(
      this.roomBounds.minX - CAMERA_PADDING,
      this.roomBounds.minY - CAMERA_PADDING,
      this.roomBounds.maxX - this.roomBounds.minX + CAMERA_PADDING * 2,
      this.roomBounds.maxY - this.roomBounds.minY + CAMERA_PADDING * 2
    );
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
    // The 68 measured idle/walk/attack PNGs place their feet around y=130 on a
    // 256px canvas. Use one centered ground pivot across poses; anchoring to the
    // canvas bottom floats the hero, while per-frame bounds would jitter.
    this.playerSprite.setOrigin(0.5, 0.5);
    this.playerSprite.setDepth(spawn.y + 20);
    this.playerSprite.play(`hero-${HERO_ANIM_KEYS.idle}-S`);
    this.addToWorld(this.playerSprite);

    this.playerShadow = this.add.ellipse(spawn.x, spawn.y, 32, 14, 0x000000, 0.28);
    this.playerShadow.setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.playerShadow.setDepth(spawn.y - 5);
    this.addToWorld(this.playerShadow);

    this.heroRing = this.add.image(spawn.x, spawn.y, 'ringBlue');
    // Its 256px canvas contains only a 27x20px opaque ring. Scale that visible
    // footprint to about 32x16 world pixels, rather than shrinking the padding.
    this.heroRing.setScale(1.2, 0.8);
    // The existing blue selection asset should identify the hero, not multiply
    // another dark patch into the floor. Draw it above the shadow, below the hero.
    this.heroRing.setAlpha(0.75);
    this.heroRing.setBlendMode(Phaser.BlendModes.NORMAL);
    this.heroRing.setDepth(spawn.y - 4);
    this.addToWorld(this.heroRing);

    this.cameras.main.startFollow(this.playerSprite, true, 0.12, 0.12);

    this.dashAfterimages = this.add.group();
  }

  private setupInput() {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;
    this.interactKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    this.cursors = keyboard.createCursorKeys();
    this.wasd = {
      w: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      a: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      s: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      d: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D)
    };
    this.dashKeys = [
      keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE),
      keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SHIFT)
    ];
    keyboard.addCapture(this.dashKeys.map((key) => key.keyCode));

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
    this.input.setDefaultCursor('url(/games/arpg/ui/cursor/cursor_gauntlet_blue.png) 8 2, pointer');
  }

  private setupUI() {
    this.uiContainer = this.add.container(this.hudMargin.x, this.hudMargin.y);
    this.uiContainer.setScrollFactor(0);
    this.uiContainer.setDepth(2000);
    const panel = this.add.rectangle(0, 0, 440, 180, 0x050c18, 0.65).setOrigin(0);
    this.hudPanel = panel;
    panel.setStrokeStyle(1, 0x0e2244, 0.4);
    this.instructionsText = this.add
      .text(
        16,
        12,
        'WASD move · Space dash · Click attack\nE at the gate · Gold and levels last this run',
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
    this.areaText = this.add.text(16, 145, '', { fontFamily: 'Space Grotesk, sans-serif', fontSize: '14px', color: '#f4d59b' });
    this.uiContainer.add([panel, this.instructionsText, this.scoreText, this.hpText, this.hpBarBg, this.hpBarFill, this.areaText]);
    this.createControlButtons();
  }

  private createOverlays() {
    this.vignetteSprite = this.add
      .image(0, 0, 'vignette')
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(2500);
    this.addToWorld(this.vignetteSprite);
    this.resizeVignette();
    this.scale.on('resize', () => this.updateFixedUITransforms());
  }

  private createControlButtons() {
    this.controlContainer = this.add.container(this.controlOffset.x, this.controlOffset.y);
    this.controlContainer.setScrollFactor(0);
    this.controlContainer.setDepth(2000);
    const panel = this.add.rectangle(0, 0, 360, 72, 0x040912, 0.55).setOrigin(0);
    this.controlPanel = panel;
    this.controlStatus = this.add.text(16, 10, 'Status: Waiting', {
      fontFamily: 'Space Grotesk, sans-serif',
      fontSize: '14px',
      color: '#b8d4ff'
    });
    this.primaryControl = this.createUIButton(16, 34, 'Enter ruins', () => this.handlePrimaryControl());
    this.secondaryControl = this.createUIButton(190, 34, 'Finish visit', () => this.handleReturnControl());
    this.secondaryControl.setAlpha(0.7);
    this.controlContainer.add([panel, this.controlStatus, this.primaryControl, this.secondaryControl]);
    this.updateControlButtons();
  }

  private createUIButton(x: number, y: number, label: string, handler: () => void) {
    const button = this.add.text(x, y, label, {
      fontFamily: 'Space Grotesk, sans-serif',
      fontSize: '16px',
      color: '#f0f4ff',
      backgroundColor: '#1c2750',
      padding: { left: 10, right: 10, top: 4, bottom: 4 }
    });
    button.setInteractive({ useHandCursor: true });
    button.on('pointerup', handler);
    button.on('pointerover', () => button.setAlpha(1));
    button.on('pointerout', () => button.setAlpha(0.85));
    button.setAlpha(0.85);
    // The caller inserts the background first, then the controls.
    return button;
  }

  private updateFixedUITransforms() {
    if (!this.uiContainer || !this.controlContainer) return;
    const key = `${this.scale.width}x${this.scale.height}:${this.expedition.area}`;
    if (key === this.viewportLayoutKey) return;
    this.viewportLayoutKey = key;
    const layout = arpgViewportLayout(this.scale.width, this.scale.height, this.expedition.area === 0);
    this.compactHUD = layout.compact;
    this.uiContainer.setScale(1).setPosition(layout.hud.x, layout.hud.y);
    this.controlContainer.setScale(1).setPosition(layout.controls.x, layout.controls.y);
    this.hudPanel.setSize(layout.hud.width, layout.hud.height);
    this.controlPanel.setSize(layout.controls.width, layout.controls.height);
    this.instructionsText.setVisible(!layout.compact);
    this.scoreText.setPosition(layout.compact ? 8 : 16, layout.compact ? 5 : 58)
      .setFontSize(layout.compact ? 12 : 20).setWordWrapWidth(layout.compact ? layout.hud.width - 16 : 0).setMaxLines(layout.compact ? 1 : 0);
    this.hpText.setPosition(layout.compact ? 8 : 16, layout.compact ? 25 : 98).setFontSize(layout.compact ? 11 : 16);
    this.hpBarSize = layout.compact ? { width: 52, height: 8 } : { width: 240, height: 16 };
    this.hpBarBg.setPosition(layout.compact ? 76 : 16, layout.compact ? 29 : 120);
    this.hpBarFill.setPosition(layout.compact ? 76 : 16, layout.compact ? 29 : 120);
    this.areaText.setPosition(layout.compact ? 140 : 16, layout.compact ? 25 : 145)
      .setFontSize(layout.compact ? 11 : 14).setWordWrapWidth(layout.compact ? Math.max(1, layout.hud.width - 148) : 0).setMaxLines(layout.compact ? 1 : 0);
    this.controlStatus.setPosition(layout.compact ? 8 : 16, layout.compact ? 5 : 10)
      .setFontSize(layout.compact ? 11 : 14).setWordWrapWidth(layout.compact ? layout.controls.width - 16 : 0).setMaxLines(layout.compact ? 1 : 0);
    this.primaryControl.setPosition(layout.compact ? 8 : 16, layout.compact ? 25 : 34);
    this.secondaryControl.setPosition(layout.compact ? Math.floor(layout.controls.width / 2) + 4 : 190, layout.compact ? 25 : 34);
    for (const button of [this.primaryControl, this.secondaryControl]) {
      button.setFontSize(layout.compact ? 12 : 16).setPadding(layout.compact ? 8 : 10, 4)
        .setWordWrapWidth(layout.compact ? Math.max(1, layout.controls.width / 2 - 24) : 0).setMaxLines(layout.compact ? 1 : 0);
    }
    this.uiCamera?.setSize(layout.width, layout.height);
    const camera = this.cameras.main;
    camera.setZoom(layout.camera.zoom);
    // Keep the compact entrance prompt readable while its art remains at world
    // scale. Only resize on layout changes, never rerasterize it every frame.
    if (this.portalText) this.portalText.setScale(this.expedition.area === 0 && layout.compact ? 1 / layout.camera.zoom : 1);
    camera.setFollowOffset(layout.camera.offsetX, layout.camera.offsetY);
    if (this.playerSprite) {
      camera.centerOn(this.playerSprite.x - layout.camera.offsetX, this.playerSprite.y - layout.camera.offsetY);
    }
    this.resizeVignette();
    this.updateUIState();
  }

  private setupUICamera() {
    if (!this.uiContainer || !this.controlContainer) return;
    this.uiCamera?.destroy();
    const main = this.cameras.main;
    main.ignore([this.uiContainer, this.controlContainer]);
    const width = this.scale.width;
    const height = this.scale.height;
    this.uiCamera = this.cameras.add(0, 0, width, height);
    this.uiCamera.setScroll(0, 0);
    this.uiCamera.setZoom(1);
    this.uiCamera.ignore(this.worldLayer);
  }

  private handlePrimaryControl() {
    if (this.expedition.area === 0) {
      if (this.townStatus === 'retry') this.handlers.onRetryRequested?.();
      else if (this.townStatus === 'ready') this.handlers.onDepartureRequested?.();
    } else if (canAdvance(this.expedition)) {
      this.changeArea(advanceArea(this.expedition));
    } else if (this.runState === 'running') this.pauseGameplay();
    else this.resumeGameplay();
  }

  private handleReturnControl() {
    if (this.expedition.area === 0) this.handlePrimaryControl();
    else this.changeArea(returnToTown(this.expedition));
  }

  /** Called only after the route has acquired a current server session. */
  beginExpedition(maxDurationMs: number) {
    if (!this.initialized || !this.handlers.isCurrent() || this.expeditionActive || this.expedition.area !== 0) return;
    if (!Number.isSafeInteger(maxDurationMs) || maxDurationMs <= 0) throw new Error('Invalid expedition duration.');
    this.durationLimit = Math.min(MAX_RUN_MS, Math.floor(maxDurationMs));
    this.elapsed = 0;
    this.expeditionStartedAt = performance.now();
    this.killCount = 0;
    this.expeditionActive = true;
    this.townStatus = 'starting';
    this.townMessage = '';
    if (this.playerId) this.world.tagPlayer(this.playerId, { score: 0 });
    // Each authorized departure starts a new run-local character, not account progression.
    this.expedition = createExpedition();
    if (this.playerId) this.world.setHealth(this.playerId, { current: HERO_MAX_HP, max: HERO_MAX_HP });
    this.changeArea(enterRuins(this.expedition));
  }

  setTownStatus(status: TownStatus, message = '') {
    if (!this.handlers.isCurrent()) return;
    this.townStatus = status;
    this.townMessage = message;
    this.updateUIState();
  }

  private interactWithPortal() {
    if (!this.playerId || this.runState !== 'running') return;
    const pos = this.world.getTransform(this.playerId);
    const gate = this.isoToWorld(18, 9);
    if (!pos || Math.hypot(pos.x - gate.x, pos.y - gate.y) > 150) return;
    if (this.expedition.area === 0 || canAdvance(this.expedition)) this.handlePrimaryControl();
  }

  private changeArea(next: ReturnType<typeof createExpedition>) {
    if (next === this.expedition || this.ended) return;
    if (this.hasExpeditionExpired()) {
      next = returnToTown(this.expedition, true);
    }
    const score = this.playerId ? this.world.getPlayer(this.playerId)?.score ?? 0 : 0;
    const hp = this.playerId ? this.world.getHealth(this.playerId)?.current ?? HERO_MAX_HP : HERO_MAX_HP;
    this.areaEpoch += 1;
    this.time.removeAllEvents();
    this.time.clearPendingEvents();
    this.tweens.killAll();
    this.clearTownCorner();
    // Layer.removeAll(true) skips removal callbacks; it does NOT destroy children.
    for (const child of [...this.worldLayer.list]) {
      if (child !== this.vignetteSprite) child.destroy();
    }
    this.dashAfterimages?.destroy(true);
    this.world = new World();
    this.wallTiles.clear();
    this.props = []; this.loot = []; this.skeletons = [];
    this.pointerAttack = false; this.heroAttacking = false; this.attackCooldown = 0;
    this.expedition = next;
    this.runState = 'running';
    this.buildDungeonRoom();
    this.setupPlayer();
    this.world.tagPlayer(this.playerId!, { score });
    this.world.setHealth(this.playerId!, { max: heroMaxHp(next.xp), current: next.area === 0 ? heroMaxHp(next.xp) : hp });
    this.buildAreaContent();
    this.resizeVignette();
    this.updateControlButtons();
    this.updateUIState();
    this.updateFixedUITransforms();
    if (next.area === 0 && this.expeditionActive) this.finishExpedition();
  }

  private buildAreaContent() {
    if (this.expedition.area !== 0) {
      this.spawnSkeletons();
      this.createProps();
    } else {
      this.townCorner = createTownCorner(
        this, image => this.addToWorld(image), (tx, ty) => this.isoToWorld(tx, ty),
        FLOOR_DEPTH_OFFSET + this.roomBounds.maxY + 1
      );

    }
    const gate = this.isoToWorld(18, 9);
    if (this.expedition.area !== 0) this.addToWorld(this.add.ellipse(gate.x, gate.y, 150, 65, 0x73d8dd, 0.65).setDepth(gate.y + 1));
    const town = this.expedition.area === 0;
    this.portalText = this.add.text(gate.x, gate.y + (town ? TOWN_CORNER_LAYOUT.entranceLabelOffsetY : -75), '', town
      ? { fontSize: '13px', fontFamily: 'Arial, sans-serif', color: '#fff0cc', backgroundColor: '#17202b', align: 'center', padding: { x: 5, y: 3 } }
      : { fontSize: '16px', color: '#c9ffff', backgroundColor: '#102031', align: 'center' }).setOrigin(0.5).setDepth(gate.y + 160);
    this.addToWorld(this.portalText);
  }

  private pauseGameplay() {
    this.runState = 'paused';
    this.pointerAttack = false;
    this.playerSprite.anims.pause();
    this.skeletons.forEach((enemy) => enemy.sprite.anims.pause());
    this.updateControlButtons();
  }

  private resumeGameplay() {
    this.runState = 'running';
    this.playerSprite.anims.resume();
    this.skeletons.forEach((enemy) => enemy.sprite.anims.resume());
    this.updateControlButtons();
  }

  private updateControlButtons() {
    if (!this.primaryControl || !this.controlStatus) return;
    const town = this.expedition.area === 0;
    const townLabel = this.townStatus === 'ready' ? 'Enter ruins' : this.townStatus === 'retry' ? 'Retry saving' : this.townStatus === 'starting' ? 'Starting…' : this.townStatus === 'saving' ? 'Saving…' : 'Unavailable';
    this.primaryControl.setText(town ? townLabel : canAdvance(this.expedition) ? (this.expedition.area === 1 ? 'Descend' : this.compactHUD ? 'Return home' : 'Return victorious') : this.runState === 'running' ? 'Pause' : 'Resume');
    this.secondaryControl.setText(town ? '' : this.compactHUD ? 'Retreat' : 'Return to town');
    this.secondaryControl.setVisible(!town);
    const seconds = Math.max(0, Math.ceil((this.durationLimit - this.elapsed) / 1000));
    const compactTownStatus: Record<TownStatus, string> = {
      ready: 'Town · No time limit', starting: 'Starting expedition…', saving: 'Saving expedition…',
      retry: 'Save unconfirmed · Retry', blocked: 'Expedition unavailable'
    };
    this.controlStatus.setText(town
      ? (this.compactHUD ? compactTownStatus[this.townStatus] : this.townMessage || 'Safe town · No time limit')
      : this.compactHUD ? `${this.runState === 'paused' ? 'Paused' : 'Exploring'} · ${seconds}s left`
        : `${this.runState === 'paused' ? 'Paused' : 'Exploring'} · Expedition ends in ${seconds}s`);
  }

  private spawnSkeletons() {
    const slots: Array<[number, number]> = [
      [4, 3],
      [ROOM_WIDTH - 5, 4],
      [5, ROOM_HEIGHT - 4],
      [ROOM_WIDTH - 6, ROOM_HEIGHT - 4]
    ];
    if (this.expedition.area === 2) slots.push([10, 4], [20, 10]);
    slots.forEach((slot) => this.spawnSkeleton(slot[0], slot[1]));
  }

  private spawnSkeleton(tx: number, ty: number) {
    const spawn = this.isoToWorld(tx, ty);
    const id = this.world.createEntity();
    this.world.setTransform(id, { x: spawn.x, y: spawn.y, rot: 0 });
    this.world.setVelocity(id, { vx: 0, vy: 0, speed: ENEMY_SPEED });
    this.world.setHealth(id, { max: ENEMY_HP + (this.expedition.area - 1) * 15, current: ENEMY_HP + (this.expedition.area - 1) * 15 });
    this.world.tagEnemy(id, {
      speed: ENEMY_SPEED,
      chaseRadius: 420,
      attackRange: ENEMY_ATTACK_RANGE,
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
    this.addToWorld(sprite);

    const ring = this.add.image(spawn.x, spawn.y + 10, 'ringRed');
    ring.setScale(0.27);
    ring.setAlpha(0.4);
    ring.setDepth(spawn.y - 5);
    this.addToWorld(ring);

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
    this.createScenery();
  }

  private createProp(type: 'barrel' | 'crate', tx: number, ty: number, loot: 'gold' | null) {
    const pos = this.isoToWorld(tx, ty);
    const textureKey = type === 'barrel' ? 'barrel' : 'crate';
    const sprite = this.add.sprite(pos.x, pos.y, textureKey);
    sprite.setScale(0.6);
    sprite.setDepth(pos.y + 20);
    this.addToWorld(sprite);
    const ring = this.add.image(pos.x, pos.y + 10, 'ringBlue');
    ring.setScale(0.2);
    ring.setAlpha(0.2);
    ring.setDepth(pos.y - 10);
    this.addToWorld(ring);
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

  private createScenery() {
    const slots: Array<[number, number]> = [];
    for (let ty = 2; ty < ROOM_HEIGHT - 2; ty += 3) {
      for (let tx = 2; tx < ROOM_WIDTH - 2; tx += 4) {
        slots.push([tx + Phaser.Math.Between(-1, 1), ty + Phaser.Math.Between(-1, 1)]);
      }
    }
    const shuffled = Phaser.Utils.Array.Shuffle(slots).slice(0, SCENERY_TEXTURES.length * 2);
    shuffled.forEach((slot, index) => {
      const texIndex = index % SCENERY_TEXTURES.length;
      const textureKey = `scenery_${texIndex}`;
      const sourcePath = SCENERY_TEXTURES[texIndex] ?? '';
      const world = this.isoToWorld(Phaser.Math.Clamp(slot[0], 1, ROOM_WIDTH - 2), Phaser.Math.Clamp(slot[1], 1, ROOM_HEIGHT - 2));
      const sprite = this.add.image(world.x, world.y, textureKey);
      sprite.setScale(0.45 + Math.random() * 0.2);
      sprite.setDepth(world.y + (sourcePath.includes('torch') ? 140 : 12));
      this.addToWorld(sprite);
    });
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
    this.addToWorld(sprite);
    const indicator = this.add.image(pos.x, pos.y - 40, 'lootIndicator');
    indicator.setScale(0.5);
    indicator.setDepth(pos.y + 50);
    this.addToWorld(indicator);
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
    this.addToWorld(glint);
    this.loot.push({ sprite, indicator, glint, collected: false });
  }

  private createSwooshEffect(center: Vec2, direction?: Phaser.Math.Vector2) {
    const dir = direction ? direction.clone().normalize() : new Phaser.Math.Vector2(0, -1);
    if (!this.anims.exists('vfx-swoosh')) {
      this.anims.create({
        key: 'vfx-swoosh',
        frames: VFX_TEXTURES.swoosh.map((_, idx) => ({ key: `vfx_swoosh_${idx}` })),
        frameRate: 18,
        repeat: 0
      });
    }
    const swoosh = this.add.sprite(center.x, center.y - 10, 'vfx_swoosh_0');
    swoosh.setOrigin(0.5, 0.85);
    const angle = Phaser.Math.RadToDeg(Math.atan2(dir.y, dir.x));
    swoosh.setAngle(angle + 90);
    swoosh.setBlendMode(Phaser.BlendModes.ADD);
    swoosh.setDepth(center.y + 30);
    this.addToWorld(swoosh);
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
      this.heroFacingVec.copy(this.movementInput);
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
    const intent =
      this.lastMoveDir.lengthSq() > 0
        ? { x: this.lastMoveDir.x, y: this.lastMoveDir.y }
        : { x: this.heroFacingVec.x, y: this.heroFacingVec.y };
    const dashInput: DashInput = {
      entity: this.playerId,
      dash: this.pendingDash,
      direction: intent
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
      const prev = previous.get(entity);
      if (this.isBlocked(transform.x, transform.y, radius) ||
          (prev && this.townCorner?.blocksMovement(prev, transform, radius))) {
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
      { x, y },
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
    if (this.townCorner?.blocksMovement({ x, y }, { x, y }, radius)) return true;
    return this.props.some((prop) => prop.alive && Phaser.Math.Distance.Between(x, y, prop.center.x, prop.center.y) < radius + prop.blockingRadius);
  }

  private syncSprites() {
    if (!this.playerId) return;
    const transform = this.world.getTransform(this.playerId);
    const velocity = this.world.getVelocity(this.playerId);
    if (transform && velocity) {
      this.playerSprite.setPosition(transform.x, transform.y);
      this.playerSprite.setDepth(transform.y + 20);
      this.playerShadow.setPosition(transform.x, transform.y);
      this.playerShadow.setDepth(transform.y - 5);
      this.heroRing.setPosition(transform.x, transform.y);
      this.heroRing.setDepth(transform.y - 4);
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
          const oldLevel = heroLevel(this.expedition.xp);
          this.expedition = recordKill(this.expedition);
          if (heroLevel(this.expedition.xp) > oldLevel) {
            playerHealth.max = heroMaxHp(this.expedition.xp);
            playerHealth.current = Math.min(playerHealth.max, playerHealth.current + 20);
          }
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
        if (distance < ENEMY_ATTACK_RANGE && enemy.attackTimer === 0) {
          enemy.attackTimer = ENEMY_ATTACK_COOLDOWN;
          velocity.vx = 0;
          velocity.vy = 0;
          const animKey = `skeleton-${SKELETON_ANIM_KEYS.attack}-${enemy.facing}`;
          enemy.sprite.play(animKey);
          const epoch = this.areaEpoch;
          enemy.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
            if (epoch !== this.areaEpoch || this.runState !== 'running' || this.ended || this.hasExpeditionExpired() || !enemy.alive || (this.world.getHealth(enemy.id)?.current ?? 0) <= 0) return;
            if (Phaser.Math.Distance.Between(playerTransform.x, playerTransform.y, transform.x, transform.y) < ENEMY_ATTACK_RANGE + 20) {
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
        this.expedition = collectGold(this.expedition);
        const player = this.world.getPlayer(this.playerId!);
        if (player) {
          player.score += 200;
        }
        this.createSwooshEffect({ x: loot.sprite.x, y: loot.sprite.y - 20 }, new Phaser.Math.Vector2(0, -1));
        loot.sprite.destroy(); loot.indicator.destroy(); loot.glint.destroy();
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
    const epoch = this.areaEpoch;
    const animKey = `hero-${HERO_ANIM_KEYS.attack}-${this.heroFacing}`;
    this.playerSprite.play(animKey);
    this.playerSprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
      if (epoch === this.areaEpoch) this.heroAttacking = false;
    });

    const attackDir = this.heroFacingVec.lengthSq() > 0 ? this.heroFacingVec.clone() : new Phaser.Math.Vector2(0, 1);
    attackDir.normalize();
    const origin = { x: transform.x, y: transform.y };
    this.time.delayedCall(140, () => {
      if (epoch === this.areaEpoch) this.applyAttackHit(origin, attackDir.clone());
    });
    this.attackCooldown = HERO_ATTACK_COOLDOWN;
  }

  private applyAttackHit(origin: Vec2, direction: Phaser.Math.Vector2) {
    if (!this.playerId || this.runState !== 'running' || this.expedition.area === 0 || this.ended || this.hasExpeditionExpired()) return;
    const center = {
      x: origin.x + direction.x * ATTACK_RANGE_OFFSET,
      y: origin.y + direction.y * ATTACK_RANGE_OFFSET
    };
    const hitCircle = new Phaser.Geom.Circle(center.x, center.y, ATTACK_RADIUS);
    this.createSwooshEffect(center, direction);

    this.skeletons.forEach((enemy) => {
      if (!enemy.alive) return;
      const enemyTransform = this.world.getTransform(enemy.id);
      const enemyHealth = this.world.getHealth(enemy.id);
      if (!enemyTransform || !enemyHealth) return;
      if (Phaser.Geom.Circle.Contains(hitCircle, enemyTransform.x, enemyTransform.y)) {
        enemyHealth.current = Math.max(0, enemyHealth.current - heroDamage(this.expedition.xp));
        enemy.sprite.setTintFill(0xffffff);
        this.time.delayedCall(120, () => enemy.sprite.clearTint());
        const velocity = this.world.getVelocity(enemy.id);
        if (velocity) {
          velocity.vx += direction.x * 160;
          velocity.vy += direction.y * 160;
        }
      }
    });

    this.props.forEach((prop) => {
      if (!prop.alive) return;
      if (Phaser.Geom.Circle.Contains(hitCircle, prop.center.x, prop.center.y)) {
        prop.hp -= heroDamage(this.expedition.xp);
        if (prop.hp <= 0) {
          this.breakProp(prop);
        }
      }
    });
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
    image.setOrigin(this.playerSprite.originX, this.playerSprite.originY);
    image.setDepth(this.playerSprite.depth - 1);
    image.setScale(this.playerSprite.scale);
    image.setBlendMode(Phaser.BlendModes.ADD);
    this.addToWorld(image);
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
    this.scoreText.setText(`${this.compactHUD ? 'Lv' : 'Hero Lv'} ${heroLevel(this.expedition.xp)} · XP ${this.expedition.xp % 100}/100 · Score ${score}`);
    const area = AREAS[this.expedition.area];
    const compactArea = ['Lantern Sq.', 'Mossgate', 'Ember Vault'][this.expedition.area];
    this.areaText.setText(this.compactHUD
      ? `${compactArea} · G${this.expedition.carriedGold}/${this.expedition.bankedGold}`
      : `${area.name} · Gold ${this.expedition.carriedGold} carried / ${this.expedition.bankedGold} banked`);
    if (this.portalText) this.portalText.setText(this.expedition.area === 0 ? (this.townStatus === 'ready' ? 'E · Enter ruins' : this.townStatus === 'retry' ? 'E · Retry saving' : this.townStatus === 'blocked' ? 'Unavailable' : 'Please wait…') : canAdvance(this.expedition) ? (this.expedition.area === 1 ? 'STAIR TO EMBER VAULT\nE · Descend' : 'WAY HOME\nE · Return victorious') : `${area.name}\nWardens ${this.expedition.floorKills}/${area.enemies}`);
    this.updateControlButtons();
    if (health) {
      this.hpText.setText(`HP ${Math.max(0, Math.ceil(health.current))}/${health.max}`);
      this.drawHpBar(health.current / health.max);
    }
  }

  private drawHpBar(ratio: number) {
    const { width, height } = this.hpBarSize;
    const radius = Math.min(8, height / 2);
    this.hpBarBg.clear();
    this.hpBarBg.fillStyle(0x0c1b27, 0.8);
    this.hpBarBg.fillRoundedRect(0, 0, width, height, radius);
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
    this.hpBarFill.fillRoundedRect(0, 0, width * clamped, height, radius);
  }

  private resizeVignette() {
    if (!this.vignetteSprite) return;
    // Keep the safe town readable while preserving the dungeon's existing mood.
    this.vignetteSprite.setAlpha(this.expedition.area === 0 ? 0.25 : 0.65);
    const { width, height } = this.scale.gameSize;
    this.vignetteSprite.setPosition(width / 2, height / 2);
    const scale = Math.max(width / this.vignetteSprite.width, height / this.vignetteSprite.height) * 1.3;
    // Preserve the desktop overlay extent when the narrow camera zooms out.
    const zoom = this.cameras?.main?.zoom ?? CAMERA_ZOOM;
    this.vignetteSprite.setScale(scale * Math.max(1, CAMERA_ZOOM / zoom));
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

  private addToWorld<T extends Phaser.GameObjects.GameObject>(object: T): T {
    this.worldLayer.add(object);
    return object;
  }


  private isKeyDown(key: 'w' | 'a' | 's' | 'd') {
    return this.wasd[key].isDown;
  }

  private hasExpeditionExpired() {
    return this.expeditionActive && performance.now() - this.expeditionStartedAt >= this.durationLimit;
  }

  private finishExpedition() {
    if (!this.expeditionActive) return;
    this.elapsed = Math.min(this.durationLimit, Math.max(this.elapsed, performance.now() - this.expeditionStartedAt, 0));
    this.expeditionActive = false;
    this.pointerAttack = false;
    this.townStatus = 'saving';
    this.townMessage = 'Saving expedition result…';
    const player = this.playerId ? this.world.getPlayer(this.playerId) : undefined;
    const score = Math.max(0, Math.floor(player?.score ?? this.killCount * 250));
    if (this.initialized && this.handlers.isCurrent()) this.handlers.onGameOver(score, this.elapsed);
    this.updateUIState();
  }

  private endRun() {
    if (!this.expeditionActive) return;
    // The expedition has a logical deadline even when a frame arrives late.
    // Timeout returns to safe town; browsing town never consumes a session clock.
    this.changeArea(returnToTown(this.expedition, true));
  }
}
