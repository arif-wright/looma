import { config as loadEnv } from 'dotenv';
import { seed, type SeedResult, type SeedUser, SEED_USERS } from '../../scripts/seed';

loadEnv({ path: '.env' });
loadEnv({ path: '.env.local', override: true });

export const BASE_URL = process.env.BASE_URL || process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173';

export const TEST_USERS: Record<'author' | 'viewer', SeedUser> = {
  author: { ...SEED_USERS.author, id: '' },
  viewer: { ...SEED_USERS.viewer, id: '' }
} as Record<'author' | 'viewer', SeedUser>;

export const runSeed = async (): Promise<SeedResult> => {
  const result = await seed();
  TEST_USERS.author = result.author;
  TEST_USERS.viewer = result.viewer;
  return result;
};

export type { SeedResult, SeedUser };

export const seedMinimal = runSeed;
export const seedData = runSeed;
export { SEED_USERS };
