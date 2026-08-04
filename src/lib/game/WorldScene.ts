import Phaser from 'phaser';
import { PLAYER_SPEED, WORLD_HEIGHT, WORLD_WIDTH, normalizeMovement } from './config';
import { MovementIntentScheduler } from './movementIntentScheduler';
import type { MovementIntent, WorldSnapshot } from './protocol';
import { MOONBERRY_INTERACTION, WORLD_TRAVERSAL } from './traversal';

const MOONBERRY_NODE = MOONBERRY_INTERACTION;

export type TouchDirection = { x: number; y: number };
type FollowerRuntime = {
  sprite: Phaser.GameObjects.Sprite;
  label: Phaser.GameObjects.Text;
  positions: Array<{ x: number; y: number }>;
  status: 'idle' | 'moving' | 'reconnecting' | 'unavailable';
  revision: number;
};

export class WorldScene extends Phaser.Scene {
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private readonly remotePlayers = new Map<string, Phaser.GameObjects.Sprite>();
  private readonly playerLabels = new Map<string, Phaser.GameObjects.Text>();
  private localLabel: Phaser.GameObjects.Text | null = null;
  private readonly followers = new Map<string, FollowerRuntime>();
  private reducedMotion = false;
  private movementSender: ((intent: MovementIntent) => void) | null = null;
  private readonly movementScheduler = new MovementIntentScheduler();
  private hasAuthoritativePosition = false;
  private ready = false;
  private pendingSnapshot: WorldSnapshot | null = null;
  private interactionSender: (() => void) | null = null;
  private promptListener: ((visible: boolean) => void) | null = null;
  private interactionKey!: Phaser.Input.Keyboard.Key;
  private interactionAvailable = false;

  constructor(private readonly touchDirection: TouchDirection) {
    super('wilds-placeholder');
  }

  preload() {
    this.load.svg('wilds-player', '/game/world/player-placeholder.svg');
    this.load.svg('wilds-obstacle', '/game/world/obstacle-placeholder.svg');
    this.load.svg('wilds-companion', '/game/world/companion-placeholder.svg');
  }

  create() {
    this.cameras.main.setBackgroundColor('#101d2a');
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.physics.world.setBounds(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

    const ground = this.add.graphics();
    ground.fillStyle(0x173d3a, 1);
    ground.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
    ground.lineStyle(2, 0x28534d, 0.7);
    for (let x = 0; x <= WORLD_WIDTH; x += 64) ground.lineBetween(x, 0, x, WORLD_HEIGHT);
    for (let y = 0; y <= WORLD_HEIGHT; y += 64) ground.lineBetween(0, y, WORLD_WIDTH, y);

    const path = this.add.graphics();
    path.fillStyle(0x79684d, 0.62);
    path.fillRoundedRect(0, 218, WORLD_WIDTH, 104, 28);

    const blockers = this.physics.add.staticGroup();
    for (const blocker of WORLD_TRAVERSAL.blockers) {
      const obstacle = blockers.create(blocker.x, blocker.y, 'wilds-obstacle') as Phaser.Types.Physics.Arcade.ImageWithStaticBody;
      const diameter = blocker.radius * 2;
      obstacle.setDisplaySize(diameter, diameter).refreshBody();
      obstacle.setTint(blocker.kind === 'tree' ? 0x477b58 : 0x77827e);
      obstacle.body.setCircle(blocker.radius);
    }

    this.player = this.physics.add.sprite(180, 270, 'wilds-player');
    this.player.setDisplaySize(48, 48);
    this.player.setTint(0x7ce8d0);
    this.player.setCollideWorldBounds(true);
    this.player.body.setSize(30, 34);
    this.physics.add.collider(this.player, blockers);

    const grove = this.add.circle(MOONBERRY_NODE.x, MOONBERRY_NODE.y, 30, 0x6752a4, 0.92);
    grove.setStrokeStyle(4, 0xcab8ff, 0.8);
    this.add.text(MOONBERRY_NODE.x, MOONBERRY_NODE.y + 38, 'Moonberry Grove', {
      color: '#efe8ff', fontFamily: 'system-ui, sans-serif', fontSize: '13px'
    }).setOrigin(0.5, 0);

    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('Keyboard input is unavailable');
    this.cursors = keyboard.createCursorKeys();
    this.wasd = {
      up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D)
    };
    this.interactionKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);

