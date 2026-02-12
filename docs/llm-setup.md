# LLM Setup (Companion Agent)

Looma supports optional server-side LLM text generation for companion reactions at session boundaries and milestone events.

## Required env vars

- `OPENAI_API_KEY` (required for LLM calls)
- `LOOMA_LLM_LIGHT_MODEL` (optional, default: `gpt-5-nano`)
- `LOOMA_LLM_PEAK_MODEL` (optional, default: `gpt-5-mini`)
- `LOOMA_LLM_PEAK_DAILY_CAP` (optional, default: `2`)

## Optional tuning env vars

These override defaults/runtime DB tuning:

- `TUNING_REACTION_PRE_RUN_COOLDOWN_MS`
- `TUNING_REACTION_PRE_RUN_CHANCE_PERCENT`
- `TUNING_REACTION_MAX_BUCKETS`
- `TUNING_REACTION_TTL_MS`
- `TUNING_WHISPER_COOLDOWN_MS`
- `TUNING_WHISPER_TTL_MS`
- `TUNING_WHISPER_LONG_BREAK_DAYS`
- `TUNING_WHISPER_STREAK_MIN_DAYS`
- `TUNING_RITUAL_LISTEN_COOLDOWN_MS`
- `TUNING_RITUAL_FOCUS_COOLDOWN_MS`
- `TUNING_RITUAL_CELEBRATE_COOLDOWN_MS`
- `TUNING_RITUAL_FOCUS_MOOD_DURATION_MS`
- `TUNING_MILESTONE_STREAK_3_THRESHOLD`
- `TUNING_MILESTONE_GAMES_5_THRESHOLD`
- `TUNING_MILESTONE_FIRST_WEEK_ACTIVE_THRESHOLD`
- `TUNING_MUSE_HARMONAE_STREAK_THRESHOLD`
- `TUNING_MUSE_HARMONAE_GAMES_THRESHOLD`
- `TUNING_MUSE_MIRAE_STREAK_THRESHOLD`
- `TUNING_MUSE_MIRAE_GAMES_THRESHOLD`

## Local setup

1. Add env vars to `.env.local`:

```bash
OPENAI_API_KEY=sk-...
LOOMA_LLM_LIGHT_MODEL=gpt-5-nano
LOOMA_LLM_PEAK_MODEL=gpt-5-mini
LOOMA_LLM_PEAK_DAILY_CAP=2
```

2. Run migrations (includes `runtime_tuning` + `llm_usage_logs`).
3. Start app: `npm run dev`.

## Vercel setup

1. In Vercel project settings, add:
   - `OPENAI_API_KEY`
   - `LOOMA_LLM_LIGHT_MODEL` (optional)
   - `LOOMA_LLM_PEAK_MODEL` (optional)
   - `LOOMA_LLM_PEAK_DAILY_CAP` (optional)
2. Redeploy.

## Verification

## Verify light path (nano)

1. Trigger `session.start` or `session.end` normally in app.
2. Confirm companion reaction appears.
3. Confirm usage row in `public.llm_usage_logs` with:
   - `intensity='light'`
   - `model='gpt-5-nano'` (or override value)

## Verify peak path (mini)

1. Trigger one of:
   - `bond.milestone`
   - `companion.evolve`
   - `session.return` after long absence
   - `session.start` with major streak increase
2. Confirm reaction appears.
3. Confirm usage row in `public.llm_usage_logs` with:
   - `intensity='peak'` unless daily cap exceeded
   - `model='gpt-5-mini'` (or override value)
4. Exceed daily cap (`LOOMA_LLM_PEAK_DAILY_CAP`) and repeat:
   - peak should downgrade to light (or deterministic fallback if API unavailable).

## Fallback behavior

- If `OPENAI_API_KEY` is missing, API fails, or response is empty:
  - Companion agent falls back to existing deterministic templates.
- LLM is server-side only.
- No tools are used in LLM requests.
