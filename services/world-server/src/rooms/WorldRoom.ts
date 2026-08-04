import { Client, ErrorCode, Room, ServerError } from 'colyseus';
import { createLogger } from '../log.js';
import {
  MOVEMENT_MESSAGE,
  COMPANION_REFRESH_MESSAGE,
  GATHER_MESSAGE,
  GATHER_RESULT_MESSAGE,
  PROTOCOL_ERROR_MESSAGE,
  WORLD_PROTOCOL_VERSION,
  type MovementIntent
} from '../protocol.js';
import { applyMovement, parseMovementIntent } from '../simulation/movement.js';
import { SlidingWindowRateLimiter } from '../security/rateLimiter.js';
import { PlayerState, WorldState } from './state.js';
import { applyPresenceTransition } from './presence.js';
import {
  parseJoinCredential, verifyWorldTicket, worldTicketReplayGuard, type WorldAuth
} from '../auth/ticket.js';
import type { WorldPersistence } from '../persistence/worldPersistence.js';
import { gatherNodeAtPosition, isValidWorldPosition, landmarkAtPosition, WORLD_MAPS, type WorldMapDefinition } from '../world/maps.js';

type ClientRuntime = {
  input: MovementIntent;
  movementLimiter: SlidingWindowRateLimiter;
  malformedLimiter: SlidingWindowRateLimiter;
  companionRefreshLimiter: SlidingWindowRateLimiter;
  gatherLimiter: SlidingWindowRateLimiter;
  stateVersion: number;
  lastCheckpointAt: number;
  dirty: boolean;
  saveInFlight: Promise<void> | null;
  discoveries: Set<string>;
  pendingDiscoveries: Set<string>;
  discoveryInFlight: Map<string, Promise<void>>;
};

type WorldRoomOptions = {
  maxClients?: number;
  reconnectGraceSeconds?: number;
  logLevel?: 'debug' | 'info';
  joinSecret?: string;
  map?: WorldMapDefinition;
  checkpointSeconds?: number;
  persistence?: WorldPersistence | null;
};

type WorldClient = Client<{ userData: ClientRuntime; auth: WorldAuth }>;

const spawnFor = (index: number) => ({
  x: 120 + (index % 4) * 70,
  y: 120 + Math.floor(index / 4) * 70
});

export class WorldRoom extends Room<{ state: WorldState; client: WorldClient }> {
  private static authJoinSecret = '';
  private static authLog = createLogger('info');

  static configureAuth(joinSecret: string, logLevel: 'debug' | 'info') {
    WorldRoom.authJoinSecret = joinSecret;
    WorldRoom.authLog = createLogger(logLevel);
  }

  static async onAuth(_token: string, options: unknown) {
    const ticket = parseJoinCredential(options);
    const result = verifyWorldTicket(ticket, WorldRoom.authJoinSecret);
    if (!result.ok) {
      WorldRoom.authLog.warn('world.auth.rejected', { reason: result.reason });
      throw new ServerError(ErrorCode.AUTH_FAILED, 'World authorization failed');
    }
    if (!worldTicketReplayGuard.consume(result.auth)) {
      WorldRoom.authLog.warn('world.auth.rejected', { reason: 'replayed' });
      throw new ServerError(ErrorCode.AUTH_FAILED, 'World authorization failed');
    }
    return result.auth;
  }

  state = new WorldState();
  patchRate = 50;
  maxMessagesPerSecond = 40;
  private reconnectGraceSeconds = 20;
  private log = createLogger('info');
  private joinSecret = '';
  private map: WorldMapDefinition = WORLD_MAPS['wilds-exploration'];
  private checkpointMs = 15_000;
  private persistence: WorldPersistence | null = null;
  private readonly pendingPersistence = new Set<Promise<void>>();

