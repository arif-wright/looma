import Phaser from 'phaser';
import { PLAYER_SPEED, normalizeMovement } from './config';
import { getWorldArea, portalAtPosition, type WorldArea, type WorldPortal } from './areas';
import { MovementIntentScheduler } from './movementIntentScheduler';
import type { MovementIntent, WorldSnapshot, PlayerSnapshot } from './protocol';
import { MOONBERRY_INTERACTION } from './traversal';
import { IllustratedArea } from './phaser/illustratedArea';
import { IllustratedActor, ProductionSpriteBank, companionArt } from './phaser/productionSprites';
import { predictAreaMovement, sameArea } from './phaser/presentationState';
import { HeldKeyGuard } from './phaser/heldKeyGuard';

export type TouchDirection = { x: number; y: number };
type MovingActor = { actor: IllustratedActor; x: number; y: number; targetX: number; targetY: number; connected: boolean; moving: boolean };
type FollowerRuntime = MovingActor & {
  positions: Array<{ x: number; y: number }>;
  status: PlayerSnapshot['companionStatus'];
};

export class WorldScene extends Phaser.Scene {
  private player = { x: 180, y: 270 };
  private localActor!: IllustratedActor;
  private bank!: ProductionSpriteBank;
  private area: WorldArea = getWorldArea();
  private scenery: IllustratedArea | null = null;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private readonly remotePlayers = new Map<string, MovingActor>();
  private readonly residents = new Map<string, MovingActor>();
  private readonly followers = new Map<string, FollowerRuntime>();
  private reducedMotion = false;
  private motionQuery: MediaQueryList | null = null;
  private movementSender: ((intent: MovementIntent) => void) | null = null;
  private readonly movementScheduler = new MovementIntentScheduler();
  private hasAuthoritativePosition = false;
  private transitionRevision = -1;
  private ready = false;
  private connectionActive = false;
  private pendingSnapshot: WorldSnapshot | null = null;
  private interactionSender: (() => void) | null = null;
  private promptListener: ((visible: boolean) => void) | null = null;
  private portalSender: (() => void) | null = null;
  private portalPromptListener: ((portal: WorldPortal | null) => void) | null = null;
  private interactionKey!: Phaser.Input.Keyboard.Key;
  private interactionAvailable = false;
  private availablePortal: WorldPortal | null = null;
  private localConnected = true;
  private readonly keyGuard = new HeldKeyGuard();

  constructor(private readonly touchDirection: TouchDirection) { super('wilds-illustrated'); }

  preload() { IllustratedArea.preload(this); ProductionSpriteBank.preload(this); }

