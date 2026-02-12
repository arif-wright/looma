import { env as privateEnv } from '$env/dynamic/private';
import { tryGetSupabaseAdminClient } from '$lib/server/supabase';

export type LoomaTuningConfig = {
  reactions: {
    preRunCooldownMs: number;
    preRunChancePercent: number;
    maxPreRunBuckets: number;
    ttlMs: number;
  };
  whispers: {
    cooldownMs: number;
    ttlMs: number;
    longBreakDays: number;
    streakMinDays: number;
  };
  rituals: {
    cooldownMs: {
      listen: number;
      focus: number;
      celebrate: number;
    };
    focusMoodDurationMs: number;
  };
  milestones: {
    companion: {
      streak3: number;
      games5: number;
      firstWeekActive: number;
    };
    museEvolution: {
      harmonae: {
        streakDays: number;
        gamesPlayed: number;
      };
      mirae: {
        streakDays: number;
        gamesPlayed: number;
      };
    };
  };
};

type TuningRow = {
  key: string;
  value: unknown;
};

const CACHE_TTL_MS = 30_000;
let cache: { value: LoomaTuningConfig; expiresAt: number } | null = null;

const clampInt = (value: unknown, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
};

const parseEnvInt = (value: string | undefined, fallback: number, min = 0, max = Number.MAX_SAFE_INTEGER) => {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(n)));
};

const asRecord = (value: unknown) => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null);

const withEnvOverrides = (base: LoomaTuningConfig): LoomaTuningConfig => ({
  reactions: {
    preRunCooldownMs: parseEnvInt(privateEnv.TUNING_REACTION_PRE_RUN_COOLDOWN_MS, base.reactions.preRunCooldownMs, 0),
    preRunChancePercent: parseEnvInt(privateEnv.TUNING_REACTION_PRE_RUN_CHANCE_PERCENT, base.reactions.preRunChancePercent, 0, 100),
    maxPreRunBuckets: parseEnvInt(privateEnv.TUNING_REACTION_MAX_BUCKETS, base.reactions.maxPreRunBuckets, 100, 100_000),
    ttlMs: parseEnvInt(privateEnv.TUNING_REACTION_TTL_MS, base.reactions.ttlMs, 500, 20_000)
  },
  whispers: {
    cooldownMs: parseEnvInt(privateEnv.TUNING_WHISPER_COOLDOWN_MS, base.whispers.cooldownMs, 0),
    ttlMs: parseEnvInt(privateEnv.TUNING_WHISPER_TTL_MS, base.whispers.ttlMs, 500, 20_000),
    longBreakDays: parseEnvInt(privateEnv.TUNING_WHISPER_LONG_BREAK_DAYS, base.whispers.longBreakDays, 1, 365),
    streakMinDays: parseEnvInt(privateEnv.TUNING_WHISPER_STREAK_MIN_DAYS, base.whispers.streakMinDays, 1, 365)
  },
  rituals: {
    cooldownMs: {
      listen: parseEnvInt(privateEnv.TUNING_RITUAL_LISTEN_COOLDOWN_MS, base.rituals.cooldownMs.listen, 1_000),
      focus: parseEnvInt(privateEnv.TUNING_RITUAL_FOCUS_COOLDOWN_MS, base.rituals.cooldownMs.focus, 1_000),
      celebrate: parseEnvInt(privateEnv.TUNING_RITUAL_CELEBRATE_COOLDOWN_MS, base.rituals.cooldownMs.celebrate, 1_000)
    },
    focusMoodDurationMs: parseEnvInt(
      privateEnv.TUNING_RITUAL_FOCUS_MOOD_DURATION_MS,
      base.rituals.focusMoodDurationMs,
      1_000
    )
  },
  milestones: {
    companion: {
      streak3: parseEnvInt(privateEnv.TUNING_MILESTONE_STREAK_3_THRESHOLD, base.milestones.companion.streak3, 1),
      games5: parseEnvInt(privateEnv.TUNING_MILESTONE_GAMES_5_THRESHOLD, base.milestones.companion.games5, 1),
      firstWeekActive: parseEnvInt(
        privateEnv.TUNING_MILESTONE_FIRST_WEEK_ACTIVE_THRESHOLD,
        base.milestones.companion.firstWeekActive,
        1
      )
    },
    museEvolution: {
      harmonae: {
        streakDays: parseEnvInt(
          privateEnv.TUNING_MUSE_HARMONAE_STREAK_THRESHOLD,
          base.milestones.museEvolution.harmonae.streakDays,
          1
        ),
        gamesPlayed: parseEnvInt(
          privateEnv.TUNING_MUSE_HARMONAE_GAMES_THRESHOLD,
          base.milestones.museEvolution.harmonae.gamesPlayed,
          1
        )
      },
      mirae: {
        streakDays: parseEnvInt(
          privateEnv.TUNING_MUSE_MIRAE_STREAK_THRESHOLD,
          base.milestones.museEvolution.mirae.streakDays,
          1
        ),
        gamesPlayed: parseEnvInt(
          privateEnv.TUNING_MUSE_MIRAE_GAMES_THRESHOLD,
          base.milestones.museEvolution.mirae.gamesPlayed,
          1
        )
      }
    }
  }
});

