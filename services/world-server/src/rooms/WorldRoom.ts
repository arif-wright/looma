import { Client, CloseCode, ErrorCode, Room, ServerError } from 'colyseus';
import { createLogger } from '../log.js';
import {
  MOVEMENT_MESSAGE,
  COMPANION_REFRESH_MESSAGE,
  GATHER_MESSAGE,
  GATHER_RESULT_MESSAGE,
  PROTOCOL_ERROR_MESSAGE,
  PORTAL_MESSAGE, PORTAL_RESULT_MESSAGE, type PortalResult,
  WORLD_PROTOCOL_VERSION,
  type MovementIntent
} from '../protocol.js';
import { applyMovement, parseMovementIntent } from '../simulation/movement.js';
import { SlidingWindowRateLimiter } from '../security/rateLimiter.js';
import { NpcState, PlayerState, WorldState } from './state.js';
import { applyPresenceTransition } from './presence.js';
import {
  parseJoinCredential, verifyWorldTicket, worldTicketReplayGuard, type WorldAuth
} from '../auth/ticket.js';
import type { WorldPersistence } from '../persistence/worldPersistence.js';
import { gatherNodeAtPosition, isWorldMapId, isValidWorldPosition, landmarkAtPosition, WORLD_MAPS, type WorldMapDefinition } from '../world/maps.js';

import { parsePortalRequest, resolvePortal, PORTAL_COOLDOWN_MS } from '../world/portals.js';
import { WORLD_NPCS, npcPositionAt } from '../world/npcs.js';

