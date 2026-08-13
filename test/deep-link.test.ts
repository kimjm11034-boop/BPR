import test from 'node:test';
import assert from 'node:assert/strict';
import { readAuthCode } from '../lib/supabase/deep-link.ts';

test('readAuthCode accepts a BPR callback URL for cold-start login', () => {
  assert.equal(readAuthCode('bpr://auth-callback?code=abc123'), 'abc123');
});

test('readAuthCode ignores unrelated URLs', () => {
  assert.equal(readAuthCode('https://example.com/?code=abc123'), null);
});