  onCreate(options: WorldRoomOptions) {
    this.maxClients = options.maxClients ?? 32;
    this.reconnectGraceSeconds = options.reconnectGraceSeconds ?? 20;
    this.log = createLogger(options.logLevel ?? 'info');
    this.joinSecret = options.joinSecret ?? '';
    this.map = options.map ?? WORLD_MAPS['wilds-exploration'];
    this.checkpointMs = Math.max(5_000, (options.checkpointSeconds ?? 15) * 1_000);
    this.persistence = options.persistence ?? null;
    this.setMetadata({ protocolVersion: WORLD_PROTOCOL_VERSION });
    this.onMessage(MOVEMENT_MESSAGE, (client, value: unknown) => this.handleMovement(client, value));
    this.onMessage(COMPANION_REFRESH_MESSAGE, (client, value: unknown) => this.handleCompanionRefresh(client, value));
    this.onMessage(GATHER_MESSAGE, (client, value: unknown) => void this.handleGather(client, value));
    this.setSimulationInterval((deltaMs) => this.simulate(deltaMs), 50);
    this.log.info('world.room.created', { maxClients: this.maxClients });
  }

  async onJoin(client: WorldClient) {
    const auth = client.auth;
    if (!auth) throw new ServerError(ErrorCode.AUTH_FAILED, 'World authorization failed');
    if (this.clients.some((other) => other !== client && (other.auth as WorldAuth | undefined)?.userId === auth.userId)) {
      this.log.warn('world.auth.rejected', { reason: 'duplicate_account' });
      throw new ServerError(ErrorCode.AUTH_FAILED, 'World authorization failed');
    }
    const spawn = spawnFor(this.state.players.size);
    const player = new PlayerState();
    player.x = spawn.x;
    player.y = spawn.y;
    player.colorIndex = this.state.players.size % 6;
    player.displayName = auth.displayName;
    player.handle = auth.handle ?? '';
    this.applyCompanion(player, auth.companion);
    this.state.players.set(client.sessionId, player);
    client.userData = {
      input: { sequence: 0, x: 0, y: 0 },
      movementLimiter: new SlidingWindowRateLimiter(25, 1000),
      malformedLimiter: new SlidingWindowRateLimiter(5, 10_000),
      companionRefreshLimiter: new SlidingWindowRateLimiter(1, 10_000),
      gatherLimiter: new SlidingWindowRateLimiter(4, 5_000),
      stateVersion: 0,
      lastCheckpointAt: Date.now(),
      dirty: false,
      saveInFlight: null,
      discoveries: new Set<string>(),
      pendingDiscoveries: new Set<string>(),
      discoveryInFlight: new Map<string, Promise<void>>()
    };
    if (this.persistence) {
      try {
        const loaded = await this.persistence.load(auth.userId, this.map);
        player.x = loaded.position.x;
        player.y = loaded.position.y;
        client.userData.stateVersion = loaded.stateVersion;
        client.userData.discoveries = loaded.discoveries;
        client.userData.dirty = !loaded.restored;
      } catch {
        player.x = this.map.spawn.x;
        player.y = this.map.spawn.y;
        client.userData.dirty = true;
        this.log.warn('world.persistence.load_failed', { playerId: client.sessionId });
      }
    }
    this.log.info('world.player.joined', { playerId: client.sessionId, players: this.state.players.size });
  }

  async onDrop(client: WorldClient, code?: number) {
    const player = this.state.players.get(client.sessionId);
    applyPresenceTransition(player, 'drop');
    if (client.userData) client.userData.input = { sequence: client.userData.input.sequence, x: 0, y: 0 };
    this.log.warn('world.player.dropped', { playerId: client.sessionId, code });
    const checkpoint = this.queueCheckpoint(client, true);
    if (code === 4002 || code === 4003) {
      await checkpoint;
      this.state.players.delete(client.sessionId);
      return;
    }
    // Register the reconnect token immediately. A persistence checkpoint must
    // not make a fast client retry miss its grace window.
    const reconnection = this.allowReconnection(client, this.reconnectGraceSeconds);
    await checkpoint;
    try {
      await reconnection;
    } catch {
      this.state.players.delete(client.sessionId);
      this.log.info('world.player.reconnect_expired', { playerId: client.sessionId });
    }
  }

  onReconnect(client: WorldClient) {
    const player = this.state.players.get(client.sessionId);
    applyPresenceTransition(player, 'reconnect');
    this.log.info('world.player.reconnected', { playerId: client.sessionId });
  }

  async onLeave(client: WorldClient, code?: number) {
    await this.queueCheckpoint(client, true);
    if (applyPresenceTransition(this.state.players.get(client.sessionId), 'leave') === 'remove') {
      this.state.players.delete(client.sessionId);
    }
    this.log.info('world.player.left', { playerId: client.sessionId, code, players: this.state.players.size });
  }

