-- Run after the proposal, only against the runner's private synthetic database.
-- All successful test writes are rolled back; denied writes must report 42501.
BEGIN;
SET LOCAL ROLE authenticated;
SET LOCAL request.jwt.claim.sub = '33333333-3333-3333-3333-333333333333';
DO $$
DECLARE affected integer; name text;
BEGIN
  INSERT INTO public.user_preferences
    (user_id,start_on,portable_state,consent_memory,consent_reactions,theme)
  VALUES (auth.uid(),'journal','{"synthetic":true}',true,true,'dark');
  UPDATE public.user_preferences
    SET user_id=auth.uid(),start_on='companions',portable_state='{"updated":true}',
      consent_memory=false,consent_reactions=false,theme='light'
    WHERE user_id=auth.uid();
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected<>1 OR NOT EXISTS (SELECT 1 FROM public.user_preferences
      WHERE user_id=auth.uid() AND start_on='companions' AND portable_state='{"updated":true}'::jsonb
        AND NOT consent_memory AND NOT consent_reactions AND theme='light'
        AND role='user' AND moderation_status='active' AND moderation_until IS NULL
        AND updated_at>'2026-01-01 00:00:00+00') THEN
    RAISE EXCEPTION 'owner ordinary preference/consent/default behavior changed';
  END IF;
  PERFORM acl_test.expect_denied(
    'INSERT INTO public.user_preferences (user_id,role) VALUES (auth.uid(),''admin'') ON CONFLICT (user_id) DO NOTHING',
    'permission denied for table user_preferences');
  PERFORM acl_test.expect_denied(
    'UPDATE public.user_preferences SET role=''admin'' WHERE user_id=auth.uid()',
    'permission denied for table user_preferences');
  PERFORM acl_test.expect_denied(
    'UPDATE public.user_preferences SET user_id=''44444444-4444-4444-4444-444444444444'' WHERE user_id=auth.uid()',
    'new row violates row-level security policy');
  PERFORM acl_test.expect_denied(
    'INSERT INTO public.user_preferences (user_id,start_on) VALUES (''55555555-5555-5555-5555-555555555555'',''home'')',
    'new row violates row-level security policy');
  UPDATE public.user_preferences SET start_on='forbidden'
    WHERE user_id='11111111-1111-1111-1111-111111111111';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected<>0 OR EXISTS (SELECT 1 FROM public.user_preferences
      WHERE user_id='11111111-1111-1111-1111-111111111111') THEN
    RAISE EXCEPTION 'cross-owner preference RLS changed';
  END IF;
  FOREACH name IN ARRAY ARRAY['moderation_status','moderation_until'] LOOP
    PERFORM acl_test.expect_denied(
      format('INSERT INTO public.user_preferences (user_id,%I) VALUES (auth.uid(),DEFAULT) ON CONFLICT (user_id) DO NOTHING',name),
      'permission denied for table user_preferences');
    PERFORM acl_test.expect_denied(
      format('UPDATE public.user_preferences SET %I=DEFAULT WHERE user_id=auth.uid()',name),
      'permission denied for table user_preferences');
  END LOOP;
  FOREACH name IN ARRAY ARRAY['user_preferences','user_items','item_catalog',
      'companions','companion_journal_entries','world_events'] LOOP
    PERFORM acl_test.expect_denied(format('TRUNCATE TABLE public.%I',name),
      'permission denied for table '||name);
    PERFORM acl_test.expect_denied(format('CREATE TRIGGER forbidden_client_trigger BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION acl_test.keep_row()',name),
      'permission denied for table '||name);
  END LOOP;
  -- RLS is executable on the other five tables too, not just a catalog flag.
  FOREACH name IN ARRAY ARRAY['user_items','item_catalog','companions',
      'companion_journal_entries','world_events'] LOOP
    EXECUTE format('INSERT INTO public.%I (id,user_id,value) VALUES (3,auth.uid(),''owner'')',name);
    EXECUTE format('UPDATE public.%I SET value=''allowed'' WHERE id=3',name);
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected<>1 THEN RAISE EXCEPTION 'owner ordinary DML changed on %',name; END IF;
    EXECUTE format('UPDATE public.%I SET value=''forbidden'' WHERE id=1',name);
    GET DIAGNOSTICS affected = ROW_COUNT;
    IF affected<>0 THEN RAISE EXCEPTION 'cross-owner RLS changed on %',name; END IF;
    PERFORM acl_test.expect_denied(format('INSERT INTO public.%I (id,user_id) VALUES (4,''11111111-1111-1111-1111-111111111111'')',name),
      'new row violates row-level security policy');
  END LOOP;
END $$;

