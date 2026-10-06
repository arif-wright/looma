import { Client, type Room } from '@colyseus/sdk';
import {
  GATHER_MESSAGE, GATHER_RESULT_MESSAGE, MOVE_MESSAGE, WORLD_ROOM_NAME, WORLD_PROTOCOL_VERSION, PORTAL_MESSAGE, PORTAL_RESULT_MESSAGE,
  type PortalResult, type NpcSnapshot,
  type ConnectionDiagnostic, type ConnectionStatus, type GatherResult, type MovementIntent, type PlayerSnapshot, type WorldSnapshot
} from './protocol';
import { isWorldAreaId } from './areas';
import { normalizePlayerBody } from './playerBody';

type SyncedWorld = {
  tick: number;
  npcs?: { forEach: (callback: (npc: NpcSnapshot, id: string) => void) => void };
  players: { forEach: (callback: (player: PlayerSnapshot, id: string) => void) => void };
};
type TicketResponse = { ticket: string; expiresAt: number };
const COMPANION_REFRESH_MESSAGE = 'companion-refresh';
const GATHER_TIMEOUT_MS = 10_000;
export type WorldConnectionCallbacks = {
  onStatus: (status: ConnectionStatus) => void;
  onDiagnostic?: (diagnostic: ConnectionDiagnostic | null) => void;
  onSnapshot: (snapshot: WorldSnapshot) => void;
  onGatherResult: (result: GatherResult) => void;
  onGatherStart?: () => void;
  onPortalResult?: (result: PortalResult) => void;
};

type WorldConnectionOptions = {
  createClient?: (endpoint: string) => Pick<Client, 'joinOrCreate'>;
  debug?: boolean;
  recoveryDelaysMs?: readonly number[];
};

export class WorldConnection {
  private room: Room<SyncedWorld> | null = null;
  private stopped = false;
  private connected = false;
  private status: ConnectionStatus = 'offline';
  private recoveryAttempted = false;
  private recoveryAttempt = 0;
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private pendingPortal: { requestId: string; portalId: string } | null = null;
  private portalTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingGather: { requestId: string; nodeKey: 'moonberry-bush' } | null = null;
  private gatherTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly createClient: (endpoint: string) => Pick<Client, 'joinOrCreate'>;
  private readonly debug: boolean;
  private readonly recoveryDelaysMs: readonly number[];

  constructor(
    private readonly endpoint: string,
    private readonly callbacks: WorldConnectionCallbacks,
    options: WorldConnectionOptions = {}
  ) {
    this.createClient = options.createClient ?? ((endpoint) => new Client(endpoint));
    this.debug = options.debug ?? import.meta.env.DEV;
    this.recoveryDelaysMs = options.recoveryDelaysMs ?? [1_000, 2_000, 4_000, 8_000, 15_000];
  }

