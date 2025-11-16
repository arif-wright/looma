import Phaser from 'phaser';
import { World, type EntityId, type Player, type Transform, type Vec2 } from '../ecs/components';
import { dashSystem, movementSystem, type DashInput } from '../ecs/systems';

const TILESET_KEY = 'arpg-tiles';
const TILEMAP_KEY = 'arpg-dungeon';
const HERO_KEY = 'arpg-hero';
const VIGNETTE_KEY = 'arpg-vignette';
const MAX_RUN_MS = 90_000;

type GameHandlers = {
  onGameOver: (score: number) => void;
};

type EnemyActor = {
  id: EntityId;
  sprite: Phaser.GameObjects.Sprite;
};

export class GameScene extends Phaser.Scene {
  private static handlers: GameHandlers | null = null;

  static setGameHandlers(handlers: GameHandlers) {
    GameScene.handlers = handlers;
  }

  private world!: World;
  private playerId: EntityId | null = null;
  private playerSprite!: Phaser.GameObjects.Sprite;
  private playerShadow!: Phaser.GameObjects.Ellipse;
  private map!: Phaser.Tilemaps.Tilemap;
  private floorLayer!: Phaser.Tilemaps.TilemapLayer;
  private wallLayer!: Phaser.Tilemaps.TilemapLayer;
  private decorLayer?: Phaser.Tilemaps.TilemapLayer;
  private vignetteSprite?: Phaser.GameObjects.Image;
  private overlay!: Phaser.GameObjects.Rectangle;
  private instructionsText!: Phaser.GameObjects.Text;
  private scoreText!: Phaser.GameObjects.Text;
  private hpText!: Phaser.GameObjects.Text;
  private hpBarFill!: Phaser.GameObjects.Graphics;
  private hpBarBg!: Phaser.GameObjects.Graphics;
  private uiContainer!: Phaser.GameObjects.Container;
  private dashKeys: Phaser.Input.Keyboard.Key[] = [];
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;
  private pointerAttack = false;
  private attackCooldown = 0;
  private killCount = 0;
  private pendingDash = false;
  private lastMoveDir = new Phaser.Math.Vector2(0, 0);
  private movementInput = new Phaser.Math.Vector2(0, 0);
  private previousPositions = new Map<EntityId, Vec2>();
  private dashAfterimages: Phaser.GameObjects.Group | null = null;
  private enemies: EnemyActor[] = [];
  private ended = false;
  private elapsed = 0;

  constructor() {
    super({ key: 'GameScene' });
  }

  preload() {
    this.load.image(TILESET_KEY, '/games/arpg/tileset-iso.png');
    this.load.tilemapTiledJSON(TILEMAP_KEY, '/games/arpg/dungeon-iso.json');
    this.load.spritesheet(HERO_KEY, '/games/arpg/hero-iso.png', {
      frameWidth: 64,
      frameHeight: 64
    });
    this.load.image(VIGNETTE_KEY, '/games/arpg/vignette_soft.png');
  }

  create() {
    this.cameras.main.setBackgroundColor(0x05060a);
    this.world = new World();
    this.previousPositions.clear();
    this.killCount = 0;
    this.attackCooldown = 0;
    this.pendingDash = false;
    this.enemies = [];
    this.ended = false;
    this.elapsed = 0;

    this.setupMap();
    this.setupPlayer();
    this.setupInput();
    this.setupUI();
    this.spawnEnemies();
    this.createAnimations();
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

    if (this.pointerAttack && this.attackCooldown <= 0) {
      this.performAttack();
    }

    if (dashResult?.activated) {
      this.spawnDashAfterimage();
    }
    this.updateUIState();
  }

