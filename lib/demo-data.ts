export type Player = { id: string; displayName: string };
export type Match = { id: string; playedAt: string; teamA: [Player, Player]; teamB: [Player, Player]; winner: 'A' | 'B' };

export const DEMO_PLAYERS: Player[] = [
  { id: 'p1', displayName: '김재민' }, { id: 'p2', displayName: '김민재' }, { id: 'p3', displayName: '재민김' },
  { id: 'p4', displayName: '민재김' }, { id: 'p5', displayName: '송송송' }, { id: 'p6', displayName: '종종종' },
];
const player = (id: string) => DEMO_PLAYERS.find((item) => item.id === id)!;
export const DEMO_MATCHES: Match[] = [
  { id: 'm1', playedAt: '2026-08-13T10:00:00.000Z', teamA: [player('p1'), player('p2')], teamB: [player('p3'), player('p4')], winner: 'A' },
  { id: 'm2', playedAt: '2026-08-13T10:30:00.000Z', teamA: [player('p1'), player('p3')], teamB: [player('p5'), player('p6')], winner: 'B' },
  { id: 'm3', playedAt: '2026-08-13T11:00:00.000Z', teamA: [player('p2'), player('p4')], teamB: [player('p5'), player('p6')], winner: 'A' },
];

export function personalRankings(players: Player[], matches: Match[]) {
  return players.map((player) => {
    let wins = 0; let losses = 0;
    matches.forEach((match) => {
      const team = match.teamA.some((item) => item.id === player.id) ? 'A' : match.teamB.some((item) => item.id === player.id) ? 'B' : null;
      if (!team) return;
      if (team === match.winner) wins += 1; else losses += 1;
    });
    const games = wins + losses;
    return { player, wins, losses, games, winRate: games ? wins / games : 0 };
  }).sort((a, b) => b.winRate - a.winRate || b.wins - a.wins || b.games - a.games || a.player.displayName.localeCompare(b.player.displayName, 'ko'));
}

export function partnerRankings(players: Player[], matches: Match[]) {
  const byKey = new Map<string, { ids: [string, string]; wins: number; losses: number }>();
  const activeIds = new Set(players.map((player) => player.id));
  matches.forEach((match) => {
    ([['A', match.teamA], ['B', match.teamB]] as const).forEach(([team, roster]) => {
      const ids = roster.map((item) => item.id).sort() as [string, string]; const key = ids.join(':');
      if (!ids.every((id) => activeIds.has(id))) return;
      const current = byKey.get(key) ?? { ids, wins: 0, losses: 0 };
      if (team === match.winner) current.wins += 1; else current.losses += 1;
      byKey.set(key, current);
    });
  });
  return [...byKey.values()].map((item) => { const games = item.wins + item.losses; return { ...item, key: item.ids.join(':'), players: item.ids.map((id) => players.find((player) => player.id === id)!), games, winRate: games ? item.wins / games : 0 }; }).sort((a, b) => b.winRate - a.winRate || b.wins - a.wins || b.games - a.games || a.key.localeCompare(b.key));
}