  onBeforeShutdown() {
    for (const client of this.clients) void this.queueCheckpoint(client as WorldClient, true);
    this.broadcast('server-shutdown', { retry: true });
    this.log.info('world.room.shutdown');
  }

  onUncaughtException(error: Error, methodName: string) {
    this.log.error('world.room.exception', { methodName, message: error.message });
  }

  async onDispose() {
    await Promise.allSettled([...this.pendingPersistence]);
  }

  private handleMovement(client: WorldClient, value: unknown) {
    const runtime = client.userData;
    if (!runtime) return;

    const input = parseMovementIntent(value);
    if (!input) {
      client.send(PROTOCOL_ERROR_MESSAGE, { code: 'malformed_message' });
      this.log.warn('world.input.malformed', { playerId: client.sessionId });
      if (!runtime.malformedLimiter.accept()) client.leave(4002, 'malformed input');
      return;
    }
    if (!runtime.movementLimiter.accept()) {
      client.send(PROTOCOL_ERROR_MESSAGE, { code: 'rate_limited' });
      this.log.warn('world.input.rate_limited', { playerId: client.sessionId });
      // Reject the excess intent without destroying an otherwise healthy room.
      // Colyseus' room-level message cap remains the terminal flood protection.
      return;
    }
    if (input.sequence <= runtime.input.sequence) {
      client.send(PROTOCOL_ERROR_MESSAGE, { code: 'stale_sequence' });
      return;
    }
    runtime.input = input;
  }

  private simulate(deltaMs: number) {
    this.state.tick = (this.state.tick + 1) >>> 0;
    for (const client of this.clients) {
      const player = this.state.players.get(client.sessionId);
      if (!player?.connected || !client.userData) continue;
      const next = applyMovement(player, client.userData.input, deltaMs);
      player.x = next.x;
      player.y = next.y;
      player.acknowledgedSequence = client.userData.input.sequence;
      player.companionStatus = player.companionPresent
        ? (client.userData.input.x !== 0 || client.userData.input.y !== 0 ? 'moving' : 'idle')
        : 'unavailable';
      if (client.userData.input.x !== 0 || client.userData.input.y !== 0) client.userData.dirty = true;
      if (client.userData.dirty && Date.now() - client.userData.lastCheckpointAt >= this.checkpointMs) {
        void this.queueCheckpoint(client, false);
      }
      this.checkLandmark(client, player);
    }
  }

  private handleCompanionRefresh(client: WorldClient, value: unknown) {
    const runtime = client.userData;
    if (!runtime?.companionRefreshLimiter.accept()) {
      client.send(PROTOCOL_ERROR_MESSAGE, { code: 'rate_limited' });
      return;
    }
    const result = verifyWorldTicket(parseJoinCredential(value), this.joinSecret);
    if (!result.ok || result.auth.userId !== client.auth?.userId || !worldTicketReplayGuard.consume(result.auth)) {
      this.log.warn('world.companion.refresh_rejected', { reason: result.ok ? 'identity_or_replay' : result.reason });
      return;
    }
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    client.auth = { ...client.auth, companion: result.auth.companion };
    this.applyCompanion(player, result.auth.companion);
  }

