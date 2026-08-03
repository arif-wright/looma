import { Client, type Room } from '@colyseus/sdk';
import {
  GATHER_MESSAGE, GATHER_RESULT_MESSAGE, MOVE_MESSAGE, WORLD_ROOM_NAME,
  type ConnectionStatus, type GatherResult, type MovementIntent, type PlayerSnapshot, type WorldSnapshot
} from './protocol';

type SyncedWorld = {
  tick: number;
  players: { forEach: (callback: (player: PlayerSnapshot, id: string) => void) => void };
};
type TicketResponse = { ticket: string; expiresAt: number };
const COMPANION_REFRESH_MESSAGE = 'companion-refresh';
export type WorldConnectionCallbacks = {
  onStatus: (status: ConnectionStatus) => void;
  onSnapshot: (snapshot: WorldSnapshot) => void;
  onGatherResult: (result: GatherResult) => void;
};

type WorldConnectionOptions = {
  createClient?: (endpoint: string) => Pick<Client, 'joinOrCreate'>;
  debug?: boolean;
};

export class WorldConnection {
  private room: Room<SyncedWorld> | null = null;
  private stopped = false;
  private connected = false;
  private status: ConnectionStatus = 'offline';
  private refreshTimer: ReturnType<typeof setInterval> | null = null;
  private readonly pendingGathers = new Map<string, { requestId: string; nodeKey: 'moonberry-bush' }>();

  private readonly createClient: (endpoint: string) => Pick<Client, 'joinOrCreate'>;
  private readonly debug: boolean;

  constructor(
    private readonly endpoint: string,
    private readonly callbacks: WorldConnectionCallbacks,
    options: WorldConnectionOptions = {}
  ) {
    this.createClient = options.createClient ?? ((endpoint) => new Client(endpoint));
    this.debug = options.debug ?? import.meta.env.DEV;
  }

  async connect() {
    this.setStatus('connecting');
    try {
      const ticketResponse = await fetch('/api/world/ticket', {
        method: 'POST', credentials: 'same-origin', headers: { accept: 'application/json' }
      });
      if (ticketResponse.status === 401 || ticketResponse.status === 403) {
        this.setStatus('unauthorized');
        return;
      }
      if (!ticketResponse.ok) throw new Error('World ticket unavailable');
      const credential = await ticketResponse.json() as TicketResponse;
      if (typeof credential.ticket !== 'string' || !Number.isFinite(credential.expiresAt)) {
        throw new Error('World ticket malformed');
      }
      const room = await this.createClient(this.endpoint).joinOrCreate<SyncedWorld>(WORLD_ROOM_NAME, {
        ticket: credential.ticket
      });
      if (this.stopped) { await room.leave(true); return; }
      this.room = room;
      this.connected = true;
      room.reconnection.minUptime = 0;
      room.reconnection.maxRetries = 8;
      room.reconnection.maxDelay = 1_000;
      room.onStateChange((state) => this.publishSnapshot(state));
      room.onMessage(GATHER_RESULT_MESSAGE, (result: GatherResult) => {
        if (!result || typeof result.requestId !== 'string' || !this.pendingGathers.has(result.requestId)) return;
        this.pendingGathers.delete(result.requestId);
        this.callbacks.onGatherResult(result);
      });
      room.onDrop((code) => {
        this.connected = false;
        if (!this.stopped) {
          this.log('onDrop', { code });
          this.setStatus('reconnecting');
          this.log('reconnect attempt');
        }
      });
      room.onReconnect(() => {
        this.connected = true;
        if (!this.stopped) {
          this.log('reconnect success');
          this.setStatus('connected');
          void this.refreshCompanion();
          for (const request of this.pendingGathers.values()) room.send(GATHER_MESSAGE, request);
        }
      });
      room.onLeave((code) => {
        this.connected = false;
        if (!this.stopped) {
          this.log('onLeave', { code });
          this.setStatus('unavailable');
          this.failPendingGathers();
        }
      });
      room.onError((code) => {
        if (this.stopped || this.connected) return;
        this.log('connection error', { code, reconnecting: this.status === 'reconnecting' });
        // Colyseus emits transport errors while its automatic token-based
        // reconnection loop is still active. onLeave is the exhaustion signal.
        if (this.status !== 'reconnecting') this.setStatus('unavailable');
      });
      this.log('successful join');
      this.setStatus('connected');
      this.publishSnapshot(room.state);
      this.refreshTimer = setInterval(() => void this.refreshCompanion(), 30_000);
    } catch (error) {
      if (!this.stopped) {
        const code = (error as { code?: unknown } | null)?.code;
        if (code === 525) this.setStatus('unauthorized');
        else {
          // Do not serialize the error: SDK errors may include request metadata.
          console.warn('[world] Realtime connection failed; continuing locally.');
          this.setStatus('unavailable');
        }
      }
    }
  }

  sendMovement(intent: MovementIntent) {
    if (this.connected) this.room?.send(MOVE_MESSAGE, intent);
  }

  gatherMoonberry() {
    if (!this.connected || !this.room) {
      this.callbacks.onGatherResult({ requestId: '', status: 'unavailable' });
      return;
    }
    const request = { requestId: crypto.randomUUID(), nodeKey: 'moonberry-bush' as const };
    this.pendingGathers.set(request.requestId, request);
    this.room.send(GATHER_MESSAGE, request);
  }

  destroy(source = 'navigation teardown') {
    if (this.stopped) return;
    this.log('connection destruction', { source });
    this.stopped = true;
    this.connected = false;
    const room = this.room;
    this.room = null;
    if (this.refreshTimer) clearInterval(this.refreshTimer);
    this.refreshTimer = null;
    this.pendingGathers.clear();
    if (room) void room.leave(true);
  }

  private failPendingGathers() {
    for (const requestId of this.pendingGathers.keys()) {
      this.callbacks.onGatherResult({ requestId, status: 'unavailable' });
    }
    this.pendingGathers.clear();
  }

  private publishSnapshot(state: SyncedWorld) {
    if (!this.room || this.stopped) return;
    const players = new Map<string, PlayerSnapshot>();
    state.players.forEach((player, id) => players.set(id, {
      x: player.x, y: player.y, connected: player.connected,
      acknowledgedSequence: player.acknowledgedSequence, colorIndex: player.colorIndex,
      displayName: player.displayName, handle: player.handle,
      companionPresent: player.companionPresent,
      companionName: player.companionName,
      companionKind: player.companionKind,
      companionStatus: player.companionStatus,
      companionRevision: player.companionRevision
    }));
    this.callbacks.onSnapshot({ localPlayerId: this.room.sessionId, tick: state.tick, players });
  }

  private async refreshCompanion() {
    if (!this.connected || !this.room || this.stopped) return;
    try {
      const response = await fetch('/api/world/ticket', {
        method: 'POST', credentials: 'same-origin', headers: { accept: 'application/json' }
      });
      if (response.status === 401 || response.status === 403) {
        this.setStatus('unauthorized');
        return;
      }
      if (!response.ok) return;
      const credential = await response.json() as TicketResponse;
      if (typeof credential.ticket === 'string') {
        this.room.send(COMPANION_REFRESH_MESSAGE, { ticket: credential.ticket });
      }
    } catch {
      // Companion refresh is best-effort and must not interrupt movement.
    }
  }

  private setStatus(status: ConnectionStatus) {
    if (this.stopped || this.status === status) return;
    this.status = status;
    this.callbacks.onStatus(status);
  }

  private log(event: string, fields?: Record<string, unknown>) {
    if (this.debug) console.debug(`[world] ${event}`, fields ?? {});
  }
}