  async connect(recovering = false) {
    if (this.stopped) return;
    this.setStatus(recovering ? 'reconnecting' : 'connecting');
    let phase: 'ticket' | 'join' | 'setup' = 'ticket';
    let failureReported = false;
    try {
      const ticketResponse = await fetch('/api/world/ticket', {
        method: 'POST', credentials: 'same-origin', headers: { accept: 'application/json', 'x-world-protocol': String(WORLD_PROTOCOL_VERSION) }
      });
      if (ticketResponse.status === 409) { this.rejectOutdatedClient(); return; }
      if (ticketResponse.status === 401 || ticketResponse.status === 403) {
        this.callbacks.onDiagnostic?.({ code: 'ticket_rejected', statusCode: ticketResponse.status });
        failureReported = true;
        this.setStatus('unauthorized');
        return;
      }
      if (!ticketResponse.ok) {
        this.callbacks.onDiagnostic?.({ code: 'ticket_unavailable', statusCode: ticketResponse.status });
        failureReported = true;
        throw new Error('World ticket unavailable');
      }
      const credential = await ticketResponse.json() as TicketResponse;
      if (typeof credential.ticket !== 'string' || !Number.isFinite(credential.expiresAt)) {
        this.callbacks.onDiagnostic?.({ code: 'ticket_malformed' });
        failureReported = true;
        throw new Error('World ticket malformed');
      }
      phase = 'join';
      const room = await this.createClient(this.endpoint).joinOrCreate<SyncedWorld>(WORLD_ROOM_NAME, {
        ticket: credential.ticket
      });
      if (this.stopped) { await room.leave(true); return; }
      phase = 'setup';
      this.room = room;
      this.connected = true;
      this.callbacks.onDiagnostic?.(null);
      this.recoveryAttempt = 0;
      this.recoveryAttempted = false;
      room.reconnection.minUptime = 0;
      // These delays total roughly 13.4 seconds, below the default
      // server-side reconnection grace period.
      room.reconnection.maxRetries = 15;
      room.reconnection.maxDelay = 1_000;
      let shuttingDown = false;
      const pauseForShutdown = () => {
        if (this.room !== room || this.stopped || shuttingDown) return;
        shuttingDown = true;
        this.connected = false;
        // This room is being disposed; its token cannot restore a fresh process.
        room.reconnection.maxRetries = 0;
        this.clearRefreshTimer();
        this.failPendingPortal();
        this.failPendingGather();
        this.setStatus('reconnecting');
      };
      room.onMessage('server-shutdown', pauseForShutdown);
      room.onStateChange((state) => { if (this.room === room && !shuttingDown) this.publishSnapshot(state); });
      room.onMessage(PORTAL_RESULT_MESSAGE, (result: PortalResult) => {
        if (this.room !== room || this.stopped || !result || result.requestId !== this.pendingPortal?.requestId) return;
        if (!['success', 'out_of_range', 'cooldown', 'unavailable', 'failure'].includes(result.status)) return;
        this.clearPortal();
        this.callbacks.onPortalResult?.(result);
      });
      room.onMessage(GATHER_RESULT_MESSAGE, (result: GatherResult) => {
        if (this.room !== room || this.stopped || !this.pendingGather || !result || result.requestId !== this.pendingGather.requestId) return;
        if (!['success', 'cooldown', 'inventory_full', 'out_of_range', 'unavailable', 'failure'].includes(result.status)) return;
        this.clearGather();
        this.callbacks.onGatherResult(result);
      });
      room.onDrop((code) => {
        if (this.room !== room) return;
        this.connected = false;
        if (!this.stopped) {
          this.failPendingPortal();
          this.failPendingGather();
          this.log('onDrop', { code });
          this.setStatus('reconnecting');
          this.log('reconnect attempt');
        }
      });
      room.onReconnect(() => {
        if (this.room !== room || shuttingDown) return;
        this.connected = true;
        if (!this.stopped) {
          this.recoveryAttempt = 0;
          this.recoveryAttempted = false;
          this.log('reconnect success');
          this.setStatus('connected');
          void this.refreshCompanion();
        }
      });
      room.onLeave((code) => {
        if (this.room !== room) return;
        this.connected = false;
        if (!this.stopped) {
          this.log('onLeave', { code });
          if (code === 4001) pauseForShutdown();
          this.failPendingPortal();
          this.failPendingGather();
          if ((this.status === 'reconnecting' || code === 4004) && !this.recoveryAttempted) {
            this.recoveryAttempted = true;
            this.room = null;
            this.clearRefreshTimer();
            this.log('fresh session recovery');
            // Let the replacement process become healthy before fresh auth. Never
            // replay an uncertain portal or reward request across a restart.
            if (shuttingDown && this.scheduleRecovery()) return;
            void this.connect(true);
            return;
          }
          this.callbacks.onDiagnostic?.({ code: 'connection_closed', statusCode: this.safeCode(code) });
          this.setStatus('unavailable');
          this.failPendingPortal();
        }
      });
      room.onError((code) => {
        if (this.room !== room) return;
        if (this.stopped || this.connected) return;
        this.log('connection error', { code, reconnecting: this.status === 'reconnecting' });
        // Colyseus emits transport errors while its automatic token-based
        // reconnection loop is still active. onLeave is the exhaustion signal.
        if (this.status !== 'reconnecting') this.setStatus('unavailable');
      });
      this.log('successful join');
      this.setStatus('connected');
      this.publishSnapshot(room.state);
      this.clearRefreshTimer();
      this.refreshTimer = setInterval(() => void this.refreshCompanion(), 30_000);
    } catch (error) {
      if (!this.stopped) {
        const code = (error as { code?: unknown } | null)?.code;
        if (code === 401 || code === 403 || code === 525) {
          this.callbacks.onDiagnostic?.({ code: 'ticket_rejected', statusCode: this.safeCode(code) });
          this.setStatus('unauthorized');
        }
        else if (recovering && this.scheduleRecovery()) return;
        else {
          if (phase === 'setup' && this.room && this.connected) {
            // Matchmaking and the WebSocket handshake already succeeded. A
            // presentation callback must never downgrade an open authoritative
            // connection to local fallback.
            console.warn('[world] Realtime joined, but client synchronization reported a nonfatal error. [W-CLIENT]');
            this.callbacks.onDiagnostic?.(null);
            this.setStatus('connected');
            return;
          } else if (phase === 'join') {
            this.callbacks.onDiagnostic?.({
              code: recovering ? 'recovery_exhausted' : 'join_failed',
              statusCode: this.safeCode(code)
            });
          } else if (recovering) {
            this.callbacks.onDiagnostic?.({ code: 'recovery_exhausted', statusCode: this.safeCode(code) });
          } else if (!failureReported) {
            this.callbacks.onDiagnostic?.({ code: 'ticket_unavailable', statusCode: this.safeCode(code) });
          }
          // Do not serialize the error: SDK errors may include request metadata.
          console.warn('[world] Realtime connection is unavailable.');
          this.setStatus('unavailable');
        }
      }
    }
  }