  private async handleGather(client: WorldClient, value: unknown) {
    const runtime = client.userData;
    const player = this.state.players.get(client.sessionId);
    const request = value && typeof value === 'object' && !Array.isArray(value)
      ? value as Record<string, unknown> : null;
    const requestId = typeof request?.requestId === 'string' ? request.requestId : '';
    const validShape = request !== null && Object.keys(request).length === 2
      && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)
      && request.nodeKey === 'moonberry-bush';
    if (!runtime || !player || !validShape) {
      if (requestId) client.send(GATHER_RESULT_MESSAGE, { requestId, status: 'failure' });
      this.log.warn('world.gather.rejected', { playerId: client.sessionId, reason: 'malformed' });
      return;
    }
    if (!runtime.gatherLimiter.accept()) {
      client.send(GATHER_RESULT_MESSAGE, { requestId, status: 'failure' });
      this.log.warn('world.gather.rejected', { playerId: client.sessionId, reason: 'rate_limited' });
      return;
    }
    const node = gatherNodeAtPosition(this.map, request.nodeKey, player);
    if (!node) {
      client.send(GATHER_RESULT_MESSAGE, { requestId, status: 'out_of_range' });
      this.log.info('world.gather.rejected', { playerId: client.sessionId, reason: 'out_of_range' });
      return;
    }
    if (!this.persistence) {
      client.send(GATHER_RESULT_MESSAGE, { requestId, status: 'unavailable' });
      return;
    }
    await runtime.discoveryInFlight.get(node.landmarkKey);
    if (!runtime.discoveries.has(node.landmarkKey)) {
      client.send(GATHER_RESULT_MESSAGE, { requestId, status: 'unavailable' });
      return;
    }
    try {
      const result = await this.persistence.gather({
        userId: client.auth!.userId,
        map: this.map,
        nodeKey: node.key,
        x: player.x,
        y: player.y,
        idempotencyKey: `moonberry:${requestId}`
      });
      client.send(GATHER_RESULT_MESSAGE, { requestId, ...result });
      this.log.info('world.gather.completed', {
        playerId: client.sessionId, node: node.key, status: result.status, replayed: result.replayed
      });
    } catch {
      client.send(GATHER_RESULT_MESSAGE, { requestId, status: 'failure' });
      this.log.warn('world.gather.failed', { playerId: client.sessionId, node: node.key });
    }
  }

  private applyCompanion(player: PlayerState, companion: WorldAuth['companion']) {
    player.companionPresent = companion.present;
    player.companionName = companion.present ? companion.name : '';
    player.companionKind = companion.present ? companion.kind : '';
    player.companionStatus = companion.present ? 'idle' : 'unavailable';
    player.companionRevision = (player.companionRevision + 1) >>> 0;
  }

  private queueCheckpoint(client: WorldClient, force: boolean) {
    const runtime = client.userData;
    const player = this.state.players.get(client.sessionId);
    if (!this.persistence || !runtime || !player || runtime.stateVersion < 0) return Promise.resolve();
    if (runtime.saveInFlight) return runtime.saveInFlight;
    if (!force && !runtime.dirty) return Promise.resolve();

    const position = isValidWorldPosition(this.map, player)
      ? { x: player.x, y: player.y }
      : { ...this.map.spawn };
    const expectedStateVersion = runtime.stateVersion;
    let operation!: Promise<void>;
    operation = this.persistence.save({
      userId: client.auth!.userId,
      map: this.map,
      x: position.x,
      y: position.y,
      expectedStateVersion
    }).then((result) => {
      if (result.ok) {
        runtime.stateVersion = result.stateVersion;
        runtime.lastCheckpointAt = Date.now();
        runtime.dirty = player.x !== position.x || player.y !== position.y;
      } else {
        runtime.dirty = false;
        this.log.warn('world.persistence.version_conflict', { playerId: client.sessionId });
      }
    }).catch(() => {
      runtime.dirty = true;
      this.log.warn('world.persistence.save_failed', { playerId: client.sessionId });
    }).finally(() => {
      runtime.saveInFlight = null;
      this.pendingPersistence.delete(operation);
    });
    runtime.saveInFlight = operation;
    this.pendingPersistence.add(operation);
    return operation;
  }

  private checkLandmark(client: WorldClient, player: PlayerState) {
    const runtime = client.userData;
    if (!this.persistence || !runtime) return;
    const landmark = landmarkAtPosition(this.map, player);
    if (!landmark || runtime.discoveries.has(landmark.key) || runtime.pendingDiscoveries.has(landmark.key)) return;
    runtime.pendingDiscoveries.add(landmark.key);
    let operation!: Promise<void>;
    operation = this.persistence.discover({
      userId: client.auth!.userId,
      map: this.map,
      landmarkKey: landmark.key,
      x: player.x,
      y: player.y,
      idempotencyKey: `world:${this.map.id}:${this.map.version}:${landmark.key}`
    }).then(() => {
      runtime.discoveries.add(landmark.key);
    }).catch(() => {
      this.log.warn('world.persistence.discovery_failed', { playerId: client.sessionId, landmark: landmark.key });
    }).finally(() => {
      runtime.pendingDiscoveries.delete(landmark.key);
      runtime.discoveryInFlight.delete(landmark.key);
      this.pendingPersistence.delete(operation);
    });
    runtime.discoveryInFlight.set(landmark.key, operation);
    this.pendingPersistence.add(operation);
  }
}
