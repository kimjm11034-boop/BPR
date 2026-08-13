import test from 'node:test';
import assert from 'node:assert/strict';
import { cancelLocalMatch, loadLocalStore, saveLocalStore } from '../lib/domain/local-store.ts';

class MemoryStorage implements Storage {
  private values = new Map<string, string>();
  get length() { return this.values.size; }
  clear() { this.values.clear(); }
  getItem(key: string) { return this.values.get(key) ?? null; }
  key(index: number) { return [...this.values.keys()][index] ?? null; }
  removeItem(key: string) { this.values.delete(key); }
  setItem(key: string, value: string) { this.values.set(key, value); }
}

test('loadLocalStore creates a stable device-backed empty state', () => {
  const storage = new MemoryStorage();
  const first = loadLocalStore(storage, '2026-08-13');
  const second = loadLocalStore(storage, '2026-08-13');

  assert.equal(first.schemaVersion, 'offline-v1');
  assert.match(first.deviceId, /^device-/);
  assert.equal(first.deviceId, second.deviceId);
  assert.deepEqual(first.players, []);
  assert.deepEqual(first.matches, []);
  assert.deepEqual(first.todayMatches, []);
});

test('saveLocalStore round-trips players, matches, and today records', () => {
  const storage = new MemoryStorage();
  const state = loadLocalStore(storage, '2026-08-13');
  const next = {
    ...state,
    players: [{ id: 'p1', displayName: '김재민' }],
    inactivePlayerIds: ['p9'],
    matches: [{ id: 'm1', playedAt: '2026-08-13T10:00:00.000Z', teamA: [{ id: 'p1', displayName: '김재민' }, { id: 'p2', displayName: '김민재' }], teamB: [{ id: 'p3', displayName: '재민김' }, { id: 'p4', displayName: '민재김' }], winner: 'A' as const }],
    todayMatches: [{ id: 'm1', playedAt: '2026-08-13T10:00:00.000Z', teamA: [{ id: 'p1', displayName: '김재민' }, { id: 'p2', displayName: '김민재' }], teamB: [{ id: 'p3', displayName: '재민김' }, { id: 'p4', displayName: '민재김' }], winner: 'A' as const }],
    cancelledMatchIds: [],
  };

  saveLocalStore(storage, next);
  assert.deepEqual(loadLocalStore(storage, '2026-08-13'), next);
  assert.deepEqual(loadLocalStore(storage, '2026-08-14').todayMatches, []);
});

test('cancelling a local match removes it from both record lists and keeps a tombstone', () => {
  const storage = new MemoryStorage();
  const state = loadLocalStore(storage, '2026-08-13');
  const match = { id: 'm1', playedAt: '2026-08-13T10:00:00.000Z', teamA: [{ id: 'p1', displayName: '김재민' }, { id: 'p2', displayName: '김민재' }], teamB: [{ id: 'p3', displayName: '재민김' }, { id: 'p4', displayName: '민재김' }], winner: 'A' as const };
  const next = cancelLocalMatch({ ...state, matches: [match], todayMatches: [match] }, 'm1');

  assert.deepEqual(next.matches, []);
  assert.deepEqual(next.todayMatches, []);
  assert.deepEqual(next.cancelledMatchIds, ['m1']);
});

test('loadLocalStore ignores malformed values without losing the device identity', () => {
  const storage = new MemoryStorage();
  storage.setItem('bpr-local-store', '{broken');

  const state = loadLocalStore(storage, '2026-08-13');

  assert.match(state.deviceId, /^device-/);
  assert.deepEqual(state.players, []);
  assert.deepEqual(state.matches, []);
});