  create() {
    this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.reducedMotion = this.motionQuery.matches;
    const updateMotion = (event: MediaQueryListEvent) => { this.reducedMotion = event.matches; };
    this.motionQuery.addEventListener('change', updateMotion);
    this.bank = new ProductionSpriteBank(this);
    this.scenery = new IllustratedArea(this, this.area);
    this.localActor = new IllustratedActor(this, this.bank, this.player.x, this.player.y, 'male', 'You', 'local');
    const keyboard = this.input.keyboard;
    if (!keyboard) throw new Error('Keyboard input is unavailable');
    this.cursors = keyboard.createCursorKeys();
    this.wasd = {
      up: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.W), down: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      left: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.A), right: keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.D)
    };
    this.interactionKey = keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.E);
    const physicalKeyDown = (event: KeyboardEvent) => this.keyGuard.keyDown(event.code, event.repeat,
      this.connectionActive && this.hasAuthoritativePosition && this.localConnected);
    const physicalKeyUp = (event: KeyboardEvent) => this.keyGuard.keyUp(event.code);
    window.addEventListener('keydown', physicalKeyDown, true);
    window.addEventListener('keyup', physicalKeyUp, true);
    this.events.once('shutdown', () => {
      this.motionQuery?.removeEventListener('change', updateMotion);
      window.removeEventListener('keydown', physicalKeyDown, true);
      window.removeEventListener('keyup', physicalKeyUp, true);
      this.scenery?.destroy();
      this.scenery = null;
      this.ready = false;
      this.clearActors();
    });
    this.ready = true;
    if (this.pendingSnapshot) {
      const snapshot = this.pendingSnapshot;
      this.pendingSnapshot = null;
      this.applyNetworkSnapshot(snapshot);
    }
  }

  setMovementSender(sender: (intent: MovementIntent) => void) { this.movementSender = sender; }
  setInteractionHandlers(sender: () => void, promptListener: (visible: boolean) => void) {
    this.interactionSender = sender; this.promptListener = promptListener;
  }
  setPortalHandlers(sender: () => void, promptListener: (portal: WorldPortal | null) => void) {
    this.portalSender = sender; this.portalPromptListener = promptListener;
  }

  setConnectionActive(active: boolean) {
    if (this.connectionActive === active) return;
    if (!active) {
      const stop = this.movementScheduler.next(0, 0, 0);
      if (stop) this.movementSender?.(stop);
      this.touchDirection.x = 0; this.touchDirection.y = 0;
      this.keyGuard.suppressHeld();
      this.input?.keyboard?.resetKeys();
      this.updatePrompts(null, false);
    }
    this.connectionActive = active;
  }

  applyNetworkSnapshot(snapshot: WorldSnapshot) {
    if (!this.ready) { this.pendingSnapshot = snapshot; return; }
    const local = snapshot.players.get(snapshot.localPlayerId);
    if (!local) {
      this.hasAuthoritativePosition = false;
      this.touchDirection.x = 0; this.touchDirection.y = 0;
      this.keyGuard.suppressHeld();
      this.input.keyboard?.resetKeys();
      this.updatePrompts(null, false);
      this.clearActors();
      return;
    }
    const nextArea = getWorldArea(local.mapId);
    const areaChanged = nextArea.id !== this.area.id;
    const transitioned = areaChanged || (this.transitionRevision >= 0 && this.transitionRevision !== (local.transitionRevision ?? 0));
    if (areaChanged) {
      this.scenery?.destroy();
      this.area = nextArea;
      this.scenery = new IllustratedArea(this, this.area);
    }
    if (transitioned) {
      this.clearActors();
      this.touchDirection.x = 0; this.touchDirection.y = 0;
      this.keyGuard.suppressHeld();
      this.input.keyboard?.resetKeys();
      const stop = this.movementScheduler.next(0, 0, 0);
      if (stop) this.movementSender?.(stop);
    }
    const distance = Math.hypot(this.player.x - local.x, this.player.y - local.y);
    const snap = !this.hasAuthoritativePosition || transitioned || distance > 96;
    if (snap) this.player = { x: local.x, y: local.y };
    else {
      this.player.x = Phaser.Math.Linear(this.player.x, local.x, 0.28);
      this.player.y = Phaser.Math.Linear(this.player.y, local.y, 0.28);
    }
    this.transitionRevision = local.transitionRevision ?? 0;
    this.hasAuthoritativePosition = true;
    this.localConnected = local.connected;
    this.localActor.setIdentity(local.playerBody === 'female' ? 'female' : 'male', local.displayName);
    const portal = portalAtPosition(this.area.id, local);
    const gather = this.area.id === 'wilds-exploration' && Math.hypot(local.x - MOONBERRY_INTERACTION.x, local.y - MOONBERRY_INTERACTION.y) <= MOONBERRY_INTERACTION.radius;
    this.updatePrompts(portal, gather);

    const present = new Set<string>();
    const presentFollowers = new Set<string>();
    snapshot.players.forEach((player, id) => {
      if (!sameArea(player.mapId, this.area.id)) return;
      if (player.companionPresent) {
        presentFollowers.add(id);
        let follower = this.followers.get(id);
        if (!follower) {
          const x = player.x - 27, y = player.y + 17;
          follower = { actor: new IllustratedActor(this, this.bank, x, y, companionArt(player.companionKind), player.companionName, 'companion'),
            x, y, targetX: x, targetY: y, connected: player.connected, moving: false,
            positions: [], status: player.companionStatus };
          this.followers.set(id, follower);
        }
        if (snap && id === snapshot.localPlayerId) {
          follower.positions.length = 0;
          follower.x = player.x - 27; follower.y = player.y + 17;
        }
        const last = follower.positions.at(-1);
        if (!last || last.x !== player.x || last.y !== player.y) {
          follower.positions.push({ x: player.x, y: player.y });
          if (follower.positions.length > 8) follower.positions.shift();
        }
        follower.actor.setIdentity(companionArt(player.companionKind), player.companionName);
        follower.status = player.companionStatus;
        follower.connected = player.connected;
      }
      if (id === snapshot.localPlayerId) return;
      present.add(id);
      let remote = this.remotePlayers.get(id);
      if (!remote) {
        remote = { actor: new IllustratedActor(this, this.bank, player.x, player.y, player.playerBody === 'female' ? 'female' : 'male', player.displayName, 'player'),
          x: player.x, y: player.y, targetX: player.x, targetY: player.y, connected: player.connected, moving: false };
        this.remotePlayers.set(id, remote);
      }
      remote.actor.setIdentity(player.playerBody === 'female' ? 'female' : 'male', player.displayName);
      if (Math.hypot(remote.x - player.x, remote.y - player.y) > 160) { remote.x = player.x; remote.y = player.y; }
      remote.targetX = player.x; remote.targetY = player.y; remote.connected = player.connected;
    });
    this.removeAbsent(this.remotePlayers, present);
    this.removeAbsent(this.followers, presentFollowers);

    const presentResidents = new Set<string>();
    snapshot.npcs?.forEach((npc, id) => {
      if (!sameArea(npc.mapId, this.area.id)) return;
      presentResidents.add(id);
      let resident = this.residents.get(id);
      if (!resident) {
        resident = { actor: new IllustratedActor(this, this.bank, npc.x, npc.y, npc.playerBody, `${npc.name} · Resident`, 'resident'),
          x: npc.x, y: npc.y, targetX: npc.x, targetY: npc.y, connected: true, moving: npc.moving };
        this.residents.set(id, resident);
      }
      resident.actor.setIdentity(npc.playerBody, `${npc.name} · Resident`);
      resident.targetX = npc.x; resident.targetY = npc.y; resident.moving = npc.moving;
    });
    this.removeAbsent(this.residents, presentResidents);
  }

  update(time: number, delta: number) {
    if (!this.ready) return;
    const canMove = this.connectionActive && this.hasAuthoritativePosition && this.localConnected;
    const x = canMove ? Number(this.keyGuard.isDown('ArrowRight', this.cursors.right.isDown) || this.keyGuard.isDown('KeyD', this.wasd.right.isDown)) - Number(this.keyGuard.isDown('ArrowLeft', this.cursors.left.isDown) || this.keyGuard.isDown('KeyA', this.wasd.left.isDown)) + this.touchDirection.x : 0;
    const y = canMove ? Number(this.keyGuard.isDown('ArrowDown', this.cursors.down.isDown) || this.keyGuard.isDown('KeyS', this.wasd.down.isDown)) - Number(this.keyGuard.isDown('ArrowUp', this.cursors.up.isDown) || this.keyGuard.isDown('KeyW', this.wasd.up.isDown)) + this.touchDirection.y : 0;
    const direction = normalizeMovement(x, y);
    if (canMove && this.keyGuard.isDown('KeyE', this.interactionKey.isDown) && Phaser.Input.Keyboard.JustDown(this.interactionKey)) {
      if (this.availablePortal) this.portalSender?.();
      else if (this.interactionAvailable) this.interactionSender?.();
    }
    const previous = { ...this.player };
    // Same axis-separated circle test, radius and map-local bounds as authority.
    if (canMove) this.player = predictAreaMovement(this.player, direction, Math.min(delta, 50), PLAYER_SPEED, this.area.traversal);
    const intent = this.movementScheduler.next(direction.x, direction.y, delta);
    if (intent && canMove) this.movementSender?.(intent);
    this.bank.beginFrame();
    const localResult = this.localActor.update(this.player.x, this.player.y, this.player.x - previous.x, this.player.y - previous.y,
      Math.hypot(this.player.x - previous.x, this.player.y - previous.y) > 0.01, delta, this.reducedMotion, this.localConnected ? 1 : 0.5);
    const blend = this.reducedMotion ? 1 : 1 - Math.exp(-Math.min(delta, 100) / 65);
    for (const actor of [...this.remotePlayers.values(), ...this.residents.values()]) {
      const dx = actor.targetX - actor.x, dy = actor.targetY - actor.y;
      actor.x += dx * blend; actor.y += dy * blend;
      actor.actor.update(actor.x, actor.y, dx, dy, Math.hypot(dx, dy) > 0.45, delta, this.reducedMotion, actor.connected ? 1 : 0.4);
    }
    for (const follower of this.followers.values()) {
      const delayed = follower.positions[0];
      if (!delayed) continue;
      const dx = delayed.x - 27 - follower.x, dy = delayed.y + 17 - follower.y;
      follower.x += dx * (this.reducedMotion ? 1 : blend * 0.65);
      follower.y += dy * (this.reducedMotion ? 1 : blend * 0.65);
      if (follower.positions.length > 1 && Math.hypot(dx, dy) < 5) follower.positions.shift();
      follower.actor.update(follower.x, follower.y, dx, dy, Math.hypot(dx, dy) > 0.9, delta, this.reducedMotion,
        follower.status === 'reconnecting' ? 0.42 : follower.status === 'unavailable' ? 0.25 : 1);
    }
    this.scenery?.update(time, this.player, this.reducedMotion);
    const live = new Set([this.localActor.sprite.texture.key]);
    for (const entry of [...this.remotePlayers.values(), ...this.residents.values(), ...this.followers.values()]) live.add(entry.actor.sprite.texture.key);
    this.bank.prune(live);
    Object.assign(this.game.canvas.dataset, {
      renderer: 'phaser', areaId: this.area.id, localPlayerX: this.player.x.toFixed(2), localPlayerY: this.player.y.toFixed(2),
      localSpriteLoad: localResult.loaded ? 'loaded' : localResult.failed ? 'fallback' : 'loading',
      visiblePlayerCount: String(this.remotePlayers.size + 1), residentCount: String(this.residents.size), followerCount: String(this.followers.size),
      predictionBlockerCount: String(this.area.traversal.blockers.length), reducedMotion: String(this.reducedMotion),
      connectionActive: String(this.connectionActive), facing: this.localActor.facing,
      spritePageCount: String(this.bank.metrics.loadedPages),
      spriteDecodedMibEstimate: (this.bank.metrics.estimatedDecodedBytes / 1048576).toFixed(2),
      spriteProtectedMibEstimate: (this.bank.metrics.protectedDecodedBytes / 1048576).toFixed(2),
      spriteCacheTargetMib: (this.bank.metrics.targetBytes / 1048576).toFixed(0)
    });
  }

  private updatePrompts(portal: WorldPortal | null, gather: boolean) {
    if (this.availablePortal?.id !== portal?.id) { this.availablePortal = portal; this.portalPromptListener?.(portal); }
    if (this.interactionAvailable !== gather) { this.interactionAvailable = gather; this.promptListener?.(gather); }
  }
  private removeAbsent<T extends MovingActor>(actors: Map<string, T>, present: Set<string>) {
    for (const [id, runtime] of actors) if (!present.has(id)) { runtime.actor.destroy(); actors.delete(id); }
  }
  private clearActors() {
    for (const actors of [this.remotePlayers, this.residents, this.followers]) {
      for (const runtime of actors.values()) runtime.actor.destroy();
      actors.clear();
    }
  }
}
