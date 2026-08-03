export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export const createLogger = (minimum: 'debug' | 'info' = 'info') => {
  const enabled = (level: LogLevel) => minimum === 'debug' || level !== 'debug';
  const write = (level: LogLevel, event: string, fields: Record<string, unknown> = {}) => {
    if (!enabled(level)) return;
    const entry = JSON.stringify({ timestamp: new Date().toISOString(), level, event, ...fields });
    if (level === 'error') console.error(entry);
    else if (level === 'warn') console.warn(entry);
    else console.log(entry);
  };
  return {
    debug: (event: string, fields?: Record<string, unknown>) => write('debug', event, fields),
    info: (event: string, fields?: Record<string, unknown>) => write('info', event, fields),
    warn: (event: string, fields?: Record<string, unknown>) => write('warn', event, fields),
    error: (event: string, fields?: Record<string, unknown>) => write('error', event, fields)
  };
};
