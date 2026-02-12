import type { MissionDefinition, MissionSessionRow, MissionStartContext, MissionUser } from './types';

export type ValidationResult =
  | { ok: true }
  | { ok: false; status: number; code: string; message: string };

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const readCostEnergy = (mission: MissionDefinition): number | null => {
  const raw = mission.cost?.energy;
  return isFiniteNumber(raw) ? raw : null;
};

export const validateMissionStart = (
  user: MissionUser,
  mission: MissionDefinition,
  lastSession: MissionSessionRow | null,
  context: MissionStartContext,
  now = Date.now()
): ValidationResult => {
  if (!user?.id) {
    return { ok: false, status: 401, code: 'unauthorized', message: 'Authentication required.' };
  }

  if (!mission?.id) {
    return { ok: false, status: 404, code: 'mission_not_found', message: 'Mission not found.' };
  }

  if (mission.status && !['available', 'active'].includes(mission.status)) {
    return { ok: false, status: 409, code: 'mission_unavailable', message: 'Mission is not available.' };
  }

  const minLevel = mission.requirements?.minLevel;
  if (isFiniteNumber(minLevel) && context.level < minLevel) {
    return {
      ok: false,
      status: 403,
      code: 'mission_requirement_level',
      message: `Requires level ${minLevel} or higher.`
    };
  }

  const minEnergy = mission.requirements?.minEnergy;
  if (isFiniteNumber(minEnergy) && context.energy < minEnergy) {
    return {
      ok: false,
      status: 403,
      code: 'mission_requirement_energy',
      message: `Requires at least ${minEnergy} energy.`
    };
  }

  const repeatable = mission.requirements?.repeatable !== false;
  if (!repeatable && lastSession?.status === 'started') {
    return {
      ok: false,
      status: 409,
      code: 'mission_already_active',
      message: 'This mission is already active.'
    };
  }

  if ((mission.type === 'action' || mission.type === 'world') && mission.cost) {
    const costEnergy = readCostEnergy(mission);
    if (costEnergy === null || costEnergy < 0) {
      return {
        ok: false,
        status: 400,
        code: 'hybrid_cost_invalid',
        message: 'Action/world mission cost.energy must be present and >= 0 when cost exists.'
      };
    }
  }

  if (mission.cooldown_ms && mission.cooldown_ms > 0 && lastSession?.started_at) {
    const lastStartedAt = Date.parse(lastSession.started_at);
    if (Number.isFinite(lastStartedAt) && now - lastStartedAt < mission.cooldown_ms) {
      return {
        ok: false,
        status: 429,
        code: 'mission_cooldown',
        message: 'Mission is on cooldown.'
      };
    }
  }

  return { ok: true };
};

export const validateMissionComplete = (
  user: MissionUser,
  session: MissionSessionRow | null
): ValidationResult => {
  if (!user?.id) {
    return { ok: false, status: 401, code: 'unauthorized', message: 'Authentication required.' };
  }

  if (!session?.id) {
    return { ok: false, status: 404, code: 'session_not_found', message: 'Mission session not found.' };
  }

  if (session.user_id !== user.id) {
    return { ok: false, status: 403, code: 'forbidden', message: 'Mission session ownership mismatch.' };
  }

  if (session.status !== 'started') {
    return {
      ok: false,
      status: 409,
      code: 'session_not_active',
      message: 'Mission session is not active.'
    };
  }

  return { ok: true };
};