  sendMovement(intent: MovementIntent) {
    if (this.connected) this.room?.send(MOVE_MESSAGE, intent);
  }

  gatherMoonberry() {
    if (this.stopped || this.pendingGather) return;
    if (!this.connected || !this.room || this.status !== 'connected') {
      this.callbacks.onGatherResult({ requestId: '', status: 'unavailable' });
      return;
    }
    const request = { requestId: crypto.randomUUID(), nodeKey: 'moonberry-bush' as const };
    this.pendingGather = request;
    this.gatherTimer = setTimeout(() => this.failPendingGather(), GATHER_TIMEOUT_MS);
    this.callbacks.onGatherStart?.();
    try {
      this.room.send(GATHER_MESSAGE, request);
    } catch {
      // A transport exception cannot prove whether the server received the intent.
      this.failPendingGather();
    }
  }

  enterPortal(portalId: string) {
    if (this.pendingPortal) return;
    if (!this.connected || !this.room || (portalId !== 'grove-to-hollow' && portalId !== 'hollow-to-grove')) {
      this.callbacks.onPortalResult?.({ requestId: '', status: 'unavailable' });
      return;
    }
    const request = { requestId: crypto.randomUUID(), portalId };
    this.pendingPortal = request;
    this.portalTimer = setTimeout(() => this.failPendingPortal(), 10_000);
    this.room.send(PORTAL_MESSAGE, request);
  }

  private clearPortal() {
    if (this.portalTimer) clearTimeout(this.portalTimer);
    this.portalTimer = null;
    this.pendingPortal = null;
  }

  private failPendingPortal() {
    const requestId = this.pendingPortal?.requestId;
    this.clearPortal();
    if (requestId) this.callbacks.onPortalResult?.({ requestId, status: 'unavailable' });
  }

  destroy(source = 'navigation teardown') {
    if (this.stopped) return;
    this.log('connection destruction', { source });
    this.stopped = true;
    this.connected = false;
    const room = this.room;
    this.room = null;
    this.clearRefreshTimer();
    this.clearRecoveryTimer();
    this.clearGather();
    this.clearPortal();
    if (room) void room.leave(true);
  }

  private clearGather() {
    if (this.gatherTimer) clearTimeout(this.gatherTimer);
    this.gatherTimer = null;
    this.pendingGather = null;
  }

  private failPendingGather() {
    const requestId = this.pendingGather?.requestId;
    this.clearGather();
    // Never automatically retransmit an uncertain reward request. A fresh user
    // action can try again, while the existing server cooldown/ledger stays authoritative.
    if (requestId) this.callbacks.onGatherResult({ requestId, status: 'unconfirmed' });
  }

