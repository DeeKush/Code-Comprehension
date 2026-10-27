const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { TESTS, fingerprint, snapshot, verifySnapshot, parseHarnessOutput, score, runFixed } = require('../src/evaluation');
const starter = path.resolve('challenges/retry-queue-v1/starter');
const harness = path.resolve('challenges/retry-queue-v1/harness.js');
async function sandbox(fn) { const root = await fs.mkdtemp(path.join(os.tmpdir(), 'detective-test-')); try { return await fn(root); } finally { await fs.rm(root, { recursive:true, force:true }); } }
test('starter bug fails retry checks; corrected queue passes fixed suite', async () => sandbox(async root => {
  const bad = await runFixed({sessionId:'test',target:starter,harness});
  assert.equal(bad.status,'completed'); assert.equal(bad.tests.find(t=>t.id==='retry').outcome,'failed');
  const good = path.join(root,'good'); await fs.cp(starter,good,{recursive:true});
  const source = await fs.readFile(path.join(good,'queue.js'),'utf8');
  await fs.writeFile(path.join(good,'queue.js'),source.replace('      this.pending.push(job.id);\n    }\n  }','    }\n  }'));
  const run = await runFixed({sessionId:'test',target:good,harness});
  assert.equal(run.status,'completed'); assert.ok(run.tests.every(t=>t.outcome==='passed'));
  assert.equal(score(run.tests,run.status).correctness,35);
}));
test('snapshot copies and hashes independently', async () => sandbox(async root => {
  const work=path.join(root,'work'), saved=path.join(root,'submission'); await fs.cp(starter,work,{recursive:true});
  const original=await fingerprint(starter); const manifest=await snapshot(work,saved);
  assert.equal((await verifySnapshot(saved)).fingerprint,manifest.fingerprint);
  await fs.appendFile(path.join(work,'queue.js'),'\n// later edit');
  assert.notEqual((await fingerprint(work)).fingerprint,manifest.fingerprint);
  assert.equal((await fingerprint(starter)).fingerprint,original.fingerprint);
  await assert.rejects(snapshot(work,saved));
}));
test('malformed output and infrastructure failure are distinct', async () => sandbox(async root => {
  await assert.rejects(async()=>parseHarnessOutput('{broken'));
  const bad=await runFixed({sessionId:'test',target:starter,harness:path.join(root,'missing.js')});
  assert.equal(bad.status,'infrastructure_error'); assert.equal(score(bad.tests,bad.status),null);
}));
test('weighted score is deterministic and bounded', () => {
  const all=TESTS.map(t=>({...t,outcome:'passed'}));
  assert.deepEqual(score(all,'completed'),{passedPoints:35,totalPoints:35,correctness:35});
  const partial=all.map(t=>t.id==='overlap'?{...t,outcome:'failed'}:t);
  assert.equal(score(partial,'completed').correctness,23);
  assert.deepEqual(score(partial,'completed'),score(partial,'completed'));
  assert.equal(score(all.map(t=>({...t,outcome:'failed'})),'completed').correctness,0);
  assert.equal(score(all,'timeout'),null);
});
test('timeout and output cap return structured infrastructure outcomes', async () => sandbox(async root => {
  const slow = path.join(root,'slow.js'), noisy = path.join(root,'noisy.js');
  await fs.writeFile(slow, 'setInterval(() => {}, 1000)');
  await fs.writeFile(noisy, 'process.stdout.write("x".repeat(100000))');
  const timed = await runFixed({sessionId:'test',target:starter,harness:slow,timeoutMs:80});
  assert.equal(timed.status,'timeout');
  const output = await runFixed({sessionId:'test',target:starter,harness:noisy,maxOutput:1024});
  assert.equal(output.status,'output_limit'); assert.equal(output.truncated,true);
}));
