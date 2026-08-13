export type RankingStats = { games: number; wins: number; losses: number; winRate: number };

export function compareRanking(a: RankingStats & { label: string }, b: RankingStats & { label: string }) {
  return b.winRate - a.winRate || b.wins - a.wins || b.games - a.games || a.label.localeCompare(b.label, 'ko');
}
