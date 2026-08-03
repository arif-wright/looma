const parseInteger = (value: string | undefined, fallback: number, min: number, max: number) => {
  const parsed = Number.parseInt(value ?? '', 10);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
};

const parseOrigins = (value: string | undefined) =>
  new Set(
    (value ?? 'http://localhost:3000,http://localhost:5173')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  );

export type WorldServerConfig = ReturnType<typeof readWorldServerConfig>;

export const readWorldServerConfig = (source: NodeJS.ProcessEnv = process.env) => ({
  port: parseInteger(source.PORT, 2567, 1, 65_535),
  allowedOrigins: parseOrigins(source.WORLD_ALLOWED_ORIGINS),
  logLevel: source.WORLD_LOG_LEVEL === 'debug' ? ('debug' as const) : ('info' as const),
  reconnectGraceSeconds: parseInteger(source.WORLD_RECONNECT_GRACE_SECONDS, 20, 1, 60),
  maxClients: parseInteger(source.WORLD_MAX_CLIENTS, 32, 2, 100),
  joinSecret: source.WORLD_JOIN_SECRET ?? '',
  production: source.NODE_ENV === 'production',
  mapId: source.WORLD_MAP_ID ?? 'wilds-exploration',
  checkpointSeconds: parseInteger(source.WORLD_CHECKPOINT_SECONDS, 15, 5, 60),
  supabaseUrl: source.WORLD_SUPABASE_URL ?? '',
  supabaseServiceRoleKey: source.WORLD_SUPABASE_SERVICE_ROLE_KEY ?? ''
});

export const validateWorldServerConfig = (config: WorldServerConfig) => {
  if (config.joinSecret.length < 32) throw new Error('WORLD_JOIN_SECRET must contain at least 32 characters');
  if (config.production) {
    if (config.allowedOrigins.size === 0) throw new Error('WORLD_ALLOWED_ORIGINS is required in production');
    for (const origin of config.allowedOrigins) {
      if (origin.includes('*') || /localhost|127\.0\.0\.1/.test(origin)) {
        throw new Error('WORLD_ALLOWED_ORIGINS must contain exact non-local production origins');
      }
    }
    if (!config.supabaseUrl || !config.supabaseServiceRoleKey) {
      throw new Error('WORLD_SUPABASE_URL and WORLD_SUPABASE_SERVICE_ROLE_KEY are required in production');
    }
  }
  return config;
};
