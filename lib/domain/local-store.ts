import type { Match, Player } from '@/lib/demo-data';

export const LOCAL_STORE_KEY = 'bpr-local-store';
export const DEVICE_ID_KEY = 'bpr-device-id';
export const LOCAL_SCHEMA_VERSION = 'offline-v1';

export type LocalStoreState = {
  schemaVersion: string;
  deviceId: string;
  players: Player[];
  inactivePlayerIds: string[];
  matches: Match[];
  todayMatches: Match[];
  cancelledMatchIds: string[];
  updatedAt: string;
};

const isPlayer = (value: unknown): value is Player => Boolean(
  value && typeof value === 'object' && typeof (value as Player).id === 'string' && typeof (value as Player).displayName === 'string',
);

const isMatch = (value: unknown): value is Match => {
  if (!value || typeof value !== 'object') return false;
  const match = value as Match;
  return typeof match.id === 'string'
    && typeof match.playedAt === 'string'
    && (match.winner === 'A' || match.winner === 'B')
    && Array.isArray(match.teamA) && match.teamA.length === 2 && match.teamA.every(isPlayer)
    && Array.isArray(match.teamB) && match.teamB.length === 2 && match.teamB.every(isPlayer);
};

const parseArray = <T>(value: string | null, guard: (item: unknown) => item is T): T[] => {
  if (!value) return [];
  try {
    const parsed: unknown = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(guard) : [];
  } catch {
    return [];
  }
};

const parseTodayMatches = (value: string | null, today: string): Match[] => {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as { date?: string; matches?: unknown };
    return parsed.date === today && Array.isArray(parsed.matches) ? parsed.matches.filter(isMatch) : [];
  } catch {
    return [];
  }
};

export function getOrCreateDeviceId(storage: Storage): string {
  const existing = storage.getItem(DEVICE_ID_KEY);
  if (existing) return existing;
  const created = `device-${crypto.randomUUID()}`;
  storage.setItem(DEVICE_ID_KEY, created);
  return created;
}

export function loadLocalStore(storage: Storage, today: string): LocalStoreState {
  const deviceId = getOrCreateDeviceId(storage);
  let parsed: Partial<LocalStoreState> = {};
  try {
    const value = storage.getItem(LOCAL_STORE_KEY);
    if (value) parsed = JSON.parse(value) as Partial<LocalStoreState>;
  } catch {
    parsed = {};
  }

  const legacyPlayers = parseArray(storage.getItem('badminton-matchbook-players'), isPlayer);
  const legacyMatches = parseArray(storage.getItem('badminton-matchbook-matches'), isMatch);
  const players = Array.isArray(parsed.players) ? parsed.players.filter(isPlayer) : legacyPlayers;
  const cancelledMatchIds = Array.isArray(parsed.cancelledMatchIds)
    ? [...new Set(parsed.cancelledMatchIds.filter((id): id is string => typeof id === 'string'))]
    : [];
  const cancelled = new Set(cancelledMatchIds);
  const matches = (Array.isArray(parsed.matches) ? parsed.matches.filter(isMatch) : legacyMatches).filter((match) => !cancelled.has(match.id));
  const storedToday = Array.isArray(parsed.todayMatches) ? parsed.todayMatches.filter(isMatch) : [];
  const todayMatches = storedToday.filter((match) => match.playedAt.slice(0, 10) === today && !cancelled.has(match.id));
  const fallbackToday = (todayMatches.length ? todayMatches : parseTodayMatches(storage.getItem('badminton-matchbook-today'), today)).filter((match) => !cancelled.has(match.id));

  return {
    schemaVersion: LOCAL_SCHEMA_VERSION,
    deviceId,
    players,
    inactivePlayerIds: Array.isArray(parsed.inactivePlayerIds) ? parsed.inactivePlayerIds.filter((id): id is string => typeof id === 'string') : [],
    matches,
    todayMatches: fallbackToday,
    cancelledMatchIds,
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : new Date().toISOString(),
  };
}

export function cancelLocalMatch(state: LocalStoreState, matchId: string): LocalStoreState {
  return {
    ...state,
    matches: state.matches.filter((match) => match.id !== matchId),
    todayMatches: state.todayMatches.filter((match) => match.id !== matchId),
    cancelledMatchIds: [...new Set([...state.cancelledMatchIds, matchId])],
  };
}

export function saveLocalStore(storage: Storage, state: LocalStoreState): void {
  const next = { ...state, schemaVersion: LOCAL_SCHEMA_VERSION, updatedAt: new Date().toISOString() };
  storage.setItem(LOCAL_STORE_KEY, JSON.stringify(next));
  storage.setItem(DEVICE_ID_KEY, next.deviceId);
  storage.setItem('badminton-matchbook-players', JSON.stringify(next.players));
  storage.setItem('badminton-matchbook-matches', JSON.stringify(next.matches));
  storage.setItem('badminton-matchbook-today', JSON.stringify({ date: next.todayMatches[0]?.playedAt.slice(0, 10) ?? '', matches: next.todayMatches }));
}
