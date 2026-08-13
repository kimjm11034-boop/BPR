import type { SupabaseClient } from '@supabase/supabase-js';
import type { Match, Player } from '@/lib/demo-data';
import type { LocalStoreState } from '@/lib/domain/local-store';

type CloudPlayer = { id: string; display_name: string; is_active: boolean };
type CloudParticipant = { player_id: string; team: 'A' | 'B'; seat: number };
type CloudMatch = { id: string; client_request_id?: string | null; played_at: string; winner_team: 'A' | 'B'; match_participants: CloudParticipant[] };

export type CloudState = { players: Player[]; matches: Match[] };

export type SyncPlan = { players: Player[]; inactivePlayerIds: string[]; matches: Match[]; cancelledMatchIds: string[] };

export type SyncResult = { playersSynced: number; matchesSynced: number; failed: string[] };

export function buildSyncPlan(snapshot: LocalStoreState): SyncPlan {
  const players = [...new Map(snapshot.players.map((player) => [player.id, player])).values()];
  const inactivePlayerIds = [...new Set(snapshot.inactivePlayerIds)];
  const matches = [...new Map(snapshot.matches.map((match) => [match.id, match])).values()]
    .sort((a, b) => a.playedAt.localeCompare(b.playedAt) || a.id.localeCompare(b.id));
  const cancelledMatchIds = [...new Set(snapshot.cancelledMatchIds ?? [])];
  return { players, inactivePlayerIds, matches, cancelledMatchIds };
}

export async function readCloudState(client: SupabaseClient): Promise<CloudState | null> {
  const [{ data: cloudPlayers, error: playersError }, { data: cloudMatches, error: matchesError }] = await Promise.all([
    client.from('players').select('id,display_name,is_active').order('created_at', { ascending: true }),
    client.from('matches').select('id,client_request_id,played_at,winner_team,match_participants(player_id,team,seat)').eq('status', 'completed').order('played_at', { ascending: true }),
  ]);
  if (playersError || matchesError || !cloudPlayers || !cloudMatches) return null;
  const allPlayers = (cloudPlayers as CloudPlayer[]).map((player) => ({ id: player.id, displayName: player.display_name }));
  const players = (cloudPlayers as CloudPlayer[]).filter((player) => player.is_active).map((player) => ({ id: player.id, displayName: player.display_name }));
  const byId = new Map(allPlayers.map((player) => [player.id, player]));
  const matches = (cloudMatches as CloudMatch[]).flatMap((match) => {
    const teamA = match.match_participants.filter((item) => item.team === 'A').sort((a, b) => a.seat - b.seat).map((item) => byId.get(item.player_id)).filter(Boolean) as Player[];
    const teamB = match.match_participants.filter((item) => item.team === 'B').sort((a, b) => a.seat - b.seat).map((item) => byId.get(item.player_id)).filter(Boolean) as Player[];
    if (teamA.length !== 2 || teamB.length !== 2) return [];
    return [{ id: match.client_request_id ?? match.id, playedAt: match.played_at, teamA: teamA as [Player, Player], teamB: teamB as [Player, Player], winner: match.winner_team } satisfies Match];
  });
  return { players, matches };
}

export async function registerCloudPlayer(client: SupabaseClient, player: Player) {
  const { error } = await client.rpc('register_player', { p_display_name: player.displayName, p_player_id: player.id });
  return !error;
}

export async function setCloudPlayerActive(client: SupabaseClient, playerId: string, active: boolean) {
  const { error } = await client.rpc('set_player_active', { p_player_id: playerId, p_is_active: active });
  return !error;
}

export async function recordCloudMatch(client: SupabaseClient, match: Match, matchNo: number) {
  const { error } = await client.rpc('record_match', {
    p_session_date: match.playedAt.slice(0, 10),
    p_match_no: matchNo,
    p_winner_team: match.winner,
    p_team_a_player_ids: match.teamA.map((player) => player.id),
    p_team_b_player_ids: match.teamB.map((player) => player.id),
    p_client_request_id: match.id,
    p_played_at: match.playedAt,
  });
  return !error;
}

export async function cancelCloudMatch(client: SupabaseClient, matchId: string) {
  const { error } = await client.rpc('cancel_match', { p_client_request_id: matchId });
  return !error;
}

export async function syncLocalSnapshot(client: SupabaseClient, snapshot: LocalStoreState): Promise<SyncResult> {
  const plan = buildSyncPlan(snapshot);
  const failed: string[] = [];
  let playersSynced = 0;
  let matchesSynced = 0;

  for (const player of plan.players) {
    if (await registerCloudPlayer(client, player)) playersSynced += 1;
    else failed.push(`player:${player.id}`);
  }
  for (const playerId of plan.inactivePlayerIds) {
    if (!(await setCloudPlayerActive(client, playerId, false))) failed.push(`inactive-player:${playerId}`);
  }
  for (const [index, match] of plan.matches.entries()) {
    if (await recordCloudMatch(client, match, index + 1)) matchesSynced += 1;
    else failed.push(`match:${match.id}`);
  }
  for (const matchId of plan.cancelledMatchIds) {
    if (!(await cancelCloudMatch(client, matchId))) failed.push(`cancelled-match:${matchId}`);
  }

  return { playersSynced, matchesSynced, failed };
}
