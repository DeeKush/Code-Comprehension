const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { serializeSession, deserializeSession } = require('./contracts');

async function atomicWrite(file, data) {
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(temp, data, { flag: 'wx' });
  try { await fs.rename(temp, file); }
  catch (error) { await fs.rm(temp, { force: true }); throw error; }
}

async function ensureStorageDirectories(storageRoot) {
  await fs.mkdir(storageRoot, { recursive: true });
  const sessionsRoot = path.join(storageRoot, 'sessions');
  await fs.mkdir(sessionsRoot, { recursive: true });
  return sessionsRoot;
}

async function createSessionDirectory(storageRoot, id) {
  if (!/^[a-f0-9-]{36}$/i.test(id)) throw new Error('Invalid session ID.');
  const sessionsRoot = await ensureStorageDirectories(storageRoot);
  const root = path.join(sessionsRoot, id);
  const created = await fs.mkdir(root, { recursive: true });
  if (!created) {
    const error = new Error('A session with this ID already exists.');
    error.code = 'EEXIST';
    throw error;
  }
  return root;
}

async function withStartLock(storageRoot, task) {
  await ensureStorageDirectories(storageRoot);
  const lock=path.join(storageRoot,'session-start.lock');
  let handle;
  try { handle=await fs.open(lock,'wx'); }
  catch(error) {
    if(error.code!=='EEXIST') throw error;
    let stale=false;
    try {
      const owner=JSON.parse(await fs.readFile(lock,'utf8'));
      if(Number.isInteger(owner.pid) && owner.pid>0 && owner.pid!==process.pid) {
        try { process.kill(owner.pid,0); }
        catch(checkError) { stale=checkError.code==='ESRCH'; }
      }
    } catch { /* an incomplete lock is treated as active until it ages out */ }
    if (!stale) {
      const stat=await fs.stat(lock).catch(()=>null);
      stale=!!stat && Date.now()-stat.mtimeMs>120000;
    }
    if(!stale) throw new Error('An interview is being initialized in another VS Code window. Retry in a moment.');
    await fs.rm(lock,{force:true});
    handle=await fs.open(lock,'wx');
  }
  try { await handle.writeFile(JSON.stringify({pid:process.pid,at:Date.now()})); return await task(); }
  finally { await handle.close(); await fs.rm(lock,{force:true}); }
}

async function writeCurrentSession(storageRoot, record) {
  const root = path.join(storageRoot, 'sessions', record.id);
  await atomicWrite(path.join(root, 'session.json'), serializeSession(record));
  await atomicWrite(path.join(storageRoot, 'current-session.json'), JSON.stringify({ id: record.id }));
}

async function loadCurrentSession(storageRoot) {
  let pointer;
  try { pointer = JSON.parse(await fs.readFile(path.join(storageRoot, 'current-session.json'), 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  const id = pointer?.id;
  if (typeof id !== 'string' || !/^[a-f0-9-]{36}$/i.test(id)) throw new Error('Invalid session pointer.');
  const root = path.join(storageRoot, 'sessions', id);
  const saved = deserializeSession(await fs.readFile(path.join(root, 'session.json'), 'utf8'));
  if (saved.id !== id || saved.workspace !== path.join(root, 'workspace') || saved.baseline !== path.join(root, 'baseline')) throw new Error('Invalid session paths.');
  await fs.access(saved.workspace);
  await fs.access(saved.baseline);
  return saved;
}

function isSessionWorkspace(record, workspacePaths) {
  if (!record || !Array.isArray(workspacePaths)) return false;
  const normalized = value => process.platform === 'win32' ? path.resolve(value).toLowerCase() : path.resolve(value);
  return workspacePaths.some(value => typeof value === 'string' && normalized(value) === normalized(record.workspace));
}

module.exports = { atomicWrite, ensureStorageDirectories, createSessionDirectory, withStartLock, writeCurrentSession, loadCurrentSession, isSessionWorkspace };
