import { env as privateEnv } from '$env/dynamic/private';

const parseBoolean = (value: string | undefined, fallback: boolean) => {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim().toLowerCase();
  if (normalized === '1' || normalized === 'true' || normalized === 'yes' || normalized === 'on') return true;
  if (normalized === '0' || normalized === 'false' || normalized === 'no' || normalized === 'off') return false;
  return fallback;
};

export const getCloudWeaveConfig = () => ({
  signingSecret: privateEnv.LOOMA_CLOUDWEAVE_SIGNING_SECRET ?? '',
  importEnabled: parseBoolean(privateEnv.LOOMA_CLOUDWEAVE_IMPORT_ENABLED, false),
  exportVersion: privateEnv.LOOMA_CLOUDWEAVE_EXPORT_VERSION || 'cw-0.1'
});
