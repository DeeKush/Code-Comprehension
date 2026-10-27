const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { ensureStorageDirectories, createSessionDirectory, withStartLock, writeCurrentSession, loadCurrentSession } = require('../src/sessionStorage');

async function temporaryStorage(t) {
  const parent = await fs.mkdtemp(path.join(os.tmpdir(), 'codebase-detective-storage-test-'));
  t.after(() => fs.rm(parent, { recursive: true, force: true }));
  return path.join(parent, 'globalStorage');
}

test('initializes a completely missing global storage root', async t => {
  const storageRoot = await temporaryStorage(t);
  const id = crypto.randomUUID();
  const sessionRoot = await createSessionDirectory(storageRoot, id);
  const sessionsRoot = path.dirname(sessionRoot);
  assert.equal(sessionsRoot, path.join(storageRoot, 'sessions'));
  assert.equal((await fs.stat(sessionsRoot)).isDirectory(), true);
  assert.equal((await fs.stat(sessionRoot)).isDirectory(), true);
  assert.equal(await loadCurrentSession(storageRoot), null);
});

test('recreates a missing sessions parent without disturbing the storage root', async t => {
  const storageRoot = await temporaryStorage(t);
  await fs.mkdir(storageRoot);
  await fs.writeFile(path.join(storageRoot, 'unrelated.txt'), 'preserve');
  const id = crypto.randomUUID();
  assert.equal(await createSessionDirectory(storageRoot, id), path.join(storageRoot, 'sessions', id));
  assert.equal(await fs.readFile(path.join(storageRoot, 'unrelated.txt'), 'utf8'), 'preserve');
});

test('creates a new session, preserves its deadline, and refuses a duplicate directory', async t => {
  const storageRoot = await temporaryStorage(t);
  const id = crypto.randomUUID();
  const root = await createSessionDirectory(storageRoot, id);
  const workspace = path.join(root, 'workspace'), baseline = path.join(root, 'baseline');
  await fs.mkdir(workspace);
  await fs.mkdir(baseline);
  await fs.writeFile(path.join(workspace, 'queue.js'), 'candidate edit');
  await fs.writeFile(path.join(baseline, 'queue.js'), 'starter');
  const startedAt = Date.now();
  const record = { id, challengeId:'retry-queue-v1', startedAt, deadlineAt:startedAt + 3600000, status:'RUNNING', workspace, baseline };
  await writeCurrentSession(storageRoot, record);
  assert.deepEqual(await loadCurrentSession(storageRoot), record);
  await assert.rejects(createSessionDirectory(storageRoot, id), { code:'EEXIST' });
  assert.equal(await fs.readFile(path.join(workspace, 'queue.js'), 'utf8'), 'candidate edit');
});

test('reopens an existing session after startup initialization without changing its files', async t => {
  const storageRoot = await temporaryStorage(t);
  const id = crypto.randomUUID();
  const root = await createSessionDirectory(storageRoot, id);
  const workspace = path.join(root, 'workspace'), baseline = path.join(root, 'baseline');
  await fs.mkdir(workspace);
  await fs.mkdir(baseline);
  const startedAt = Date.now();
  const record = { id, challengeId:'retry-queue-v1', startedAt, deadlineAt:startedAt + 3600000, status:'RUNNING', workspace, baseline };
  await writeCurrentSession(storageRoot, record);
  await ensureStorageDirectories(storageRoot);
  assert.deepEqual(await loadCurrentSession(storageRoot), record);
  assert.equal((await fs.stat(workspace)).isDirectory(), true);
  assert.equal((await fs.stat(baseline)).isDirectory(), true);
});

test('start lock prevents concurrent session initialization and releases after completion', async t => {
  const storageRoot=await temporaryStorage(t);
  let release;
  const held=withStartLock(storageRoot,()=>new Promise(resolve=>{release=resolve;}));
  while(!release) await new Promise(resolve=>setTimeout(resolve,1));
  await assert.rejects(withStartLock(storageRoot,async()=>{}),/another VS Code window/i);
  release('first complete');
  assert.equal(await held,'first complete');
  assert.equal(await withStartLock(storageRoot,async()=> 'next start'),'next start');
});
