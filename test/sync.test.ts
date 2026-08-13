import test from 'node:test';
import assert from 'node:assert/strict';
import { DEMO_MATCHES, DEMO_PLAYERS } from '../lib/demo-data.ts';
import { buildSyncPlan } from '../lib/supabase/sync.ts';

test('buildSyncPlan deduplicates players and matches while keeping deterministic match order', () => {
  const snapshot = {
    schemaVersion: 'offline-v1',
    deviceId: 'device-test',
    players: [DEMO_PLAYERS[1], DEMO_PLAYERS[0], DEMO_PLAYERS[1]],
    inactivePlayerIds: ['p9', 'p9', 'p2'],
    matches: [DEMO_MATCHES[2], DEMO_MATCHES[0], DEMO_MATCHES[0]],
    todayMatches: [],
    cancelledMatchIds: ['m1', 'm1'],
    updatedAt: '2026-08-13T00:00:00.000Z',
  };

  const plan = buildSyncPlan(snapshot);

  assert.deepEqual(plan.players.map((player) => player.id), ['p2', 'p1']);
  assert.deepEqual(plan.inactivePlayerIds, ['p9', 'p2']);
  assert.deepEqual(plan.matches.map((match) => match.id), ['m1', 'm3']);
  assert.deepEqual(plan.cancelledMatchIds, ['m1']);
});