-- Deleting/recreating one's restricted preference row must not reset moderation.
SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
DO $$
DECLARE affected integer; before_row jsonb;
BEGIN
  UPDATE public.user_preferences SET theme='dark' WHERE user_id=auth.uid();
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected<>1 THEN RAISE EXCEPTION 'restricted owner ordinary preference write failed'; END IF;
  INSERT INTO public.user_preferences (user_id,start_on,portable_state,consent_memory,consent_reactions)
    VALUES (auth.uid(),'journal','{"upsert":true}',true,true)
    ON CONFLICT (user_id) DO UPDATE SET start_on=EXCLUDED.start_on,
      portable_state=EXCLUDED.portable_state,consent_memory=EXCLUDED.consent_memory,
      consent_reactions=EXCLUDED.consent_reactions;
  IF NOT EXISTS (SELECT 1 FROM public.user_preferences
      WHERE user_id=auth.uid() AND start_on='journal' AND portable_state='{"upsert":true}'::jsonb
        AND consent_memory AND consent_reactions AND moderation_status='suspended'
        AND moderation_until='2027-01-01 00:00:00+00' AND updated_at>'2026-01-01 00:00:00+00') THEN
    RAISE EXCEPTION 'ordinary owner upsert reset moderation or timestamp trigger failed';
  END IF;
  SELECT to_jsonb(p) INTO before_row FROM public.user_preferences p WHERE user_id=auth.uid();
  PERFORM acl_test.expect_denied(
    'UPDATE public.user_preferences SET consent_memory=false,moderation_status=''active'',moderation_until=NULL WHERE user_id=auth.uid()',
    'permission denied for table user_preferences');
  PERFORM acl_test.expect_denied(
    'INSERT INTO public.user_preferences (user_id,moderation_status,moderation_until) VALUES (auth.uid(),''active'',NULL) ON CONFLICT (user_id) DO UPDATE SET moderation_status=EXCLUDED.moderation_status,moderation_until=EXCLUDED.moderation_until',
    'permission denied for table user_preferences');
  IF before_row IS DISTINCT FROM (SELECT to_jsonb(p) FROM public.user_preferences p WHERE user_id=auth.uid()) THEN
    RAISE EXCEPTION 'denied mixed update/upsert partially changed consent or moderation';
  END IF;
  DELETE FROM public.user_preferences WHERE user_id=auth.uid();
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected<>0 OR NOT EXISTS (SELECT 1 FROM public.user_preferences
      WHERE user_id=auth.uid() AND moderation_status='suspended' AND moderation_until='2027-01-01 00:00:00+00') THEN
    RAISE EXCEPTION 'owner DELETE can reset moderation by recreating the row';
  END IF;
  PERFORM acl_test.expect_denied(
    'UPDATE public.user_preferences SET user_id=''77777777-7777-7777-7777-777777777777'' WHERE user_id=auth.uid()',
    'new row violates row-level security policy');
END $$;

SET LOCAL ROLE anon;
SET LOCAL request.jwt.claim.sub = '11111111-1111-1111-1111-111111111111';
DO $$
DECLARE name text; visible_row boolean;
BEGIN
  FOREACH name IN ARRAY ARRAY['moderation_status','moderation_until'] LOOP
    PERFORM acl_test.expect_denied(
      format('INSERT INTO public.user_preferences (user_id,%I) VALUES (auth.uid(),DEFAULT) ON CONFLICT (user_id) DO NOTHING',name),
      'permission denied for table user_preferences');
    PERFORM acl_test.expect_denied(
      format('UPDATE public.user_preferences SET %I=DEFAULT WHERE user_id=auth.uid()',name),
      'permission denied for table user_preferences');
  END LOOP;
  FOREACH name IN ARRAY ARRAY['user_preferences','user_items','item_catalog',
      'companions','companion_journal_entries','world_events'] LOOP
    PERFORM acl_test.expect_denied(format('TRUNCATE TABLE public.%I',name),
      'permission denied for table '||name);
    PERFORM acl_test.expect_denied(format('CREATE TRIGGER forbidden_anon_trigger BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION acl_test.keep_row()',name),
      'permission denied for table '||name);
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I)',name) INTO visible_row;
    IF visible_row THEN RAISE EXCEPTION 'anonymous row access changed on %',name; END IF;
  END LOOP;
END $$;

SET LOCAL ROLE service_role;
DO $$
DECLARE affected integer; status_value text; until_value timestamptz;
BEGIN
  INSERT INTO public.user_preferences (user_id,moderation_status,moderation_until)
    VALUES ('66666666-6666-6666-6666-666666666666','suspended','2027-06-01 00:00:00+00');
  UPDATE public.user_preferences SET moderation_status='banned',moderation_until='2027-07-01 00:00:00+00'
    WHERE user_id='11111111-1111-1111-1111-111111111111';
  GET DIAGNOSTICS affected = ROW_COUNT;
  IF affected<>1 OR NOT EXISTS (SELECT 1 FROM public.user_preferences
      WHERE user_id='11111111-1111-1111-1111-111111111111'
        AND moderation_status='banned' AND moderation_until='2027-07-01 00:00:00+00')
      OR NOT EXISTS (SELECT 1 FROM public.user_preferences
      WHERE user_id='66666666-6666-6666-6666-666666666666'
        AND moderation_status='suspended' AND moderation_until='2027-06-01 00:00:00+00') THEN
    RAISE EXCEPTION 'service moderation INSERT/UPDATE authority changed';
  END IF;
  FOREACH status_value IN ARRAY ARRAY['muted','suspended','banned','active'] LOOP
    until_value=CASE WHEN status_value='active' THEN NULL ELSE '2027-08-01 00:00:00+00'::timestamptz END;
    INSERT INTO public.user_preferences (user_id,moderation_status,moderation_until)
      VALUES ('66666666-6666-6666-6666-666666666666',status_value,until_value)
      ON CONFLICT (user_id) DO UPDATE SET moderation_status=EXCLUDED.moderation_status,
        moderation_until=EXCLUDED.moderation_until;
    IF NOT EXISTS (SELECT 1 FROM public.user_preferences
        WHERE user_id='66666666-6666-6666-6666-666666666666' AND moderation_status=status_value
          AND moderation_until IS NOT DISTINCT FROM until_value
          AND updated_at>'2026-01-01 00:00:00+00') THEN
      RAISE EXCEPTION 'service moderation upsert failed for %',status_value;
    END IF;
  END LOOP;
END $$;
ROLLBACK;
\echo native-behavior-passed
