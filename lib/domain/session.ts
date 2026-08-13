import type { Match, Player } from '@/lib/demo-data';

export function shouldResetStoredData(storedVersion: string | null, currentVersion: string): boolean {
  return storedVersion !== currentVersion;
}

export function buildRoster(names: string[]): Player[] {
  return names
    .map((name) => name.trim())
    .filter(Boolean)
    .map((displayName, index) => ({
      id: `session-player-${String(index + 1).padStart(2, '0')}`,
      displayName,
    }));
}

export function readTodayMatches(saved: string | null, date: string): Match[] {
  if (!saved) return [];
  try {
    const record = JSON.parse(saved) as { date?: string; matches?: Match[] };
    return record.date === date && Array.isArray(record.matches) ? record.matches : [];
  } catch {
    return [];
  }
}

export function readRegisteredPlayers(saved: string | null, previousSession: string | null): Player[] {
  const parsePlayers = (value: string | null) => {
    if (!value) return [];
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.filter((player): player is Player => Boolean(player?.id && player?.displayName)) : [];
    } catch {
      return [];
    }
  };

  const activePlayers = parsePlayers(saved);
  if (saved !== null) return activePlayers;
  try {
    const session = previousSession ? JSON.parse(previousSession) as { players?: Player[] } : {};
    return Array.isArray(session.players) ? session.players.filter((player) => Boolean(player?.id && player?.displayName)) : [];
  } catch {
    return [];
  }
}
