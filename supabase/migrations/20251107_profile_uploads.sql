-- Phase 12.2 — Avatar & banner upload buckets with owner policies

-- Ensure avatars bucket exists and is public
insert into storage.buckets (id, name, public)
select 'avatars', 'avatars', true
where not exists (select 1 from storage.buckets where id = 'avatars');

-- Ensure banners bucket exists and is public
insert into storage.buckets (id, name, public)
select 'banners', 'banners', true
where not exists (select 1 from storage.buckets where id = 'banners');

-- Shared helper policy creation
do $$
begin
  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'public read avatars'
  ) then
    create policy "public read avatars" on storage.objects
      for select using (bucket_id = 'avatars');
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'public read banners'
  ) then
    create policy "public read banners" on storage.objects
      for select using (bucket_id = 'banners');
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'owner write avatars'
  ) then
    create policy "owner write avatars" on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'avatars'
        and position((auth.uid())::text || '/' in name) = 1
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'owner update avatars'
  ) then
    create policy "owner update avatars" on storage.objects
      for update to authenticated
      using (
        bucket_id = 'avatars'
        and position((auth.uid())::text || '/' in name) = 1
      )
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'owner delete avatars'
  ) then
    create policy "owner delete avatars" on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'avatars'
        and position((auth.uid())::text || '/' in name) = 1
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'owner write banners'
  ) then
    create policy "owner write banners" on storage.objects
      for insert to authenticated
      with check (
        bucket_id = 'banners'
        and position((auth.uid())::text || '/' in name) = 1
      );
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'owner update banners'
  ) then
    create policy "owner update banners" on storage.objects
      for update to authenticated
      using (
        bucket_id = 'banners'
        and position((auth.uid())::text || '/' in name) = 1
      )
      with check (true);
  end if;

  if not exists (
    select 1 from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname = 'owner delete banners'
  ) then
    create policy "owner delete banners" on storage.objects
      for delete to authenticated
      using (
        bucket_id = 'banners'
        and position((auth.uid())::text || '/' in name) = 1
      );
  end if;
end$$;
