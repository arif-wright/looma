import { randomBytes, randomUUID } from 'crypto';

type MemorySession = {
  id: string;
  userId: string;
  slug: string;
  nonce: string;
  status: 'started' | 'completed';
  score?: number;
  durationMs?: number;
  insertedAt: number;
};

type MemoryReward = {
  sessionId: string;
  userId: string;
  xpDelta: number;
  currencyDelta: number;
  insertedAt: number;
};

const sessions = new Map<string, MemorySession>();
const rewards: MemoryReward[] = [];

const randomHex = (bytes = 16) => randomBytes(bytes).toString('hex');

export const memoryStore = {
  createSession(userId: string, slug: string) {
    const entry: MemorySession = {
      id: randomUUID(),
      userId,
      slug,
      nonce: randomHex(),
      status: 'started',
      insertedAt: Date.now()
    };
    sessions.set(entry.id, entry);
    return entry;
  },
  getSession(sessionId: string) {
    return sessions.get(sessionId);
  },
  completeSession(sessionId: string, userId: string, score: number, durationMs: number) {
    const entry = sessions.get(sessionId);
    if (!entry || entry.userId !== userId) return null;
    entry.status = 'completed';
    entry.score = score;
    entry.durationMs = durationMs;
    entry.insertedAt = Date.now();
    sessions.set(entry.id, entry);
    return entry;
  },
  pushReward(sessionId: string, userId: string, xpDelta: number, currencyDelta: number) {
    rewards.unshift({ sessionId, userId, xpDelta, currencyDelta, insertedAt: Date.now() });
    if (rewards.length > 100) {
      rewards.length = 100;
    }
  },
  listRewards(userId: string, limit = 5) {
    return rewards.filter((reward) => reward.userId === userId).slice(0, limit);
  },
  totalCurrency(userId: string) {
    return rewards
      .filter((reward) => reward.userId === userId)
      .reduce((sum, reward) => sum + (reward.currencyDelta ?? 0), 0);
  }
};
