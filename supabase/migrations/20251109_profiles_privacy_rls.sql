-- Ensure profile owners can update new privacy columns without column restrictions
do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'profiles'
      and policyname = 'profiles_update_owner'
  ) then
    create policy "profiles_update_owner"
      on public.profiles
      for update
      to authenticated
      using (auth.uid() = id)
      with check (auth.uid() = id);
  end if;
end;
$$;
