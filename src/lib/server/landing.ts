type ContextRecord = {
  context?: unknown;
  trigger?: unknown;
};

export type PreferenceRow = {
  user_id: string;
  start_on: 'home' | 'creatures' | 'dashboard';
  last_context: ContextRecord | string | null;
  last_context_payload: Record<string, unknown> | null;
  ab_variant: 'A' | 'B' | 'C' | null;
  presence_visible?: boolean | null;
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

const APP_ROOT = '/app';

const normalizePreferredSurface = (surface: PreferenceRow['start_on'] | string | null | undefined) => {
  if (surface === 'dashboard') return 'home' as const;
  if (surface === 'creatures') return 'creatures' as const;
  return 'home' as const;
};

export const shouldResolveLanding = (
  normalizedPath: string,
  forceHome: boolean
): 'skip' | 'force-home' | 'resolve' => {
  if (normalizedPath !== APP_ROOT) {
    return 'skip';
  }
  if (forceHome) {
    return 'force-home';
  }
  return 'resolve';
};

export const surfaceToPath = (
  surface: 'home' | 'creatures' | 'dashboard' | 'mission',
  payload?: Record<string, unknown>
) => {
  switch (surface) {
    case 'creatures': {
      const focus = payload?.creatureId;
      return focus ? `/app/companions?focus=${encodeURIComponent(String(focus))}` : '/app/companions';
    }
    case 'dashboard':
      return '/app/home';
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

const extractContextKind = (entry: ContextRecord | string | null): string | null => {
  if (!entry) return null;
  if (typeof entry === 'string') return entry;
  const value = entry.context;
  return typeof value === 'string' ? value : null;
};

export const computeLanding = (
  prefs: PreferenceRow,
  variant: 'A' | 'B' | 'C',
  _mission: MissionCandidate | null,
  _careDue: CareCandidate,
  _contextPayload: Record<string, unknown> | null
): LandingDecision => {
  return {
    surface: 'home',
    target: surfaceToPath('home'),
    variant,
    reason: prefs.start_on !== 'home' ? 'preference' : 'variant'
  };
};
