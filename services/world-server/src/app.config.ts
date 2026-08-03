import { defineRoom, defineServer } from 'colyseus';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { readWorldServerConfig, validateWorldServerConfig } from './config.js';
import { createLogger } from './log.js';
import { WORLD_PROTOCOL_VERSION, WORLD_ROOM_NAME } from './protocol.js';
import { WorldRoom } from './rooms/WorldRoom.js';
import { createWorldPersistence } from './persistence/worldPersistence.js';
import type { WorldPersistence } from './persistence/worldPersistence.js';
import { isWorldMapId, WORLD_MAPS } from './world/maps.js';

export const createAppConfig = (
  source: NodeJS.ProcessEnv = process.env,
  overrides: { persistence?: WorldPersistence | null } = {}
) => {
  const config = validateWorldServerConfig(readWorldServerConfig(source));
  const log = createLogger(config.logLevel);
  if (!isWorldMapId(config.mapId)) throw new Error('WORLD_MAP_ID is not a configured map');
  const persistence = overrides.persistence === undefined
    ? createWorldPersistence(config.supabaseUrl, config.supabaseServiceRoleKey)
    : overrides.persistence;

  return defineServer({
    gracefullyShutdown: true,
    transport: new WebSocketTransport({
      maxPayload: 1024,
      perMessageDeflate: false,
      verifyClient: (info, next) => {
        const origin = info.origin;
        const allowed = Boolean(origin && config.allowedOrigins.has(origin)) ||
          (source.NODE_ENV === 'test' && !origin);
        if (!allowed) log.warn('world.origin.rejected', { origin: origin || null });
        next(allowed, allowed ? undefined : 403, allowed ? undefined : 'Origin not allowed');
      }
    }),
    rooms: {
      [WORLD_ROOM_NAME]: defineRoom(WorldRoom, {
        maxClients: config.maxClients,
        reconnectGraceSeconds: config.reconnectGraceSeconds,
        logLevel: config.logLevel,
        joinSecret: config.joinSecret,
        map: WORLD_MAPS[config.mapId],
        checkpointSeconds: config.checkpointSeconds,
        persistence
      })
    },
    express: (app) => {
      app.get('/health', (_request: unknown, response: { json: (body: unknown) => void }) => {
        response.json({ ok: true, service: 'world-server', protocolVersion: WORLD_PROTOCOL_VERSION });
      });
    },
    beforeListen: () => log.info('world.server.starting', { port: config.port })
  });
};