  private setupMap() {
    this.map = this.make.tilemap({ key: TILEMAP_KEY });
    const tileset = this.map.addTilesetImage('ShardDungeon', TILESET_KEY);
    if (!tileset) throw new Error('Tileset missing for ARPG dungeon');

    const floor = this.map.createLayer('floor', tileset, 0, 0);
    const walls = this.map.createLayer('walls', tileset, 0, 0);
    this.decorLayer = this.map.createLayer('decor', tileset, 0, 0);
    if (!floor || !walls) {
      throw new Error('Dungeon map layers missing');
    }
    this.floorLayer = floor;
    this.wallLayer = walls;
    this.floorLayer.setDepth(0);
    this.wallLayer.setDepth(5);
    this.decorLayer?.setDepth(6);
    this.wallLayer.setCollision([3, 4]);

    this.overlay = this.add
      .rectangle(0, 0, this.map.widthInPixels, this.map.heightInPixels, 0x05050a, 0.25)
      .setOrigin(0)
      .setDepth(-5);
    this.overlay.setBlendMode(Phaser.BlendModes.MULTIPLY);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.map.widthInPixels, this.map.heightInPixels);
    cam.setZoom(1);
  }

  private setupPlayer() {
    const spawn = this.tileToWorld(8, 8);
    this.playerId = this.world.createEntity();
    this.world.setTransform(this.playerId, { x: spawn.x, y: spawn.y, rot: 0 });
    this.world.setVelocity(this.playerId, { vx: 0, vy: 0, speed: 210 });
    this.world.setHealth(this.playerId, { max: 120, current: 120 });
    this.world.setDash(this.playerId, {
      cd: 0,
      cdMax: 700,
      power: 180,
      duration: 140,
      timer: 0,
      lastDir: { x: 1, y: 0 }
    });
    this.world.tagPlayer(this.playerId, { score: 0 });

    this.playerSprite = this.add.sprite(spawn.x, spawn.y, HERO_KEY, 0);
    this.playerSprite.setOrigin(0.5, 0.8);
    this.playerSprite.setDepth(spawn.y + 10);
    this.playerSprite.play('hero_idle');

    this.playerShadow = this.add.ellipse(spawn.x, spawn.y + 20, 70, 28, 0x000000, 0.4);
    this.playerShadow.setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.playerShadow.setDepth(spawn.y + 5);

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
    this.uiContainer = this.add.container(24, 24);
    this.uiContainer.setScrollFactor(0);
    this.uiContainer.setDepth(1000);
    this.instructionsText = this.add
      .text(
        0,
        0,
        'WASD move  •  Space/Shift dash\nLeft click attack  •  Kite for breathing room',
        {
          fontFamily: 'Space Grotesk, sans-serif',
          fontSize: '16px',
          color: '#e5f6ff'
        }
      )
      .setShadow(0, 0, '#000', 6, true, true);
    this.scoreText = this.add
      .text(0, 44, 'Kills 0  •  Score 0', {
        fontFamily: 'Space Grotesk, sans-serif',
        fontSize: '20px',
        color: '#f8fafc'
      })
      .setShadow(0, 0, '#000', 4, true, true);
    this.hpText = this.add.text(0, 80, 'HP 120', {
      fontFamily: 'Space Grotesk, sans-serif',
      fontSize: '16px',
      color: '#c8f7ff'
    });
    this.hpBarBg = this.add.graphics();
    this.hpBarFill = this.add.graphics();
    this.drawHpBar(1);
    this.uiContainer.add([this.instructionsText, this.scoreText, this.hpText, this.hpBarBg, this.hpBarFill]);
  }

  private createOverlays() {
    this.vignetteSprite = this.add
      .image(0, 0, VIGNETTE_KEY)
      .setOrigin(0.5)
      .setScrollFactor(0)
      .setDepth(1200)
      .setAlpha(0.9);
    this.resizeVignette();
    this.scale.on('resize', () => this.resizeVignette());
  }

  private createAnimations() {
    if (!this.anims.get('hero_idle')) {
      this.anims.create({
        key: 'hero_idle',
        frames: [{ key: HERO_KEY, frame: 0 }],
        frameRate: 1,
        repeat: -1
      });
    }
    if (!this.anims.get('hero_walk')) {
      this.anims.create({
        key: 'hero_walk',
        frames: this.anims.generateFrameNumbers(HERO_KEY, { start: 0, end: 3 }),
        frameRate: 8,
        repeat: -1
      });
    }
  }

  private spawnEnemies() {
    const spots: Vec2[] = [
      this.tileToWorld(5, 5),
      this.tileToWorld(11, 4),
      this.tileToWorld(4, 11),
      this.tileToWorld(11, 11),
      this.tileToWorld(8, 3)
    ];
    spots.forEach((spot) => this.spawnEnemy(spot.x, spot.y));
  }

  private spawnEnemy(x: number, y: number) {
    const id = this.world.createEntity();
    this.world.setTransform(id, { x, y, rot: 0 });
    this.world.setVelocity(id, { vx: 0, vy: 0, speed: 140 });
    this.world.setHealth(id, { max: 60, current: 60 });
    this.world.tagEnemy(id, {
      speed: 140,
      chaseRadius: 520,
      attackRange: 80,
      attackDelay: 1200,
      damage: 12,
      timer: 0
    });

    const sprite = this.add.sprite(x, y, HERO_KEY, 1);
    sprite.setTint(0xc45b5b);
    sprite.setOrigin(0.5, 0.85);
    sprite.setDepth(y + 8);
    sprite.play('hero_walk');
    this.enemies.push({ id, sprite });
  }

  private handleInput() {
    const x = (this.isKeyDown('d') || this.cursors.right.isDown ? 1 : 0) - (this.isKeyDown('a') || this.cursors.left.isDown ? 1 : 0);
    const y = (this.isKeyDown('s') || this.cursors.down.isDown ? 1 : 0) - (this.isKeyDown('w') || this.cursors.up.isDown ? 1 : 0);
    this.movementInput.set(x, y);
    if (this.movementInput.lengthSq() > 0) {
      this.movementInput.normalize();
      this.lastMoveDir.copy(this.movementInput);
    }

    const dashPressed = this.dashKeys.some((key) => Phaser.Input.Keyboard.JustDown(key));
    this.pendingDash = dashPressed;

    if (!this.playerId) return;
    const velocity = this.world.getVelocity(this.playerId);
    if (!velocity) return;
    velocity.vx = this.movementInput.x * velocity.speed;
    velocity.vy = this.movementInput.y * velocity.speed;
  }

  private handleDash(delta: number) {
    if (!this.playerId) return undefined;
    const dashInput: DashInput = {
      entity: this.playerId,
      dash: this.pendingDash,
      direction:
        this.lastMoveDir.lengthSq() > 0
          ? { x: this.lastMoveDir.x, y: this.lastMoveDir.y }
          : { x: 0, y: 0 }
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
    const radiusPlayer = 32;
    const radiusEnemy = 28;
    const apply = (entity: EntityId, radius: number) => {
      const transform = this.world.getTransform(entity);
      if (!transform) return;
      const probes = [
        { x: 0, y: 0 },
        { x: radius, y: 0 },
        { x: -radius, y: 0 },
        { x: 0, y: radius },
        { x: 0, y: -radius }
      ];
      const collides = probes.some((offset) => {
        const tile = this.wallLayer.getTileAtWorldXY(
          transform.x + offset.x,
          transform.y + offset.y,
          true
        );
        return tile ? tile.collides || tile.index > 0 : false;
      });
      if (collides) {
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
      apply(this.playerId, radiusPlayer);
    }
    this.world.getEnemies().forEach((id) => apply(id, radiusEnemy));
  }

  private syncSprites() {
    if (!this.playerId) return;
    const transform = this.world.getTransform(this.playerId);
    const velocity = this.world.getVelocity(this.playerId);
    if (transform && velocity) {
      this.playerSprite.setPosition(transform.x, transform.y);
      this.playerSprite.setDepth(transform.y + 20);
      const moving = Math.hypot(velocity.vx, velocity.vy) > 10;
      this.playerSprite.play(moving ? 'hero_walk' : 'hero_idle', true);
      this.playerSprite.setFlipX(velocity.vx < 0);
      this.playerShadow.setPosition(transform.x, transform.y + 18);
      const squish = moving ? 0.9 : 1.05;
      this.playerShadow.setScale(Phaser.Math.Linear(this.playerShadow.scaleX, squish, 0.15), 1);
    }

    this.enemies.forEach(({ id, sprite }) => {
      const t = this.world.getTransform(id);
      const v = this.world.getVelocity(id);
      if (!t || !v) return;
      sprite.setPosition(t.x, t.y);
      sprite.setDepth(t.y + 10);
      sprite.setFlipX(v.vx < 0);
    });
  }

  private updateEnemyBehavior(delta: number) {
    if (!this.playerId) return;
    const playerTransform = this.world.getTransform(this.playerId);
    const playerHealth = this.world.getHealth(this.playerId);
    if (!playerTransform || !playerHealth) return;

    this.enemies = this.enemies.filter((actor) => {
      const enemyHealth = this.world.getHealth(actor.id);
      if (!enemyHealth || enemyHealth.current <= 0) {
        this.killEnemy(actor);
        return false;
      }
      return true;
    });

    this.world.getEnemies().forEach((enemyId) => {
      const enemy = this.world.getEnemy(enemyId);
      const transform = this.world.getTransform(enemyId);
      const velocity = this.world.getVelocity(enemyId);
      if (!enemy || !transform || !velocity) return;
      enemy.timer = Math.max(0, enemy.timer - delta);

      const dx = playerTransform.x - transform.x;
      const dy = playerTransform.y - transform.y;
      const dist = Math.hypot(dx, dy);
      if (dist < enemy.chaseRadius) {
        const dirX = dx / Math.max(1, dist);
        const dirY = dy / Math.max(1, dist);
        velocity.vx = dirX * enemy.speed;
        velocity.vy = dirY * enemy.speed;
        if (dist < enemy.attackRange && enemy.timer <= 0) {
          this.damagePlayer(enemy.damage, dirX, dirY);
          enemy.timer = enemy.attackDelay;
        }
      } else {
        velocity.vx *= 0.9;
        velocity.vy *= 0.9;
      }
    });
  }

  private performAttack() {
    if (!this.playerId) return;
    const transform = this.world.getTransform(this.playerId);
    if (!transform) return;
    const pointer = this.input.activePointer;
    const aim = new Phaser.Math.Vector2(pointer.worldX - transform.x, pointer.worldY - transform.y);
    if (aim.lengthSq() === 0 && this.lastMoveDir.lengthSq() > 0) {
      aim.copy(this.lastMoveDir);
    }
    if (aim.lengthSq() === 0) {
      aim.set(1, 0);
    }
    aim.normalize();

    const reach = 100;
    const radius = 60;
    const center = new Phaser.Math.Vector2(transform.x + aim.x * reach, transform.y + aim.y * reach);
    const hitCircle = new Phaser.Geom.Circle(center.x, center.y, radius);
    this.playSlashEffect(transform, aim);

    this.world.getEnemies().forEach((enemyId) => {
      const enemyHealth = this.world.getHealth(enemyId);
      const enemyTransform = this.world.getTransform(enemyId);
      const enemyVelocity = this.world.getVelocity(enemyId);
      if (!enemyHealth || !enemyTransform) return;
      if (Phaser.Geom.Circle.Contains(hitCircle, enemyTransform.x, enemyTransform.y)) {
        enemyHealth.current -= 25;
        if (enemyVelocity) {
          enemyVelocity.vx += aim.x * 300;
          enemyVelocity.vy += aim.y * 300;
        }
        this.flashEnemy(enemyId);
      }
    });

    this.attackCooldown = 280;
  }

  private damagePlayer(amount: number, dirX: number, dirY: number) {
    if (!this.playerId) return;
    const health = this.world.getHealth(this.playerId);
    const velocity = this.world.getVelocity(this.playerId);
    if (!health) return;
    health.current = Math.max(0, health.current - amount);
    if (velocity) {
      velocity.vx -= dirX * 80;
      velocity.vy -= dirY * 80;
    }
    this.playerSprite.setTintFill(0xff9f9f);
    this.time.delayedCall(150, () => this.playerSprite.clearTint());
    this.updateUIState();
    if (health.current <= 0) {
      this.endRun();
    }
  }

  private flashEnemy(id: EntityId) {
    const actor = this.enemies.find((entry) => entry.id === id);
    if (!actor) return;
    actor.sprite.setTintFill(0xffffff);
    this.time.delayedCall(120, () => actor.sprite.clearTint());
  }

  private killEnemy(actor: EnemyActor) {
    const sprite = actor.sprite;
    const burst = this.add
      .circle(sprite.x, sprite.y + 10, 22, 0xffc34d, 0.45)
      .setDepth(sprite.depth + 2)
      .setBlendMode(Phaser.BlendModes.ADD);
    this.tweens.add({
      targets: sprite,
      alpha: 0,
      duration: 220,
      onComplete: () => {
        sprite.destroy();
        burst.destroy();
      }
    });
    this.world.destroyEntity(actor.id);
    this.killCount += 1;
    const score = this.playerId ? this.world.getPlayer(this.playerId) : undefined;
    if (score) {
      score.score += 250;
    }
  }

  private playSlashEffect(transform: Transform, dir: Phaser.Math.Vector2) {
    const slash = this.add.graphics();
    slash.setDepth(transform.y + 30);
    slash.fillStyle(0xf2f2f2, 0.35);
    slash.slice(transform.x, transform.y, 70, dir.angle() - 0.35, dir.angle() + 0.35, true);
    slash.fillPath();
    this.tweens.add({
      targets: slash,
      alpha: 0,
      scaleX: 1.1,
      scaleY: 1.1,
      duration: 160,
      onComplete: () => slash.destroy()
    });
  }

  private spawnDashAfterimage() {
    if (!this.playerSprite || !this.dashAfterimages) return;
    const frameName = this.playerSprite.frame.name;
    const image = this.add
      .sprite(this.playerSprite.x, this.playerSprite.y, HERO_KEY, frameName)
      .setAlpha(0.6)
      .setDepth(this.playerSprite.depth - 1)
      .setScale(this.playerSprite.scaleX, this.playerSprite.scaleY);
    image.setTint(0x7de2ff);
    image.setBlendMode(Phaser.BlendModes.ADD);
    this.dashAfterimages.add(image);
    this.tweens.add({
      targets: image,
      alpha: 0,
      duration: 220,
      onComplete: () => image.destroy()
    });
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
    this.hpBarBg.fillRoundedRect(0, 110, width, height, 8);
    this.hpBarFill.clear();
    const color = Phaser.Display.Color.Interpolate.ColorWithColor(
      Phaser.Display.Color.ValueToColor(0xff6363),
      Phaser.Display.Color.ValueToColor(0x8affda),
      100,
      Math.floor(Phaser.Math.Clamp(ratio, 0, 1) * 100)
    );
    const fillColor = Phaser.Display.Color.GetColor(color.r, color.g, color.b);
    this.hpBarFill.fillStyle(fillColor, 1);
    this.hpBarFill.fillRoundedRect(0, 110, width * Phaser.Math.Clamp(ratio, 0, 1), height, 8);
  }

  private resizeVignette() {
    if (!this.vignetteSprite) return;
    const { width, height } = this.scale.gameSize;
    this.vignetteSprite.setPosition(width / 2, height / 2);
    const scale = Math.max(width / this.vignetteSprite.width, height / this.vignetteSprite.height) * 1.2;
    this.vignetteSprite.setScale(scale);
  }

  private tileToWorld(tx: number, ty: number): Vec2 {
    const x = this.map.tileToWorldX(tx, ty) + this.map.tileWidth * 0.5;
    const y = this.map.tileToWorldY(tx, ty) + this.map.tileHeight * 0.5;
    return { x, y };
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
