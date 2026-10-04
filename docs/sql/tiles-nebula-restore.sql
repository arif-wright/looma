-- UNAPPLIED ROLLBACK PROPOSAL. Separate approval required: this restores an offer.
-- Apply only to the reviewed delist state, never blindly after later shop edits.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '15s';
LOCK TABLE public.shop_items IN ACCESS EXCLUSIVE MODE;
LOCK TABLE public.shop_inventory IN SHARE MODE;

DO $guard$
DECLARE
  target public.shop_items%ROWTYPE;
  ownership_count bigint;
BEGIN
  SELECT * INTO STRICT target FROM public.shop_items
    WHERE slug = 'tiles-run-skin-nebula';
  IF target.active IS DISTINCT FROM false OR target.featured IS DISTINCT FROM false
     OR target.price_shards <> 120 OR target.type::text <> 'cosmetic'
     OR target.stackable IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Nebula catalog changed; review before restoring';
  END IF;
  SELECT count(*) INTO ownership_count FROM public.shop_inventory WHERE item_id = target.id;
  IF ownership_count <> 1 THEN
    RAISE EXCEPTION 'Nebula entitlement count changed; review before restoring';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy
    WHERE polrelid = 'public.shop_items'::regclass
      AND polname = 'owned retired Tiles Nebula metadata'
      AND obj_description(oid, 'pg_policy') = 'tiles-nebula-delist-v1:' || md5(jsonb_build_object(
        'command', polcmd, 'permissive', polpermissive, 'roles', polroles,
        'using', pg_get_expr(polqual, polrelid),
        'check', pg_get_expr(polwithcheck, polrelid)
      )::text)
  ) THEN
    RAISE EXCEPTION 'Reviewed Nebula metadata policy required before restoring';
  END IF;
END
$guard$;

DO $update$
DECLARE affected integer;
BEGIN
  UPDATE public.shop_items SET active = true, featured = true
    WHERE slug = 'tiles-run-skin-nebula' AND active = false AND featured = false;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Expected exactly one Nebula catalog restore'; END IF;
END
$update$;
DROP POLICY "owned retired Tiles Nebula metadata" ON public.shop_items;
COMMIT;
