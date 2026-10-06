/** Local fixture transport only. No socket, account, persistence, or reward service. */
import type { PlayerSnapshot } from '../../../src/lib/game/protocol';
import { MOONBERRY_INTERACTION } from '../../../src/lib/game/traversal';

type Handler = (...args: any[]) => void;
type SentMessage = { room: number; type: string; payload: Record<string, unknown> };
export const fixture = {
  sdk: 'synthetic-colyseus-no-sockets',
  rooms: [] as Room[],
  sent: [] as SentMessage[],
  tickets: 0,
  mount: async () => {},
  unmount: async () => {},
  get current() { return this.rooms.at(-1)!; },
  get gathers() { return this.sent.filter((message) => message.type === 'gather'); },
  get liveRooms() { return this.rooms.filter((room) => !room.left).length; }
};

export class Room<T = any> {
  readonly index = fixture.rooms.length;
  readonly sessionId = `synthetic-player-${this.index}`;
  readonly reconnection = { minUptime: 0, maxRetries: 0, maxDelay: 0 };
  readonly state = { tick: 1, players: new Map<string, PlayerSnapshot>(), npcs: new Map() };
  left = false;
  private readonly handlers = new Map<string, Handler[]>();
  constructor() {
    this.state.players.set(this.sessionId, {
      mapId: 'wilds-exploration', transitionRevision: 0,
      x: MOONBERRY_INTERACTION.x, y: MOONBERRY_INTERACTION.y,
      connected: true, acknowledgedSequence: 0, colorIndex: 0,
      displayName: 'Synthetic explorer', handle: 'fixture', playerBody: 'female',
      companionPresent: true, companionName: 'Moss', companionKind: 'muse',
      companionStatus: 'idle', companionRevision: 1
    });
    fixture.rooms.push(this);
  }
  private listen(name: string, handler: Handler) {
    this.handlers.set(name, [...(this.handlers.get(name) ?? []), handler]);
  }
  private emit(name: string, ...args: unknown[]) {
    for (const handler of this.handlers.get(name) ?? []) handler(...args);
  }
  onMessage(type: string, handler: Handler) { this.listen(`message:${type}`, handler); }
  onStateChange(handler: Handler) { this.listen('state', handler); }
  onDrop(handler: Handler) { this.listen('drop', handler); }
  onReconnect(handler: Handler) { this.listen('reconnect', handler); }
  onLeave(handler: Handler) { this.listen('leave', handler); }
  onError(handler: Handler) { this.listen('error', handler); }
  send(type: string, payload: Record<string, unknown>) {
    if (this.left) throw new Error('Fixture detected a send to a disposed room');
    fixture.sent.push({ room: this.index, type, payload: structuredClone(payload) });
  }
  async leave(_consented = true) { this.left = true; this.emit('leave', 1000); }
  snapshot(x: number = MOONBERRY_INTERACTION.x, y: number = MOONBERRY_INTERACTION.y) {
    Object.assign(this.state.players.get(this.sessionId)!, { x, y });
    this.state.tick += 1;
    this.emit('state', this.state);
  }
  result(requestId: string, status = 'success') {
    // Deliberately permit delivery after leave, so destroyed-client guards are tested.
    this.emit('message:gather-result', { requestId, status,
      ...(status === 'success' ? { itemTitle: 'Moonberry', quantity: 1, reaction: 'Moss notices the Moonberry.', inventoryHref: '/app/inventory' } : {}) });
  }
  drop() { this.emit('drop', 1006); }
  reconnect() { this.emit('reconnect'); this.snapshot(); }
  exhaust() { this.left = true; this.emit('leave', 4004); }
}

export class Client {
  constructor(endpoint: string) {
    if (endpoint !== 'ws://synthetic-moonberry.invalid') throw new Error('Fixture only accepts its non-network endpoint');
  }
  async joinOrCreate<T>(_name: string, options: { ticket?: string }): Promise<Room<T>> {
    if (options.ticket !== 'local-synthetic-ticket-not-a-credential') throw new Error('Fixture refuses real credentials');
    return new Room<T>();
  }
}

declare global { interface Window { __MOONBERRY_FIXTURE__: typeof fixture; } }
window.__MOONBERRY_FIXTURE__ = fixture;
