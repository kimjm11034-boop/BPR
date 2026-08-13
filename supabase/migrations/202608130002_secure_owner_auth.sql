-- BPR cloud data is owned by the signed-in operator. Anonymous clients never receive write access.
alter table public.players add column owner_id uuid references auth.users(id);
alter table public.sessions add column owner_id uuid references auth.users(id);
alter table public.matches add column owner_id uuid references auth.users(id);
alter table public.match_participants add column owner_id uuid references auth.users(id);
alter table public.sheet_sync_jobs add column owner_id uuid references auth.users(id);

alter table public.sessions drop constraint sessions_session_date_key;
alter table public.sessions add constraint sessions_owner_date_key unique (owner_id, session_date);

alter table public.players alter column owner_id set default auth.uid();
alter table public.sessions alter column owner_id set default auth.uid();
alter table public.matches alter column owner_id set default auth.uid();
alter table public.match_participants alter column owner_id set default auth.uid();
alter table public.sheet_sync_jobs alter column owner_id set default auth.uid();

alter table public.players alter column owner_id set not null;
alter table public.sessions alter column owner_id set not null;
alter table public.matches alter column owner_id set not null;
alter table public.match_participants alter column owner_id set not null;
alter table public.sheet_sync_jobs alter column owner_id set not null;

drop policy if exists players_public_read on public.players;
drop policy if exists sessions_public_read on public.sessions;
drop policy if exists matches_public_read on public.matches;
drop policy if exists participants_public_read on public.match_participants;

create policy players_owner_read on public.players for select to authenticated using ((select auth.uid()) = owner_id);
create policy players_owner_insert on public.players for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy players_owner_update on public.players for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);
create policy sessions_owner_read on public.sessions for select to authenticated using ((select auth.uid()) = owner_id);
create policy sessions_owner_insert on public.sessions for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy matches_owner_read on public.matches for select to authenticated using ((select auth.uid()) = owner_id);
create policy matches_owner_insert on public.matches for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy participants_owner_read on public.match_participants for select to authenticated using ((select auth.uid()) = owner_id);
create policy participants_owner_insert on public.match_participants for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy sheet_jobs_owner_insert on public.sheet_sync_jobs for insert to authenticated with check ((select auth.uid()) = owner_id);
create policy sheet_jobs_owner_read on public.sheet_sync_jobs for select to authenticated using ((select auth.uid()) = owner_id);
create policy sheet_jobs_owner_update on public.sheet_sync_jobs for update to authenticated using ((select auth.uid()) = owner_id) with check ((select auth.uid()) = owner_id);

revoke select on public.players, public.sessions, public.matches, public.match_participants from anon;
grant select on public.players, public.sessions, public.matches, public.match_participants, public.personal_rankings, public.partner_rankings to authenticated;

create or replace function public.register_player(p_display_name text, p_player_id uuid default gen_random_uuid())
returns uuid language plpgsql security invoker set search_path = public as $$
declare created_id uuid; current_user_id uuid := auth.uid();
begin
  if current_user_id is null then raise exception 'Login required'; end if;
  insert into public.players (id, owner_id, display_name, is_active)
  values (p_player_id, current_user_id, btrim(p_display_name), true)
  on conflict (id) do update set display_name = excluded.display_name, is_active = true
  where public.players.owner_id = current_user_id
  returning id into created_id;
  if created_id is null then raise exception 'Player is owned by another account'; end if;
  return created_id;
end;
$$;

create or replace function public.set_player_active(p_player_id uuid, p_is_active boolean)
returns void language sql security invoker set search_path = public as $$
  update public.players set is_active = p_is_active where id = p_player_id and owner_id = (select auth.uid());
$$;

create or replace function public.record_match(
  p_session_date date,
  p_match_no integer,
  p_winner_team public.team_code,
  p_team_a_player_ids uuid[],
  p_team_b_player_ids uuid[],
  p_client_request_id uuid,
  p_played_at timestamptz default now()
)
returns uuid language plpgsql security invoker set search_path = public as $$
declare current_user_id uuid := auth.uid(); session_id uuid; match_id uuid; idx integer;
begin
  if current_user_id is null then raise exception 'Login required'; end if;
  if coalesce(array_length(p_team_a_player_ids, 1), 0) <> 2 or coalesce(array_length(p_team_b_player_ids, 1), 0) <> 2 then raise exception 'Each team must contain two players'; end if;
  if p_team_a_player_ids && p_team_b_player_ids then raise exception 'A player cannot appear on both teams'; end if;
  if (select count(*) from public.players where id = any(p_team_a_player_ids || p_team_b_player_ids) and owner_id = current_user_id and is_active) <> 4 then raise exception 'All players must belong to the signed-in operator'; end if;
  insert into public.sessions (owner_id, session_date) values (current_user_id, p_session_date)
  on conflict (owner_id, session_date) do update set status = 'open'
  returning id into session_id;
  insert into public.matches (owner_id, session_id, match_no, winner_team, client_request_id, played_at)
  values (current_user_id, session_id, p_match_no, p_winner_team, p_client_request_id, p_played_at)
  on conflict (client_request_id) do update set updated_at = now()
  returning id into match_id;
  for idx in 1..2 loop
    insert into public.match_participants (owner_id, match_id, player_id, team, seat) values (current_user_id, match_id, p_team_a_player_ids[idx], 'A', idx) on conflict do nothing;
    insert into public.match_participants (owner_id, match_id, player_id, team, seat) values (current_user_id, match_id, p_team_b_player_ids[idx], 'B', idx) on conflict do nothing;
  end loop;
  insert into public.sheet_sync_jobs (owner_id, match_id, match_version, operation) values (current_user_id, match_id, 1, 'upsert')
  on conflict (match_id) do update set match_version = excluded.match_version, status = 'pending', updated_at = now();
  return match_id;
end;
$$;

revoke execute on function public.register_player(text, uuid) from public, anon;
revoke execute on function public.set_player_active(uuid, boolean) from public, anon;
revoke execute on function public.record_match(date, integer, public.team_code, uuid[], uuid[], uuid, timestamptz) from public, anon;
grant execute on function public.register_player(text, uuid) to authenticated;
grant execute on function public.set_player_active(uuid, boolean) to authenticated;
grant execute on function public.record_match(date, integer, public.team_code, uuid[], uuid[], uuid, timestamptz) to authenticated;

create index players_owner_idx on public.players (owner_id, is_active, created_at);
create index sessions_owner_date_idx on public.sessions (owner_id, session_date desc);
create index matches_owner_played_at_idx on public.matches (owner_id, played_at desc);
create index match_participants_owner_idx on public.match_participants (owner_id);
create index sheet_sync_jobs_owner_idx on public.sheet_sync_jobs (owner_id);
