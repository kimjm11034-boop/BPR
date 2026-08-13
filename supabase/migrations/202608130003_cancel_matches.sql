-- Keep cancelled matches as audit records while excluding them from rankings and reads.
drop policy if exists matches_owner_update on public.matches;
create policy matches_owner_update on public.matches for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

create or replace function public.cancel_match(p_client_request_id uuid)
returns void language plpgsql security invoker set search_path = public as $$
declare current_user_id uuid := auth.uid(); cancelled_match_id uuid;
begin
  if current_user_id is null then raise exception 'Login required'; end if;

  update public.matches
  set status = 'cancelled', updated_at = now(), match_version = match_version + 1
  where client_request_id = p_client_request_id and owner_id = current_user_id
  returning id into cancelled_match_id;

  if cancelled_match_id is not null then
    insert into public.sheet_sync_jobs (owner_id, match_id, match_version, operation)
    select current_user_id, cancelled_match_id, m.match_version, 'cancel'
    from public.matches m
    where m.id = cancelled_match_id
    on conflict (match_id) do update set
      match_version = excluded.match_version,
      operation = 'cancel',
      status = 'pending',
      updated_at = now();
  end if;
end;
$$;

revoke execute on function public.cancel_match(uuid) from public, anon;
grant execute on function public.cancel_match(uuid) to authenticated;