  private publishSnapshot(state: SyncedWorld) {
    if (!this.room || this.stopped) return;
    try {
      const players = new Map<string, PlayerSnapshot>();
      state.players.forEach((player, id) => players.set(id, {
        mapId: isWorldAreaId(player.mapId) ? player.mapId : 'wilds-exploration',
        transitionRevision: Number.isSafeInteger(player.transitionRevision) ? Number(player.transitionRevision) : 0,
        x: player.x, y: player.y, connected: player.connected,
        acknowledgedSequence: player.acknowledgedSequence, colorIndex: player.colorIndex,
        displayName: player.displayName, handle: player.handle,
        playerBody: normalizePlayerBody(player.playerBody),
        companionPresent: player.companionPresent,
        companionName: player.companionName,
        companionKind: player.companionKind,
        companionStatus: player.companionStatus,
        companionRevision: player.companionRevision
      }));
      const npcs = new Map<string, NpcSnapshot>();
      state.npcs?.forEach((npc, id) => {
        if (npcs.size >= 2 || !isWorldAreaId(npc.mapId) || npc.kind !== 'resident' || !Number.isFinite(npc.x) || !Number.isFinite(npc.y)) return;
        npcs.set(id, { id, mapId: npc.mapId, name: String(npc.name).slice(0, 40), kind: 'resident', playerBody: normalizePlayerBody(npc.playerBody), x: npc.x, y: npc.y, moving: npc.moving === true });
      });
      this.callbacks.onSnapshot({ localPlayerId: this.room.sessionId, tick: state.tick, players, npcs });
    } catch {
      // Rendering/presentation failures are isolated from transport truth. The
      // next state patch gets another opportunity to synchronize the scene.
      console.warn('[world] Snapshot synchronization failed. [W-CLIENT]');
    }
  }

  private async refreshCompanion() {
    if (!this.connected || !this.room || this.stopped) return;
    const room = this.room;
    try {
      const response = await fetch('/api/world/ticket', {
        method: 'POST', credentials: 'same-origin', headers: { accept: 'application/json', 'x-world-protocol': String(WORLD_PROTOCOL_VERSION) }
      });
      if (this.room !== room || !this.connected || this.stopped) return;
      if (response.status === 409) { this.rejectOutdatedClient(); return; }
      if (response.status === 401 || response.status === 403) {
        this.setStatus('unauthorized');
        return;
      }
      if (!response.ok) return;
      const credential = await response.json() as TicketResponse;
      if (typeof credential.ticket === 'string' && this.room === room && this.connected && !this.stopped) {
        room.send(COMPANION_REFRESH_MESSAGE, { ticket: credential.ticket });
      }
    } catch {
      // Companion refresh is best-effort and must not interrupt movement.
    }
  }

  private rejectOutdatedClient() {
    const room = this.room;
    this.room = null;
    this.connected = false;
    this.clearRefreshTimer();
    this.clearRecoveryTimer();
    this.failPendingPortal();
    this.failPendingGather();
    this.callbacks.onDiagnostic?.({ code: 'client_outdated' });
    this.setStatus('unavailable');
    if (room) void room.leave(true);
  }

  private setStatus(status: ConnectionStatus) {
    if (this.stopped || this.status === status) return;
    this.status = status;
    if (status !== 'connected') this.failPendingGather();
    this.callbacks.onStatus(status);
  }

  private clearRefreshTimer() {
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = null;
  }

  private scheduleRecovery() {
    const delay = this.recoveryDelaysMs[this.recoveryAttempt];
    if (delay === undefined) return false;
    this.recoveryAttempt += 1;
    this.log('fresh session retry scheduled', { attempt: this.recoveryAttempt, delayMs: delay });
    this.clearRecoveryTimer();
    this.recoveryTimer = setTimeout(() => {
      this.recoveryTimer = null;
      if (!this.stopped) void this.connect(true);
    }, delay);
    return true;
  }

  private clearRecoveryTimer() {
    if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
    this.recoveryTimer = null;
  }

  private log(event: string, fields?: Record<string, unknown>) {
    if (this.debug) console.debug(`[world] ${event}`, fields ?? {});
  }

  private safeCode(value: unknown) {
    return typeof value === 'number' && Number.isInteger(value) && value >= 100 && value <= 5999
      ? value
      : undefined;
  }
}
