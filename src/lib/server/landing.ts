export type PreferenceRow = {
  user_id: string;
  start_on: 'home' | 'creatures' | 'dashboard';
  last_context: string | null;
  last_context_payload: Record<string, unknown> | null;
  ab_variant: 'A' | 'B' | 'C' | null;
  updated_at: string | null;
};

export type MissionCandidate = {
  id: string;
  updated_at: string | null;
  status?: string | null;
};

export type CareCandidate = {
  creatureId: string | null;
} | null;

export type LandingDecision = {
  surface: 'home' | 'creatures' | 'dashboard' | 'mission';
  target: string;
  variant: 'A' | 'B' | 'C';
  reason: 'mission' | 'care' | 'preference' | 'context' | 'variant';
};

export const surfaceToPath = (
  surface: 'home' | 'creatures' | 'dashboard' | 'mission',
  payload?: Record<string, unknown>
) => {
  switch (surface) {
    case 'creatures': {
      const focus = payload?.creatureId;
      return focus ? `/app/creatures?focus=${encodeURIComponent(String(focus))}` : '/app/creatures';
    }
    case 'dashboard':
      return '/app/dashboard';
    case 'mission': {
      const missionId = payload?.missionId;
      return missionId ? `/app/missions/${encodeURIComponent(String(missionId))}` : '/app/missions';
    }
    default:
      return '/app/home';
  }
};

const withinWindow = (iso: string | null | undefined, windowMs: number) => {
  if (!iso) return false;
  const timestamp = Date.parse(iso);
  if (Number.isNaN(timestamp)) return false;
  return Date.now() - timestamp <= windowMs;
};

const HOURS_24 = 24 * 60 * 60 * 1000;

export const computeLanding = (
  prefs: PreferenceRow,
  variant: 'A' | 'B' | 'C',
  mission: MissionCandidate | null,
  careDue: CareCandidate,
  contextPayload: Record<string, unknown> | null
): LandingDecision => {
  if (mission?.id) {
    return {
      surface: 'mission',
      target: surfaceToPath('mission', { missionId: mission.id }),
      variant,
      reason: 'mission'
    };
  }

  if (careDue?.creatureId) {
    return {
      surface: 'creatures',
      target: surfaceToPath('creatures', { creatureId: careDue.creatureId }),
      variant,
      reason: 'care'
    };
  }

  const updatedRecently = withinWindow(prefs.updated_at, HOURS_24);
  if (updatedRecently && prefs.last_context) {
    switch (prefs.last_context) {
      case 'feed':
      case 'social':
        return {
          surface: 'home',
          target: surfaceToPath('home'),
          variant,
          reason: 'context'
        };
      case 'mission': {
        const missionId =
          contextPayload?.missionId ??
          contextPayload?.mission_id ??
          contextPayload?.id ??
          null;
        return {
          surface: 'mission',
          target: surfaceToPath('mission', missionId ? { missionId } : undefined),
          variant,
          reason: 'context'
        };
      }
      case 'creature': {
        const creatureId =
          contextPayload?.creatureId ??
          contextPayload?.creature_id ??
          contextPayload?.id ??
          null;
        return {
          surface: 'creatures',
          target: surfaceToPath('creatures', creatureId ? { creatureId } : undefined),
          variant,
          reason: 'context'
        };
      }
      case 'dashboard':
        return {
          surface: 'dashboard',
          target: surfaceToPath('dashboard'),
          variant,
          reason: 'context'
        };
      default:
        break;
    }
  }

  let surface: 'home' | 'creatures' | 'dashboard' = 'home';

  if (prefs.start_on && prefs.start_on !== 'home') {
    surface = prefs.start_on;
  } else {
    if (variant === 'A') surface = 'dashboard';
    if (variant === 'B') surface = 'creatures';
    if (variant === 'C') surface = 'home';
  }

  return {
    surface,
    target: surfaceToPath(surface),
    variant,
    reason: prefs.start_on !== 'home' ? 'preference' : 'variant'
  };
};