type ClientRuntime = {
  loading: boolean;
  leaving: boolean;
  gathering: boolean;
  portalLimiter: SlidingWindowRateLimiter;
  portalResults: Map<string, PortalResult>;
  portalRequestId: string | null;
  lastPortalAt: number;
  transitionInFlight: Promise<void> | null;
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
      throw new ServerError(401, 'World authorization failed');
    }
    if (!worldTicketReplayGuard.consume(result.auth)) {
      WorldRoom.authLog.warn('world.auth.rejected', { reason: 'replayed' });
      throw new ServerError(401, 'World authorization failed');
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
  private elapsedMs = 0;
  private checkpointMs = 15_000;
  private persistence: WorldPersistence | null = null;
  private readonly pendingPersistence = new Set<Promise<void>>();
  // Includes dropped clients and pending joins, which Colyseus removes from clients
  // before their asynchronous lifecycle hooks have finished.
  private readonly activeClients = new Map<string, WorldClient>();
  private draining = false;
  private persistenceClosed = false;
  private readonly shutdownDrainMs = 12_000;
  private shutdownTask: Promise<void> | null = null;
  private signalShutdown!: () => void;
  private readonly shutdownStarted = new Promise<void>((resolve) => { this.signalShutdown = resolve; });
  private releaseDrain!: () => void;
  private readonly drainReleased = new Promise<void>((resolve) => { this.releaseDrain = resolve; });

  onCreate(options: WorldRoomOptions) {
    this.maxClients = options.maxClients ?? 32;
    this.reconnectGraceSeconds = options.reconnectGraceSeconds ?? 20;
    this.log = createLogger(options.logLevel ?? 'info');
    this.joinSecret = options.joinSecret ?? '';
    this.map = options.map ?? WORLD_MAPS['wilds-exploration'];
    this.checkpointMs = Math.max(5_000, (options.checkpointSeconds ?? 15) * 1_000);
    this.persistence = options.persistence ?? null;
    this.setMetadata({ protocolVersion: WORLD_PROTOCOL_VERSION });
    for (const definition of WORLD_NPCS) {
      const npc = new NpcState();
      Object.assign(npc, { id: definition.id, name: definition.name, mapId: definition.mapId, kind: definition.kind, playerBody: definition.playerBody, ...npcPositionAt(definition, 0) });
      this.state.npcs.set(definition.id, npc);
    }
    this.onMessage(PORTAL_MESSAGE, (client, value: unknown) => void this.handlePortal(client, value));
    this.onMessage(MOVEMENT_MESSAGE, (client, value: unknown) => this.handleMovement(client, value));
    this.onMessage(COMPANION_REFRESH_MESSAGE, (client, value: unknown) => this.handleCompanionRefresh(client, value));
    this.onMessage(GATHER_MESSAGE, (client, value: unknown) => void this.handleGather(client, value));
    this.setSimulationInterval((deltaMs) => this.simulate(deltaMs), 50);
    this.log.info('world.room.created', { maxClients: this.maxClients });
  }

  async onJoin(client: WorldClient) {
    if (this.draining) throw new ServerError(CloseCode.SERVER_SHUTDOWN, 'World is restarting');
    const auth = client.auth;
    if (!auth) throw new ServerError(ErrorCode.AUTH_FAILED, 'World authorization failed');
    if (this.clients.some((other) => other !== client && (other.auth as WorldAuth | undefined)?.userId === auth.userId)) {
      this.log.warn('world.auth.rejected', { reason: 'duplicate_account' });
      throw new ServerError(ErrorCode.AUTH_FAILED, 'World authorization failed');
    }
    const candidateSpawn = spawnFor(this.state.players.size);
    const spawn = isValidWorldPosition(this.map, candidateSpawn) ? candidateSpawn : this.map.spawn;
    const player = new PlayerState();
    player.mapId = this.map.id;
    player.connected = false;
    player.x = spawn.x;
    player.y = spawn.y;
    player.colorIndex = this.state.players.size % 6;
    player.displayName = auth.displayName;
    player.handle = auth.handle ?? '';
    player.playerBody = auth.playerBody;
    this.applyCompanion(player, auth.companion);
    this.state.players.set(client.sessionId, player);
    client.userData = {
      loading: true, leaving: false, gathering: false,
      portalLimiter: new SlidingWindowRateLimiter(5, 5_000),
      portalResults: new Map(), portalRequestId: null, lastPortalAt: -Infinity, transitionInFlight: null,
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
    this.activeClients.set(client.sessionId, client);
    if (this.persistence) {
      try {
        const loaded = await Promise.race([
          this.persistence.load(auth.userId, this.map),
          this.shutdownStarted.then(() => { throw new ServerError(CloseCode.SERVER_SHUTDOWN, 'World is restarting'); })
        ]);
        if (this.draining) throw new ServerError(CloseCode.SERVER_SHUTDOWN, 'World is restarting');
        const loadedMap = loaded.mapId && isWorldMapId(loaded.mapId) ? WORLD_MAPS[loaded.mapId] : this.map;
        player.mapId = loadedMap.id;
        const restoredPosition = isValidWorldPosition(loadedMap, loaded.position) ? loaded.position : loadedMap.spawn;
        player.x = restoredPosition.x;
        player.y = restoredPosition.y;
        client.userData.stateVersion = loaded.stateVersion;
        client.userData.discoveries = new Set([...loaded.discoveries].map((key) => `${player.mapId}:${key}`));
        client.userData.dirty = !loaded.restored;
      } catch (error) {
        if (this.draining) {
          this.state.players.delete(client.sessionId);
          this.activeClients.delete(client.sessionId);
          throw error;
        }
        player.x = this.map.spawn.x;
        player.y = this.map.spawn.y;
        client.userData.dirty = true;
        this.log.warn('world.persistence.load_failed', { playerId: client.sessionId });
      }
    }
    client.userData.loading = false;
    player.connected = true;
    this.log.info('world.player.joined', { playerId: client.sessionId, players: this.state.players.size });
  }

  async onDrop(client: WorldClient, code?: number) {
    const player = this.state.players.get(client.sessionId);
    applyPresenceTransition(player, 'drop');
    if (client.userData) client.userData.input = { sequence: client.userData.input.sequence, x: 0, y: 0 };
    this.log.warn('world.player.dropped', { playerId: client.sessionId, code });
    const checkpoint = this.draining ? this.drainReleased : Promise.race([this.queueCheckpoint(client, true), this.drainReleased]);
    if (this.draining || code === CloseCode.SERVER_SHUTDOWN || code === 4002 || code === 4003 || code === 4004) {
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
    if (this.draining) throw new ServerError(CloseCode.SERVER_SHUTDOWN, 'World is restarting');
    this.activeClients.set(client.sessionId, client);
    const player = this.state.players.get(client.sessionId);
    applyPresenceTransition(player, 'reconnect');
    this.log.info('world.player.reconnected', { playerId: client.sessionId });
  }

  async onLeave(client: WorldClient, code?: number) {
    if (client.userData) client.userData.leaving = true;
    const leavingPlayer = this.state.players.get(client.sessionId);
    if (leavingPlayer) leavingPlayer.connected = false;
    await (this.draining ? this.drainReleased : Promise.race([this.queueCheckpoint(client, true), this.drainReleased]));
    this.activeClients.delete(client.sessionId);
    if (applyPresenceTransition(this.state.players.get(client.sessionId), 'leave') === 'remove') {
      this.state.players.delete(client.sessionId);
    }
    this.log.info('world.player.left', { playerId: client.sessionId, code, players: this.state.players.size });
  }

  onBeforeShutdown() {
    if (this.shutdownTask) return this.shutdownTask;
    this.draining = true;
    this.signalShutdown();
    // Colyseus also locks rooms during process shutdown. Lock here as well so
    // direct lifecycle calls cannot admit a newly reserved seat.
    void this.lock();
    for (const client of this.activeClients.values()) {
      const runtime = client.userData;
      if (runtime) {
        runtime.leaving = true;
        runtime.input = { ...runtime.input, x: 0, y: 0 };
      }
      const player = this.state.players.get(client.sessionId);
      if (player) player.connected = false;
    }
    this.broadcast('server-shutdown', { retry: true });
    this.shutdownTask = this.drainAndDisconnect();
    return this.shutdownTask;
  }

  private async drainAndDisconnect() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<false>((resolve) => {
      timer = setTimeout(() => resolve(false), this.shutdownDrainMs);
    });
    const drain = (async () => {
      // queueCheckpoint waits an old save and an already-started portal before
      // capturing the final position. Never race a final save against travel.
      await Promise.allSettled([...this.activeClients.values()].map((client) => this.queueCheckpoint(client, true)));
      while (this.pendingPersistence.size) await Promise.allSettled([...this.pendingPersistence]);
      return true;
    })();
    const completed = await Promise.race([drain, deadline]);
    clearTimeout(timer);
    // A deadline is not proof of database cancellation. Fence every continuation
    // before releasing lifecycle hooks; late results cannot enqueue more writes.
    // Existing save/travel RPCs still carry the original database CAS version.
    this.persistenceClosed = true;
    this.releaseDrain();
    this.log.info('world.room.shutdown', {
      drained: completed,
      pendingWrites: this.pendingPersistence.size,
      unsavedPlayers: [...this.activeClients.values()].filter((client) => client.userData?.dirty).length
    });
    await this.disconnect(CloseCode.SERVER_SHUTDOWN);
  }

  onUncaughtException(error: Error, methodName: string) {
    this.log.error('world.room.exception', { methodName, message: error.message });
  }

  async onDispose() {
    while (!this.persistenceClosed && this.pendingPersistence.size) {
      await Promise.race([Promise.allSettled([...this.pendingPersistence]), this.drainReleased]);
    }
  }

  private handleMovement(client: WorldClient, value: unknown) {
    const runtime = client.userData;
    if (!runtime || runtime.stateVersion < 0 || runtime.leaving || runtime.transitionInFlight || !this.state.players.get(client.sessionId)?.connected) return;

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
    if (this.draining) return;
    this.state.tick = (this.state.tick + 1) >>> 0;
    this.elapsedMs = (this.elapsedMs + Math.max(0, Math.min(100, Number.isFinite(deltaMs) ? deltaMs : 0)));
    for (const definition of WORLD_NPCS) Object.assign(this.state.npcs.get(definition.id)!, npcPositionAt(definition, this.elapsedMs));
    for (const client of this.clients) {
      const player = this.state.players.get(client.sessionId);
      if (!player?.connected || !client.userData || client.userData.stateVersion < 0 || client.userData.leaving || client.userData.transitionInFlight) continue;
      const map = this.playerMap(player);
      const next = applyMovement(player, client.userData.input, deltaMs, map.traversal);
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
    if (this.draining || client.userData?.leaving) return;
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
    client.auth = { ...client.auth, companion: result.auth.companion, playerBody: result.auth.playerBody };
    player.playerBody = result.auth.playerBody;
    this.applyCompanion(player, result.auth.companion);
  }

  private handleGather(client: WorldClient, value: unknown) {
    if (this.draining) return Promise.resolve();
    const operation = this.performGather(client, value).finally(() => this.pendingPersistence.delete(operation));
    this.pendingPersistence.add(operation);
    return operation;
  }

  private async performGather(client: WorldClient, value: unknown) {
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
    if (!player.connected || runtime.stateVersion < 0 || runtime.leaving || runtime.transitionInFlight || runtime.gathering) {
      client.send(GATHER_RESULT_MESSAGE, { requestId, status: 'unavailable' });
      return;
    }
    const map = this.playerMap(player);
    const position = { x: player.x, y: player.y };
    const node = gatherNodeAtPosition(map, request.nodeKey, position);
    if (!node) {
      client.send(GATHER_RESULT_MESSAGE, { requestId, status: 'out_of_range' });
      this.log.info('world.gather.rejected', { playerId: client.sessionId, reason: 'out_of_range' });
      return;
    }
    if (!this.persistence) {
      client.send(GATHER_RESULT_MESSAGE, { requestId, status: 'unavailable' });
      return;
    }
    const discoveryKey = `${map.id}:${node.landmarkKey}`;
    runtime.gathering = true;
    await runtime.discoveryInFlight.get(discoveryKey);
    if (this.persistenceClosed || !runtime.discoveries.has(discoveryKey) || !player.connected || runtime.leaving || player.mapId !== map.id) {
      runtime.gathering = false;
      client.send(GATHER_RESULT_MESSAGE, { requestId, status: 'unavailable' });
      return;
    }
    try {
      const result = await this.persistence.gather({
        userId: client.auth!.userId,
        map,
        nodeKey: node.key,
        x: position.x,
        y: position.y,
        idempotencyKey: `moonberry:${requestId}`
      });
      if (this.persistenceClosed) return;
      client.send(GATHER_RESULT_MESSAGE, { requestId, ...result });
      this.log.info('world.gather.completed', {
        playerId: client.sessionId, node: node.key, status: result.status, replayed: result.replayed
      });
    } catch {
      if (this.persistenceClosed) return;
      client.send(GATHER_RESULT_MESSAGE, { requestId, status: 'failure' });
      this.log.warn('world.gather.failed', { playerId: client.sessionId, node: node.key });
    } finally { runtime.gathering = false; }
  }

  private applyCompanion(player: PlayerState, companion: WorldAuth['companion']) {
    player.companionPresent = companion.present;
    player.companionName = companion.present ? companion.name : '';
    player.companionKind = companion.present ? companion.kind : '';
    player.companionStatus = companion.present ? 'idle' : 'unavailable';
    player.companionRevision = (player.companionRevision + 1) >>> 0;
  }

  private playerMap(player: PlayerState): WorldMapDefinition {
    return isWorldMapId(player.mapId) ? WORLD_MAPS[player.mapId] : this.map;
  }

  private handlePortal(client: WorldClient, value: unknown) {
    const runtime = client.userData;
    const player = this.state.players.get(client.sessionId);
    if (this.draining || !runtime || !player || !player.connected || runtime.leaving) return Promise.resolve();
    const permitted = runtime.portalLimiter.accept();
    const request = parsePortalRequest(value);
    if (!request) {
      client.send(PROTOCOL_ERROR_MESSAGE, { code: 'malformed_message' });
      return Promise.resolve();
    }
    if (!permitted) {
      client.send(PORTAL_RESULT_MESSAGE, { requestId: request.requestId, status: 'cooldown' });
      return Promise.resolve();
    }
    const previous = runtime.portalResults.get(request.requestId);
    if (previous) { client.send(PORTAL_RESULT_MESSAGE, previous); return Promise.resolve(); }
    if (runtime.portalRequestId === request.requestId) return runtime.transitionInFlight ?? Promise.resolve();
    const reply = (status: PortalResult['status'], mapId?: WorldMapDefinition['id']) => {
      const result: PortalResult = { requestId: request.requestId, status, ...(mapId ? { mapId } : {}) };
      runtime.portalResults.set(request.requestId, result);
      if (runtime.portalResults.size > 16) runtime.portalResults.delete(runtime.portalResults.keys().next().value!);
      client.send(PORTAL_RESULT_MESSAGE, result);
    };
    if (runtime.transitionInFlight || runtime.gathering || Date.now() - runtime.lastPortalAt < PORTAL_COOLDOWN_MS) {
      reply('cooldown'); return Promise.resolve();
    }
    const sourceMap = this.playerMap(player);
    const position = { x: player.x, y: player.y };
    const target = resolvePortal(sourceMap, request.portalId, position);
    if (!target) { reply('out_of_range'); return Promise.resolve(); }
    if (this.persistence && (!this.persistence.travel || runtime.stateVersion <= 0)) {
      reply('unavailable'); return Promise.resolve();
    }
    runtime.input = { ...runtime.input, x: 0, y: 0 };
    runtime.portalRequestId = request.requestId;
    let operation!: Promise<void>;
    operation = (async () => {
      // A save captured in the source area must settle before the atomic travel CAS.
      await runtime.saveInFlight;
      if (this.persistenceClosed || !player.connected || runtime.stateVersion < 0 || runtime.leaving || this.state.players.get(client.sessionId) !== player) {
        reply('unavailable'); return;
      }
      if (this.persistence?.travel) {
        const result = await this.persistence.travel({
          userId: client.auth!.userId, map: sourceMap, portalId: request.portalId,
          x: position.x, y: position.y, expectedStateVersion: runtime.stateVersion
        });
        if (this.persistenceClosed) return;
        if (!result.ok) {
          runtime.stateVersion = -1;
          reply('unavailable');
          client.leave(4004, 'checkpoint resynchronization required'); return;
        }
        runtime.stateVersion = result.stateVersion;
      }
      // A drop during the RPC retains this same authoritative player until the
      // pending transition settles, so reconnect restores the committed area.
      if (this.state.players.get(client.sessionId) !== player) return;
      player.mapId = target.destination.id;
      player.x = target.arrival.x;
      player.y = target.arrival.y;
      player.transitionRevision = (player.transitionRevision + 1) >>> 0;
      player.companionStatus = player.companionPresent ? (player.connected ? 'idle' : 'reconnecting') : 'unavailable';
      runtime.lastPortalAt = Date.now();
      runtime.lastCheckpointAt = Date.now();
      runtime.dirty = false;
      reply('success', target.destination.id);
    })().catch(() => {
      if (this.persistenceClosed) return;
      runtime.stateVersion = -1;
      reply('unavailable');
      client.leave(4004, 'checkpoint resynchronization required');
    }).finally(() => {
      runtime.transitionInFlight = null;
      runtime.portalRequestId = null;
      this.pendingPersistence.delete(operation);
    });
    runtime.transitionInFlight = operation;
    this.pendingPersistence.add(operation);
    return operation;
  }

  private async queueCheckpoint(client: WorldClient, force: boolean): Promise<void> {
    const runtime = client.userData;
    const player = this.state.players.get(client.sessionId);
    if (this.persistenceClosed || !this.persistence || !runtime || runtime.loading || !player || runtime.stateVersion < 0) return;
    if (runtime.transitionInFlight) await runtime.transitionInFlight;
    if (this.persistenceClosed || runtime.stateVersion < 0) return;
    if (runtime.saveInFlight) {
      await runtime.saveInFlight;
      if (!this.persistenceClosed && force && runtime.dirty) await this.queueCheckpoint(client, true);
      return;
    }
    if (!force && !runtime.dirty) return;
    const map = this.playerMap(player);
    const position = isValidWorldPosition(map, player) ? { x: player.x, y: player.y } : { ...map.spawn };
    const expectedStateVersion = runtime.stateVersion;
    let operation!: Promise<void>;
    operation = this.persistence.save({
      userId: client.auth!.userId, map, x: position.x, y: position.y, expectedStateVersion
    }).then((result) => {
      if (this.persistenceClosed) return;
      if (result.ok) {
        runtime.stateVersion = result.stateVersion;
        runtime.lastCheckpointAt = Date.now();
        runtime.dirty = player.mapId !== map.id || player.x !== position.x || player.y !== position.y;
      } else {
        runtime.stateVersion = -1;
        runtime.dirty = false;
        this.log.warn('world.persistence.version_conflict', { playerId: client.sessionId });
        client.leave(4004, 'checkpoint resynchronization required');
      }
    }).catch(() => {
      if (this.persistenceClosed) return;
      runtime.dirty = true;
      this.log.warn('world.persistence.save_failed', { playerId: client.sessionId });
    }).finally(() => {
      runtime.saveInFlight = null;
      this.pendingPersistence.delete(operation);
    });
    runtime.saveInFlight = operation;
    this.pendingPersistence.add(operation);
    await operation;
  }

  private checkLandmark(client: WorldClient, player: PlayerState) {
    const runtime = client.userData;
    if (this.draining || !this.persistence || !runtime) return;
    const map = this.playerMap(player);
    const landmark = landmarkAtPosition(map, player);
    if (!landmark) return;
    const discoveryKey = `${map.id}:${landmark.key}`;
    if (runtime.discoveries.has(discoveryKey) || runtime.pendingDiscoveries.has(discoveryKey)) return;
    runtime.pendingDiscoveries.add(discoveryKey);
    let operation!: Promise<void>;
    operation = this.persistence.discover({
      userId: client.auth!.userId,
      map,
      landmarkKey: landmark.key,
      x: player.x,
      y: player.y,
      idempotencyKey: `world:${map.id}:${map.version}:${landmark.key}`
    }).then(() => {
      if (!this.persistenceClosed) runtime.discoveries.add(discoveryKey);
    }).catch(() => {
      this.log.warn('world.persistence.discovery_failed', { playerId: client.sessionId, landmark: landmark.key });
    }).finally(() => {
      runtime.pendingDiscoveries.delete(discoveryKey);
      runtime.discoveryInFlight.delete(discoveryKey);
      this.pendingPersistence.delete(operation);
    });
    runtime.discoveryInFlight.set(discoveryKey, operation);
    this.pendingPersistence.add(operation);
  }
}
