const test = require('node:test');
const assert = require('node:assert/strict');
const { challenge, incoming, remainingMs, refreshSession, serializeSession, deserializeSession, assertCanStart } = require('../src/contracts');
const record = { id: 'f8c37b9f-7902-47af-8c73-d804847255ae', challengeId: 'retry-queue-v1', startedAt: 1000, deadlineAt: 61000, status: 'RUNNING', workspace: '/tmp/workspace', baseline: '/tmp/baseline' };
test('deadline uses persisted absolute time', () => { assert.equal(remainingMs(record, 1000), 60000); assert.equal(remainingMs(record, 70000), 0); assert.equal(refreshSession(record, 61000).status, 'TIMED_OUT'); });
test('session serialization validates and round trips', () => { assert.deepEqual(deserializeSession(serializeSession(record)), record); assert.throws(() => deserializeSession('{bad')); assert.throws(() => serializeSession({ ...record, status: 'READY' })); });
test('manifest validates metadata', () => { assert.equal(challenge.parse({ id: 'retry-queue-v1', title: 'Retry', description: 'A bug', durationMinutes: 60, entryFile: 'queue.js', runnerId: 'retry-queue-v1' }).id, 'retry-queue-v1'); assert.equal(challenge.safeParse({ id: '../bad' }).success, false); });
test('messages reject unknown and malformed actions', () => {
  assert.equal(incoming.safeParse({ type: 'shell', payload: {} }).success, false);
  assert.equal(incoming.safeParse({ type: 'startInterview', payload: { challengeId: '../other' } }).success, false);
  assert.equal(incoming.safeParse({ type: 'getInitialState', payload: {} }).success, true);
  for (const type of ['configureGroq', 'testGroq', 'removeGroqKey', 'refreshGroqModels']) {
    assert.equal(incoming.safeParse({ type, payload: {} }).success, true);
    assert.equal(incoming.safeParse({ type, payload: { apiKey: 'must-not-cross-boundary' } }).success, false);
  }
  assert.equal(incoming.safeParse({ type: 'testGrok', payload: {} }).success, false);
});
test('duplicate session start rejected', () => { assert.throws(() => assertCanStart(record, 2000)); assert.doesNotThrow(() => assertCanStart(null)); });
