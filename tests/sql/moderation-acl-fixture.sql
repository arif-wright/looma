-- Synthetic regression fixture only. Never use with a hosted database.
-- The isolated runner creates these roles in a new private cluster first.
CREATE SCHEMA auth AUTHORIZATION postgres;
CREATE SCHEMA acl_test AUTHORIZATION postgres;
GRANT USAGE ON SCHEMA public, auth, acl_test TO anon, authenticated, service_role, acl_delegate;

CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

CREATE TABLE public.user_preferences (
  user_id uuid PRIMARY KEY,
  start_on text NOT NULL DEFAULT 'home',
  portable_state jsonb NOT NULL DEFAULT '{}',
  consent_memory boolean NOT NULL DEFAULT false,
  consent_reactions boolean NOT NULL DEFAULT false,
  theme text NOT NULL DEFAULT 'system',
  role text NOT NULL DEFAULT 'user',
  moderation_status text NOT NULL DEFAULT 'active',
  moderation_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT '2026-01-01 00:00:00+00'
);

-- Real ACLs and real RLS are exercised. No application migration, endpoint,
-- extension, connection string, real user, or production record is needed.
DO $$
DECLARE name text;
BEGIN
  FOREACH name IN ARRAY ARRAY['user_items','item_catalog','companions',
      'companion_journal_entries','world_events'] LOOP
    EXECUTE format('CREATE TABLE public.%I (id integer PRIMARY KEY, user_id uuid NOT NULL, value text DEFAULT ''synthetic'')', name);
    EXECUTE format('INSERT INTO public.%I (id,user_id) VALUES (1,''11111111-1111-1111-1111-111111111111''),(2,''22222222-2222-2222-2222-222222222222'')', name);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE,REFERENCES,TRUNCATE,TRIGGER ON TABLE public.%I TO anon,authenticated', name);
  END LOOP;
  FOREACH name IN ARRAY ARRAY['user_preferences','user_items','item_catalog',
      'companions','companion_journal_entries','world_events'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', name);
    IF name='user_preferences' THEN
      -- Captured preference policies deliberately have no client DELETE path.
      EXECUTE 'CREATE POLICY owner_select ON public.user_preferences FOR SELECT TO authenticated USING (user_id=auth.uid())';
      EXECUTE 'CREATE POLICY owner_insert ON public.user_preferences FOR INSERT TO authenticated WITH CHECK (user_id=auth.uid())';
      EXECUTE 'CREATE POLICY owner_update ON public.user_preferences FOR UPDATE TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid())';
    ELSE
      EXECUTE format('CREATE POLICY owner_only ON public.%I FOR ALL TO authenticated USING (user_id=auth.uid()) WITH CHECK (user_id=auth.uid())', name);
    END IF;
    EXECUTE format('GRANT ALL PRIVILEGES ON TABLE public.%I TO service_role', name);
  END LOOP;
END $$;

-- Ordinary fields have column-scoped writes, while role writes are denied.
-- This intentionally reproduces the reviewed eight unsafe moderation grants.
GRANT SELECT,DELETE,REFERENCES,TRUNCATE,TRIGGER ON TABLE public.user_preferences TO anon,authenticated;
GRANT INSERT (user_id,start_on,portable_state,consent_memory,consent_reactions,theme,moderation_status,moderation_until),
      UPDATE (user_id,start_on,portable_state,consent_memory,consent_reactions,theme,moderation_status,moderation_until)
  ON TABLE public.user_preferences TO anon,authenticated;

INSERT INTO public.user_preferences (user_id,moderation_status,moderation_until) VALUES
 ('11111111-1111-1111-1111-111111111111','suspended','2027-01-01 00:00:00+00'),
 ('22222222-2222-2222-2222-222222222222','active',NULL);

-- An observable existing trigger makes preservation executable too.
CREATE FUNCTION acl_test.keep_row() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at=clock_timestamp(); RETURN NEW; END $$;
CREATE TRIGGER existing_preference_trigger BEFORE UPDATE ON public.user_preferences
 FOR EACH ROW EXECUTE FUNCTION acl_test.keep_row();

-- SECURITY INVOKER: permissions are checked as the tested client, not postgres.
CREATE FUNCTION acl_test.expect_denied(statement text, expected_message text)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER AS $$
BEGIN
  BEGIN
    EXECUTE statement;
  EXCEPTION WHEN insufficient_privilege THEN
    IF strpos(SQLERRM, expected_message) = 0 THEN
      RAISE EXCEPTION 'wrong denial for %: %', statement, SQLERRM;
    END IF;
    RETURN;
  END;
  RAISE EXCEPTION 'unexpectedly allowed: %', statement;
END $$;
