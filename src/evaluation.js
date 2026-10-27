const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const { z } = require('zod');
const TESTS = [
  { id: 'success', description: 'Successful job completes once', points: 4 },
  { id: 'retry', description: 'A failed job retries and completes', points: 8 },
  { id: 'overlap', description: 'Retries do not execute concurrently or duplicate', points: 12 },
  { id: 'exhaustion', description: 'Attempts stop at the configured limit', points: 7 },
  { id: 'duplicate', description: 'Duplicate IDs are rejected', points: 4 }
];
const harnessOutput = z.object({ tests: z.array(z.object({ id: z.string(), outcome: z.enum(['passed','failed','error','skipped']), message: z.string().max(1000) }).strict()).length(TESTS.length) }).strict();
const sha = data => crypto.createHash('sha256').update(data).digest('hex');
async function filesUnder(root) {
  const result = [];
  async function visit(dir, relative = '') {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.') || entry.name === 'coverage') continue;
      if (!entry.isDirectory() && !entry.isFile()) throw new Error('Links and special files are not permitted in submissions.');
      const rel = path.join(relative, entry.name);
      if (entry.isDirectory()) await visit(path.join(dir, entry.name), rel);
      else if (entry.name.endsWith('.js') || entry.name.endsWith('.md') || entry.name === 'package.json') result.push(rel);
    }
  }
  await visit(root); return result.sort();
}
async function fingerprint(root) {
  const files = [];
  for (const relative of await filesUnder(root)) {
    const bytes = await fs.readFile(path.join(root, relative));
    if (bytes.length > 1024 * 1024) throw new Error('Challenge file exceeds 1 MB.');
    files.push({ path: relative.replace(/\\/g, '/'), size: bytes.length, sha256: sha(bytes) });
  }
  return { files, fingerprint: sha(JSON.stringify(files)) };
}
async function snapshot(workspace, target) {
  const temp = `${target}.${crypto.randomUUID()}.tmp`;
  await fs.mkdir(temp, { recursive: false });
  try {
    const source = await fingerprint(workspace);
    for (const file of source.files) {
      const from = path.join(workspace, file.path), to = path.join(temp, file.path);
      await fs.mkdir(path.dirname(to), { recursive: true });
      await fs.copyFile(from, to);
    }
    const copied = await fingerprint(temp);
    if (copied.fingerprint !== source.fingerprint) throw new Error('Workspace changed while snapshot was being created. Retry submission.');
    const manifest = { id: crypto.randomUUID(), createdAt: Date.now(), ...copied };
    await fs.writeFile(path.join(temp, 'snapshot-manifest.json'), JSON.stringify(manifest, null, 2));
    await fs.rename(temp, target);
    return manifest;
  } catch (error) { await fs.rm(temp, { recursive: true, force: true }); throw error; }
}
async function verifySnapshot(target) {
  const manifest = JSON.parse(await fs.readFile(path.join(target, 'snapshot-manifest.json'), 'utf8'));
  const current = await fingerprint(target);
  if (current.fingerprint !== manifest.fingerprint || JSON.stringify(current.files) !== JSON.stringify(manifest.files)) throw new Error('Submission snapshot hash verification failed.');
  return manifest;
}
function parseHarnessOutput(text) {
  const parsed = harnessOutput.parse(JSON.parse(text));
  if (new Set(parsed.tests.map(t => t.id)).size !== TESTS.length || TESTS.some(t => !parsed.tests.some(r => r.id === t.id))) throw new Error('Runner test IDs do not match the fixed suite.');
  return parsed.tests.map(item => ({ ...TESTS.find(t => t.id === item.id), outcome: item.outcome, message: item.message }));
}
function score(tests, status) {
  if (status !== 'completed' || !tests || tests.some(t => t.outcome === 'skipped' || t.outcome === 'error')) return null;
  const totalPoints = TESTS.reduce((n, t) => n + t.points, 0);
  const passedPoints = tests.filter(t => t.outcome === 'passed').reduce((n,t) => n + t.points, 0);
  return { passedPoints, totalPoints, correctness: Math.round(3500 * passedPoints / totalPoints) / 100 };
}
async function runFixed({ sessionId, target, harness, timeoutMs = 8000, maxOutput = 65536, executable = process.execPath }) {
  const startedAt = Date.now(), targetInfo = await fingerprint(target);
  return new Promise(resolve => {
    let stdout = '', stderr = '', outcome = 'completed', settled = false, child, timer;
    const finish = (code, signal) => {
      if (settled) return; settled = true; clearTimeout(timer);
      let tests = null;
      if (outcome === 'completed') {
        try { if (code !== 0 || signal) throw new Error(`Runner exited with ${code ?? signal}`); tests = parseHarnessOutput(stdout); }
        catch (error) { outcome = 'infrastructure_error'; stderr = `${stderr}\n${error.message}`; }
      }
      resolve({ id: crypto.randomUUID(), sessionId, challengeId: 'retry-queue-v1', targetFingerprint: targetInfo.fingerprint, startedAt, finishedAt: Date.now(), durationMs: Date.now() - startedAt, status: outcome, tests, diagnostic: stderr.slice(0, 1000), truncated: outcome === 'output_limit' });
    };
    try { child = spawn(executable, [harness, target], { cwd: target, shell: false, windowsHide: true, env: { PATH: process.env.PATH, SystemRoot: process.env.SystemRoot } }); }
    catch (error) { outcome = 'infrastructure_error'; stderr = error.message; finish(null, null); return; }
    timer = setTimeout(() => { outcome = 'timeout'; child.kill(); }, timeoutMs);
    child.on('error', error => { outcome = 'infrastructure_error'; stderr = error.message; finish(null, null); });
    child.stdout.on('data', chunk => { stdout += chunk; if (stdout.length > maxOutput) { outcome = 'output_limit'; stdout = stdout.slice(0, maxOutput); child.kill(); } });
    child.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(0, maxOutput); });
    child.on('close', finish);
  });
}
module.exports = { TESTS, fingerprint, snapshot, verifySnapshot, parseHarnessOutput, score, runFixed };
