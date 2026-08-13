create extension if not exists pgcrypto;

create type public.team_code as enum ('A', 'B');
create type public.match_status as enum ('completed', 'cancelled');
create type public.sync_operation as enum ('upsert', 'cancel');
create type public.sync_status as enum ('pending', 'processing', 'succeeded', 'failed');

create sequence public.member_code_seq;
create table public.players (
  id uuid primary key default gen_random_uuid(),
  member_code text not null unique default ('P' || lpad(nextval('public.member_code_seq')::text, 3, '0')),
  display_name text not null check (length(btrim(display_name)) > 0),
  note text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  session_date date not null unique,
  status text not null default 'open' check (status in ('open', 'closed')),
  created_at timestamptz not null default now()
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.sessions,
  match_no integer not null check (match_no > 0),
  winner_team public.team_code not null,
  status public.match_status not null default 'completed',
  client_request_id uuid not null unique,
  match_version integer not null default 1 check (match_version > 0),
  played_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, match_no)
);

create table public.match_participants (
  match_id uuid not null references public.matches on delete restrict,
  player_id uuid not null references public.players on delete restrict,
  team public.team_code not null,
  seat smallint not null check (seat in (1, 2)),
  primary key (match_id, player_id),
  unique (match_id, team, seat)
);

create table public.sheet_sync_jobs (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null unique references public.matches,
  match_version integer not null check (match_version > 0),
  operation public.sync_operation not null,
  status public.sync_status not null default 'pending',
  attempt_count integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  sheet_row integer,
  last_error text,
  updated_at timestamptz not null default now()
);

create index matches_session_played_at_idx on public.matches (session_id, played_at desc);
create index match_participants_player_idx on public.match_participants (player_id, match_id);
create index match_participants_team_idx on public.match_participants (match_id, team, seat);

alter table public.players enable row level security;
alter table public.sessions enable row level security;
alter table public.matches enable row level security;
alter table public.match_participants enable row level security;
alter table public.sheet_sync_jobs enable row level security;

create policy players_public_read on public.players for select using (true);
create policy sessions_public_read on public.sessions for select using (true);
create policy matches_public_read on public.matches for select using (true);
create policy participants_public_read on public.match_participants for select using (true);
revoke insert, update, delete on all tables in schema public from anon, authenticated;
grant select on public.players, public.sessions, public.matches, public.match_participants to anon, authenticated;

create or replace view public.personal_rankings with (security_invoker = true) as
with player_results as (
  select p.id as player_id, p.display_name, p.member_code,
    count(mp.match_id)::int as games,
    count(*) filter (where m.winner_team = mp.team)::int as wins,
    count(*) filter (where m.winner_team <> mp.team)::int as losses
  from public.players p
  left join public.match_participants mp on mp.player_id = p.id
  left join public.matches m on m.id = mp.match_id and m.status = 'completed'
  group by p.id, p.display_name, p.member_code
)
select *, case when games = 0 then 0 else wins::numeric / games end as win_rate from player_results;

create or replace view public.partner_rankings with (security_invoker = true) as
with teams as (
  select mp.match_id, mp.team, min(mp.player_id::text)::uuid as player_low_id, max(mp.player_id::text)::uuid as player_high_id,
    bool_or(m.winner_team = mp.team) as won
  from public.match_participants mp join public.matches m on m.id = mp.match_id
  where m.status = 'completed' group by mp.match_id, mp.team
), grouped as (
  select player_low_id, player_high_id, count(*)::int as games, count(*) filter (where won)::int as wins, count(*) filter (where not won)::int as losses
  from teams group by player_low_id, player_high_id
)
select *, wins::numeric / nullif(games, 0) as win_rate, games < 3 as is_small_sample from grouped;

grant select on public.personal_rankings, public.partner_rankings to anon, authenticated;

alter table public.players replica identity full;
alter table public.sessions replica identity full;
alter table public.matches replica identity full;
alter table public.match_participants replica identity full;
alter publication supabase_realtime add table public.players, public.sessions, public.matches, public.match_participants;