    this.add
      .text(24, 22, 'Whispering Grove', {
        color: '#e8fbf4',
        fontFamily: 'system-ui, sans-serif',
        fontSize: '20px'
      })
      .setAlpha(0.9);
    this.ready = true;
    if (this.pendingSnapshot) {
      const snapshot = this.pendingSnapshot;
      this.pendingSnapshot = null;
      this.applyNetworkSnapshot(snapshot);
    }
  }

  setMovementSender(sender: (intent: MovementIntent) => void) {
    this.movementSender = sender;
  }

  setInteractionHandlers(sender: () => void, promptListener: (visible: boolean) => void) {
    this.interactionSender = sender;
    this.promptListener = promptListener;
  }

  applyNetworkSnapshot(snapshot: WorldSnapshot) {
    if (!this.ready) {
      this.pendingSnapshot = snapshot;
      return;
    }
    const local = snapshot.players.get(snapshot.localPlayerId);
    if (local && this.player) {
      const distance = Phaser.Math.Distance.Between(this.player.x, this.player.y, local.x, local.y);
      if (!this.hasAuthoritativePosition || distance > 96) this.player.setPosition(local.x, local.y);
      else {
        this.player.x = Phaser.Math.Linear(this.player.x, local.x, 0.28);
        this.player.y = Phaser.Math.Linear(this.player.y, local.y, 0.28);
      }
      this.hasAuthoritativePosition = true;
      if (!this.localLabel) {
        this.localLabel = this.add.text(this.player.x, this.player.y - 34, local.displayName, {
          color: '#dffff5', fontFamily: 'system-ui, sans-serif', fontSize: '13px'
        }).setOrigin(0.5, 1);
      }
      this.localLabel.setText(local.displayName);
      const available = Phaser.Math.Distance.Between(local.x, local.y, MOONBERRY_NODE.x, MOONBERRY_NODE.y) <= MOONBERRY_NODE.radius;
      if (available !== this.interactionAvailable) {
        this.interactionAvailable = available;
        this.promptListener?.(available);
      }
    }

    const present = new Set<string>();
    const presentFollowers = new Set<string>();
    snapshot.players.forEach((player, id) => {
      if (player.companionPresent) {
        presentFollowers.add(id);
        let follower = this.followers.get(id);
        if (!follower) {
          const sprite = this.add.sprite(player.x - 28, player.y + 28, 'wilds-companion').setDisplaySize(36, 36);
          const label = this.add.text(sprite.x, sprite.y + 26, player.companionName, {
            color: '#fff0bd', fontFamily: 'system-ui, sans-serif', fontSize: '11px'
          }).setOrigin(0.5, 0);
          follower = { sprite, label, positions: [], status: player.companionStatus, revision: -1 };
          this.followers.set(id, follower);
        }
        const last = follower.positions.at(-1);
        if (!last || last.x !== player.x || last.y !== player.y) {
          follower.positions.push({ x: player.x, y: player.y });
          if (follower.positions.length > 8) follower.positions.shift();
        }
        follower.status = player.companionStatus;
        if (follower.revision !== player.companionRevision) {
          follower.revision = player.companionRevision;
          follower.label.setText(player.companionName);
          follower.sprite.setTint(this.companionTint(player.companionKind));
        }
      }
      if (id === snapshot.localPlayerId) return;
      present.add(id);
      let sprite = this.remotePlayers.get(id);
      if (!sprite) {
        sprite = this.add.sprite(player.x, player.y, 'wilds-player');
        sprite.setDisplaySize(48, 48);
        this.remotePlayers.set(id, sprite);
        this.playerLabels.set(id, this.add.text(player.x, player.y - 34, player.displayName, {
          color: '#fff3d2', fontFamily: 'system-ui, sans-serif', fontSize: '13px'
        }).setOrigin(0.5, 1));
      }
      const colors = [0xf4a6c8, 0xffce73, 0xbba6ff, 0x8ed5ff];
      sprite.setTint(colors[player.colorIndex % colors.length]);
      sprite.setAlpha(player.connected ? 0.9 : 0.35);
      sprite.setData('targetX', player.x);
      sprite.setData('targetY', player.y);
      this.playerLabels.get(id)?.setText(player.displayName);
    });
    for (const [id, sprite] of this.remotePlayers) {
      if (!present.has(id)) {
        sprite.destroy();
        this.playerLabels.get(id)?.destroy();
        this.playerLabels.delete(id);
        this.remotePlayers.delete(id);
      }
    }
    for (const [id, follower] of this.followers) {
      if (!presentFollowers.has(id)) {
        follower.sprite.destroy();
        follower.label.destroy();
        this.followers.delete(id);
      }
    }
  }

  update(_time: number, delta: number) {
    const x =
      Number(this.cursors.right.isDown || this.wasd.right.isDown) -
      Number(this.cursors.left.isDown || this.wasd.left.isDown) +
      this.touchDirection.x;
    const y =
      Number(this.cursors.down.isDown || this.wasd.down.isDown) -
      Number(this.cursors.up.isDown || this.wasd.up.isDown) +
      this.touchDirection.y;
    const direction = normalizeMovement(x, y);

    if (this.interactionAvailable && Phaser.Input.Keyboard.JustDown(this.interactionKey)) {
      this.interactionSender?.();
    }

    this.player.setVelocity(direction.x * PLAYER_SPEED, direction.y * PLAYER_SPEED);
    if (direction.x !== 0 || direction.y !== 0) {
      this.player.setRotation(Math.atan2(direction.y, direction.x) + Math.PI / 2);
    }

    const intent = this.movementScheduler.next(direction.x, direction.y, delta);
    if (intent && this.movementSender) this.movementSender(intent);
    for (const sprite of this.remotePlayers.values()) {
      sprite.x = Phaser.Math.Linear(sprite.x, sprite.getData('targetX'), 0.22);
      sprite.y = Phaser.Math.Linear(sprite.y, sprite.getData('targetY'), 0.22);
    }
    if (this.localLabel) this.localLabel.setPosition(this.player.x, this.player.y - 34);
    for (const [id, sprite] of this.remotePlayers) {
      this.playerLabels.get(id)?.setPosition(sprite.x, sprite.y - 34);
    }
    for (const follower of this.followers.values()) {
      const delayed = follower.positions[0];
      if (!delayed) continue;
      const targetX = delayed.x - 28;
      const targetY = delayed.y + 28;
      if (this.reducedMotion) follower.sprite.setPosition(targetX, targetY);
      else {
        follower.sprite.x = Phaser.Math.Linear(follower.sprite.x, targetX, 0.16);
        follower.sprite.y = Phaser.Math.Linear(follower.sprite.y, targetY, 0.16);
      }
      if (follower.positions.length > 3 && Phaser.Math.Distance.Between(follower.sprite.x, follower.sprite.y, targetX, targetY) < 3) {
        follower.positions.shift();
      }
      follower.sprite.setAlpha(follower.status === 'reconnecting' ? 0.42 : follower.status === 'unavailable' ? 0.25 : 0.92);
      follower.label.setPosition(follower.sprite.x, follower.sprite.y + 24);
    }
  }

  private companionTint(kind: string) {
    let hash = 0;
    for (let index = 0; index < kind.length; index += 1) hash = (hash * 31 + kind.charCodeAt(index)) >>> 0;
    return [0xffd37c, 0xa8e6cf, 0xcdb4ff, 0x9ed9ff][hash % 4];
  }
}
