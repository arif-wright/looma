import type { ConnectionDiagnostic, ConnectionStatus, GatherResult, MovementIntent, WorldSnapshot } from './protocol';
import { WorldConnection } from './worldConnection';

export type WorldSessionEvents = {
  onStatus: (status: ConnectionStatus) => void;
  onDiagnostic: (diagnostic: ConnectionDiagnostic | null) => void;
  onGatherResult: (result: GatherResult) => void;
};

type SessionConnection = Pick<WorldConnection, 'connect' | 'sendMovement' | 'gatherMoonberry' | 'destroy'>;
type ConnectionFactory = (serverUrl: string, events: ConstructorParameters<typeof WorldConnection>[1]) => SessionConnection;

export class WorldSession {
  private connection: SessionConnection | null = null;
  private started = false;
  private destroyed = false;
  private snapshotConsumer: ((snapshot: WorldSnapshot) => void) | null = null;
  private status: ConnectionStatus = 'offline';

  constructor(
    private readonly serverUrl: string | null,
    private readonly events: WorldSessionEvents,
    private readonly createConnection: ConnectionFactory = (url, connectionEvents) => new WorldConnection(url, connectionEvents)
  ) {}

  setSnapshotConsumer(consumer: ((snapshot: WorldSnapshot) => void) | null) {
    this.snapshotConsumer = consumer;
  }

  start() {
    if (this.started || this.destroyed) return;
    this.started = true;
    if (!this.serverUrl) {
      this.events.onDiagnostic({ code: 'configuration_missing' });
      this.events.onStatus('offline');
      return;
    }
    this.connection = this.createConnection(this.serverUrl, {
      onStatus: (status) => {
        this.status = status;
        this.events.onStatus(status);
      },
      onDiagnostic: this.events.onDiagnostic,
      onSnapshot: (snapshot) => this.snapshotConsumer?.(snapshot),
      onGatherResult: this.events.onGatherResult
    });
    void this.connection.connect();
  }

  sendMovement(intent: MovementIntent) { this.connection?.sendMovement(intent); }
  gatherMoonberry() { this.connection?.gatherMoonberry(); }
  get connectionStatus() { return this.status; }

  destroy(source = 'world session teardown') {
    if (this.destroyed) return;
    this.destroyed = true;
    this.snapshotConsumer = null;
    this.connection?.destroy(source);
    this.connection = null;
  }
}
