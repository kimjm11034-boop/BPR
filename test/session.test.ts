import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRoster, readRegisteredPlayers, readTodayMatches, shouldResetStoredData } from '../lib/domain/session.ts';

test('buildRoster keeps four entered slots and gives duplicate names separate ids', () => {
  const roster = buildRoster([' 김재민 ', '김재민', '', '송송송', '종종종']);

  assert.equal(roster.length, 4);
  assert.deepEqual(roster.map((player) => player.displayName), ['김재민', '김재민', '송송송', '종종종']);
  assert.notEqual(roster[0].id, roster[1].id);
});

test('readTodayMatches ignores a previous day while keeping current day records', () => {
  const saved = JSON.stringify({ date: '2026-08-13', matches: [{ id: 'm1' }] });

  assert.deepEqual(readTodayMatches(saved, '2026-08-13'), [{ id: 'm1' }]);
  assert.deepEqual(readTodayMatches(saved, '2026-08-14'), []);
});

test('readRegisteredPlayers prefers the active registry and falls back to the previous session roster', () => {
  const active = JSON.stringify([{ id: 'p1', displayName: '김재민' }]);
  const previousSession = JSON.stringify({ players: [{ id: 'p2', displayName: '김민재' }] });

  assert.deepEqual(readRegisteredPlayers(active, previousSession), [{ id: 'p1', displayName: '김재민' }]);
  assert.deepEqual(readRegisteredPlayers(null, previousSession), [{ id: 'p2', displayName: '김민재' }]);
});

test('shouldResetStoredData only resets an old or missing data version', () => {
  assert.equal(shouldResetStoredData(null, 'clean-slate-v1'), true);
  assert.equal(shouldResetStoredData('legacy-v0', 'clean-slate-v1'), true);
  assert.equal(shouldResetStoredData('clean-slate-v1', 'clean-slate-v1'), false);
});