const withDbOverrides = (base: LoomaTuningConfig, rows: TuningRow[]): LoomaTuningConfig => {
  const byKey = new Map(rows.map((row) => [row.key, row.value] as const));
  const reaction = asRecord(byKey.get('reactions'));
  const whisper = asRecord(byKey.get('whispers'));
  const ritual = asRecord(byKey.get('rituals'));
  const milestone = asRecord(byKey.get('milestones'));
  const ritualCooldown = asRecord(ritual?.cooldownMs);
  const companionMilestone = asRecord(milestone?.companion);
  const museMilestone = asRecord(milestone?.museEvolution);
  const museHarmonae = asRecord(museMilestone?.harmonae);
  const museMirae = asRecord(museMilestone?.mirae);

  return {
    reactions: {
      preRunCooldownMs: clampInt(reaction?.preRunCooldownMs, base.reactions.preRunCooldownMs, 0),
      preRunChancePercent: clampInt(reaction?.preRunChancePercent, base.reactions.preRunChancePercent, 0, 100),
      maxPreRunBuckets: clampInt(reaction?.maxPreRunBuckets, base.reactions.maxPreRunBuckets, 100, 100_000),
      ttlMs: clampInt(reaction?.ttlMs, base.reactions.ttlMs, 500, 20_000)
    },
    whispers: {
      cooldownMs: clampInt(whisper?.cooldownMs, base.whispers.cooldownMs, 0),
      ttlMs: clampInt(whisper?.ttlMs, base.whispers.ttlMs, 500, 20_000),
      longBreakDays: clampInt(whisper?.longBreakDays, base.whispers.longBreakDays, 1, 365),
      streakMinDays: clampInt(whisper?.streakMinDays, base.whispers.streakMinDays, 1, 365)
    },
    rituals: {
      cooldownMs: {
        listen: clampInt(ritualCooldown?.listen, base.rituals.cooldownMs.listen, 1_000),
        focus: clampInt(ritualCooldown?.focus, base.rituals.cooldownMs.focus, 1_000),
        celebrate: clampInt(ritualCooldown?.celebrate, base.rituals.cooldownMs.celebrate, 1_000)
      },
      focusMoodDurationMs: clampInt(ritual?.focusMoodDurationMs, base.rituals.focusMoodDurationMs, 1_000)
    },
    milestones: {
      companion: {
        streak3: clampInt(companionMilestone?.streak3, base.milestones.companion.streak3, 1),
        games5: clampInt(companionMilestone?.games5, base.milestones.companion.games5, 1),
        firstWeekActive: clampInt(companionMilestone?.firstWeekActive, base.milestones.companion.firstWeekActive, 1)
      },
      museEvolution: {
        harmonae: {
          streakDays: clampInt(museHarmonae?.streakDays, base.milestones.museEvolution.harmonae.streakDays, 1),
          gamesPlayed: clampInt(museHarmonae?.gamesPlayed, base.milestones.museEvolution.harmonae.gamesPlayed, 1)
        },
        mirae: {
          streakDays: clampInt(museMirae?.streakDays, base.milestones.museEvolution.mirae.streakDays, 1),
          gamesPlayed: clampInt(museMirae?.gamesPlayed, base.milestones.museEvolution.mirae.gamesPlayed, 1)
        }
      }
    }
  };
};

export const DEFAULT_LOOMA_TUNING_CONFIG: LoomaTuningConfig = {
  reactions: {
    preRunCooldownMs: 60 * 60 * 1000,
    preRunChancePercent: 55,
    maxPreRunBuckets: 5000,
    ttlMs: 3500
  },
  whispers: {
    cooldownMs: 24 * 60 * 60 * 1000,
    ttlMs: 4800,
    longBreakDays: 3,
    streakMinDays: 2
  },
  rituals: {
    cooldownMs: {
      listen: 60 * 60 * 1000,
      focus: 60 * 60 * 1000,
      celebrate: 60 * 60 * 1000
    },
    focusMoodDurationMs: 15 * 60 * 1000
  },
  milestones: {
    companion: {
      streak3: 3,
      games5: 5,
      firstWeekActive: 7
    },
    museEvolution: {
      harmonae: {
        streakDays: 3,
        gamesPlayed: 5
      },
      mirae: {
        streakDays: 7,
        gamesPlayed: 12
      }
    }
  }
};

export const getLoomaTuningConfig = async (): Promise<LoomaTuningConfig> => {
  if (cache && cache.expiresAt > Date.now()) return cache.value;

  let config = withEnvOverrides(DEFAULT_LOOMA_TUNING_CONFIG);
  const admin = tryGetSupabaseAdminClient();
  if (admin) {
    try {
      const { data, error } = await admin
        .from('runtime_tuning')
        .select('key, value')
        .eq('enabled', true)
        .in('key', ['reactions', 'whispers', 'rituals', 'milestones']);

      const code = (error as { code?: string | null } | null)?.code ?? null;
      if (error && code !== 'PGRST116' && code !== '42P01' && code !== 'PGRST205') {
        console.error('[tuning] runtime_tuning lookup failed', error);
      } else if (!error && Array.isArray(data)) {
        config = withDbOverrides(config, data as TuningRow[]);
      }
    } catch (err) {
      console.error('[tuning] runtime_tuning query threw', err);
    }
  }

  cache = { value: config, expiresAt: Date.now() + CACHE_TTL_MS };
  return config;
};

export const resetTuningConfigCache = () => {
  cache = null;
};
