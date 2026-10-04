-- UNAPPLIED REVIEW PROPOSAL. Requires separate explicit live-write approval.
-- Target: public.shop_items.slug = tiles-run-skin-nebula only.
-- Observed 2026-10-04: active/featured true, 120 shards, one test entitlement.
-- Brief table locks drain prior purchase_item readers (its item SELECT is unlocked).
-- No wallet, order, inventory, game, achievement, image or historical seed changes.
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
  IF target.active IS DISTINCT FROM true OR target.featured IS DISTINCT FROM true
     OR target.price_shards <> 120 OR target.type::text <> 'cosmetic'
     OR target.stackable IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Nebula catalog changed; review before delisting';
  END IF;
  SELECT count(*) INTO ownership_count FROM public.shop_inventory WHERE item_id = target.id;
  IF ownership_count <> 1 THEN
    RAISE EXCEPTION 'Expected exactly one Nebula test entitlement; review before delisting';
  END IF;
END
$guard$;

-- The existing active-only policy would otherwise null the inventory item join.
-- This exposes only the original owner's archived item metadata, not ownership
-- rows or another user's data. It does not permit purchases or any table writes.
CREATE POLICY "owned retired Tiles Nebula metadata" ON public.shop_items
FOR SELECT TO authenticated
USING (
  slug = 'tiles-run-skin-nebula'
  AND active = false
  AND EXISTS (
    SELECT 1 FROM public.shop_inventory AS owned
    WHERE owned.item_id = shop_items.id AND owned.user_id = (SELECT auth.uid())
  )
);
-- Record the actual policy definition so rollback refuses later policy edits.
DO $record_policy$
DECLARE fingerprint text;
BEGIN
  SELECT md5(jsonb_build_object(
        'command', polcmd, 'permissive', polpermissive, 'roles', polroles,
        'using', pg_get_expr(polqual, polrelid),
        'check', pg_get_expr(polwithcheck, polrelid)
      )::text) INTO STRICT fingerprint
    FROM pg_policy WHERE polrelid = 'public.shop_items'::regclass
      AND polname = 'owned retired Tiles Nebula metadata';
  EXECUTE format('COMMENT ON POLICY %I ON public.shop_items IS %L',
    'owned retired Tiles Nebula metadata', 'tiles-nebula-delist-v1:' || fingerprint);
END
$record_policy$;

DO $update$
DECLARE affected integer;
BEGIN
  UPDATE public.shop_items SET active = false, featured = false
    WHERE slug = 'tiles-run-skin-nebula' AND active = true AND featured = true;
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected <> 1 THEN RAISE EXCEPTION 'Expected exactly one Nebula catalog update'; END IF;
END
$update$;
COMMIT;
