-- Privileged mutations must only be callable by trusted server code.
-- API routes use the service-role client after authenticating and validating users.

revoke all on function public.credit_wallet(uuid, int, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.credit_wallet(uuid, int, text, text, jsonb) to service_role;

revoke all on function public.fn_award_game_xp(uuid, int) from public, anon, authenticated;
grant execute on function public.fn_award_game_xp(uuid, int) to service_role;

revoke all on function public.fn_wallet_grant(uuid, bigint, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.fn_wallet_grant(uuid, bigint, text, uuid, jsonb) to service_role;

revoke all on function public.fn_wallet_spend(uuid, bigint, text, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.fn_wallet_spend(uuid, bigint, text, uuid, jsonb) to service_role;

revoke all on function public.fn_profile_spend_energy(uuid, int) from public, anon, authenticated;
grant execute on function public.fn_profile_spend_energy(uuid, int) to service_role;

revoke all on function public.fn_profile_grant_energy(uuid, int, int) from public, anon, authenticated;
grant execute on function public.fn_profile_grant_energy(uuid, int, int) to service_role;

revoke all on function public.fn_economy_apply(uuid, text, text, jsonb, jsonb, text) from public, anon, authenticated;
grant execute on function public.fn_economy_apply(uuid, text, text, jsonb, jsonb, text) to service_role;

revoke all on function public.fn_economy_get_balances(uuid) from public, anon, authenticated;
grant execute on function public.fn_economy_get_balances(uuid) to service_role;

revoke all on function public.calculate_bond_for_companion(uuid) from public, anon, authenticated;
grant execute on function public.calculate_bond_for_companion(uuid) to service_role;

revoke all on function public.recalculate_bonds_for_player(uuid) from public, anon, authenticated;
grant execute on function public.recalculate_bonds_for_player(uuid) to service_role;
