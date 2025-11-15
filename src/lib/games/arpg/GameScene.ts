import Phaser from 'phaser';
import { World, type Vec2 } from './ecs/components';
import { dashSystem, movementSystem } from './ecs/systems';

const RUN_LIMIT_MS = 60000;
const SAFE_PADDING = 24;

export class GameScene extends Phaser.Scene {
  private static onGameOver: ((score: number) => void) | null = null;

  static setGameHandlers(handler: { onGameOver: (score: number) => void }) {
    GameScene.onGameOver = handler.onGameOver;
  }

  private world!: World;
  private playerId: number | null = null;
  private player!: Phaser.GameObjects.Arc;
  private aura!: Phaser.GameObjects.Ellipse;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'w' | 'a' | 's' | 'd', Phaser.Input.Keyboard.Key>;
  private dashKeys: Phaser.Input.Keyboard.Key[] = [];
  private escKey!: Phaser.Input.Keyboard.Key;
  private elapsedMs = 0;
  private ended = false;
  private scoreText!: Phaser.GameObjects.Text;
  private tipText!: Phaser.GameObjects.Text;
  private lastDirection: Vec2 = { x: 1, y: 0 };

  constructor() {
    super({ key: 'GameScene' });
  }

  create() {
    this.cameras.main.setBackgroundColor('#05060a');
    this.world = new World();
    this.elapsedMs = 0;
    this.ended = false;

    const { width, height } = this.cameras.main;
    this.add.grid(width / 2, height / 2, width - SAFE_PADDING * 2, height - SAFE_PADDING * 2, 64, 64, 0x102543, 0.25, 0x102543, 0.3);

    this.playerId = this.world.createEntity();
    this.world.setTransform(this.playerId, { x: width / 2, y: height / 2, rotation: 0 });
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

    this.aura = this.add.ellipse(width / 2, height / 2, 120, 120, 0x3bd7ff, 0.08);
    this.player = this.add.circle(width / 2, height / 2, 16, 0x70f7ff, 1);
    this.player.setStrokeStyle(2, 0xffffff, 0.4);

    this.scoreText = this.add.text(24, 20, 'Score 0', {
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: '22px',
      color: '#dfe6ff'
    });

    this.tipText = this.add.text(24, 52, 'WASD / Arrow keys to move — Hold Shift or Space to dash', {
      fontFamily: 'Inter, system-ui, sans-serif',
      fontSize: '14px',
      color: '#90a1ff'
    });

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
    });
  }

  update(_time: number, delta: number) {
    if (this.ended || !this.playerId) return;

    this.elapsedMs += delta;
    const score = Math.max(0, Math.floor(this.elapsedMs));
    this.scoreText.setText(`Score ${score}`);
    this.aura.setScale(1 + Math.sin(this.elapsedMs / 320) * 0.05);

    this.handleInput();
    dashSystem(this.world, delta);
    movementSystem(this.world, delta);
    this.clampPlayer();
    this.syncPlayerSprite();

    if (this.elapsedMs >= RUN_LIMIT_MS) {
      this.endRun();
    }

    if (Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this.endRun();
    }
  }

  private handleInput() {
    const velocity = this.playerId ? this.world.getVelocity(this.playerId) : null;
    const dash = this.playerId ? this.world.getDash(this.playerId) : null;
    if (!velocity) return;

    const axis = this.sampleInput();
    const hasInput = Math.hypot(axis.x, axis.y) > 0;
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
  }

  private sampleInput(): Vec2 {
    const axis = { x: 0, y: 0 };
    if (this.cursors.left?.isDown || this.wasd.a.isDown) axis.x -= 1;
    if (this.cursors.right?.isDown || this.wasd.d.isDown) axis.x += 1;
    if (this.cursors.up?.isDown || this.wasd.w.isDown) axis.y -= 1;
    if (this.cursors.down?.isDown || this.wasd.s.isDown) axis.y += 1;
    return axis;
  }

  private clampPlayer() {
    const transform = this.playerId ? this.world.getTransform(this.playerId) : null;
    if (!transform) return;
    const bounds = this.cameras.main;
    transform.x = Phaser.Math.Clamp(transform.x, SAFE_PADDING, bounds.width - SAFE_PADDING);
    transform.y = Phaser.Math.Clamp(transform.y, SAFE_PADDING, bounds.height - SAFE_PADDING);
  }

  private syncPlayerSprite() {
    const transform = this.playerId ? this.world.getTransform(this.playerId) : null;
    if (!transform) return;
    this.player.setPosition(transform.x, transform.y);
    this.aura.setPosition(transform.x, transform.y);
  }

  private endRun() {
    if (this.ended) return;
    this.ended = true;
    const score = Math.max(0, Math.floor(this.elapsedMs));
    GameScene.onGameOver?.(score);
  }
}
