Hello from Codex.

## Leaderboard refresh schedule

Configure Supabase cron (or your preferred scheduler) to keep leaderboard views fresh:

- Every 5 minutes: `select public.fn_leader_refresh('daily');`
- Every hour: `select public.fn_leader_refresh('weekly');`
- Every 6 hours: `select public.fn_leader_refresh('alltime');`

Trigger the SQL using the `Execute SQL` action in the Supabase dashboard or via the REST `/pg` endpoint with the service role key.

## Analytics refresh schedule

Run `select public.fn_analytics_refresh();` every 5 minutes so the analytics materialized views stay up to date. Use the same scheduling mechanism as the leaderboard refresh jobs.
