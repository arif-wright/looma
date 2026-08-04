export type WebglContextStatus = 'ready' | 'lost' | 'restoring';

export type WebglContextEvent = 'lost' | 'restore-started' | 'restored';

export const nextContextStatus = (_current: WebglContextStatus, event: WebglContextEvent): WebglContextStatus => {
  if (event === 'lost') return 'lost';
  if (event === 'restore-started') return 'restoring';
  return 'ready';
};
