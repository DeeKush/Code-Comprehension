const vscode = require('vscode');
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { challenge: challengeSchema, incoming, serializeSession, assertCanStart } = require('./contracts');
const { fingerprint, snapshot, verifySnapshot, score, runFixed } = require('./evaluation');
const { answersSchema, responseJsonSchema, assistantSystemPrompt, assessmentSystemPrompt, hash, buildContext, validateAssessment, assertCanAssess, recoverAssessment, failedAssessment, prepareEvidence } = require('./ai');
const { createGroqCredentials, callGroq, listGroqModels } = require('./groq');
const { atomicWrite, ensureStorageDirectories, createSessionDirectory, withStartLock, writeCurrentSession, loadCurrentSession, isSessionWorkspace } = require('./sessionStorage');
const { createCompanion } = require('./companion');
const { renderWebview } = require('./webview');

class ChallengeTree {
  constructor() { this.root = null; this.changed = new vscode.EventEmitter(); this.onDidChangeTreeData = this.changed.event; }
  setRoot(root) { this.root = root; this.changed.fire(); }
  async getChildren(item) {
    const dir = item ? item.uri.fsPath : this.root;
    if (!dir) return [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    return entries.filter(e => e.isFile() || e.isDirectory()).sort((a,b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name)).map(e => {
      const uri = vscode.Uri.file(path.join(dir, e.name));
      const node = new vscode.TreeItem(uri, e.isDirectory() ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None);
      if (e.isFile()) node.command = { command: 'vscode.open', title: 'Open challenge file', arguments: [uri] };
      return node;
    });
  }
  getTreeItem(item) { return item; }
}

async function safeCopy(source, target) {
  const entries = await fs.readdir(source, { withFileTypes: true });
  await fs.mkdir(target, { recursive: true });
  for (const entry of entries) {
    if (!entry.isFile() && !entry.isDirectory()) throw new Error('Challenge contains an unsupported link or file type.');
    const from = path.join(source, entry.name), to = path.join(target, entry.name);
    if (entry.isDirectory()) await safeCopy(from, to); else await fs.copyFile(from, to);
  }
}
async function readChallenge(context) {
  const base = path.join(context.extensionPath, 'challenges', 'retry-queue-v1');
  const manifest = challengeSchema.parse(JSON.parse(await fs.readFile(path.join(base, 'manifest.json'), 'utf8')));
  const starter = path.join(base, 'starter');
  const entry = path.resolve(starter, manifest.entryFile);
  if (!entry.startsWith(starter + path.sep)) throw new Error('Invalid challenge entry file.');
  await fs.access(entry);
  return { manifest, starter };
}
function publicSession(record) { return record && { id: record.id, challengeId: record.challengeId, startedAt: record.startedAt, deadlineAt: record.deadlineAt, status: record.status, workspaceReady: true }; }

async function activate(context) {
  const tree = new ChallengeTree();
  context.subscriptions.push(vscode.window.registerTreeDataProvider('codebaseDetective.files', tree));
  const storageRoot = context.globalStorageUri.fsPath;
  const sessionsRoot = path.join(storageRoot, 'sessions');
  let panel, current = null, recoveryError = null, startPromise = null, operation = null, launchedLocally = false;
  const credentials = createGroqCredentials(context.secrets);
  const defaultModel = require('../package.json').contributes.configuration.properties['codebaseDetective.groqModel'].default;
  const model = () => vscode.workspace.getConfiguration('codebaseDetective').get('groqModel', defaultModel);
  async function configureGroq() {
    const key = await vscode.window.showInputBox({ prompt: 'Groq API key (stored in VS Code SecretStorage)', password: true, ignoreFocusOut: true, validateInput: value => value && !value.trim() ? 'Enter a non-empty Groq API key.' : undefined });
    if (key === undefined) return;
    await credentials.set(key);
    send('groqStatus', { configured: true, message: 'Groq API key saved securely.' });
  }
  async function removeGroqKey() {
    await credentials.remove();
    send('groqStatus', { configured: false, message: 'Groq API key removed.' });
  }
  async function testGroq() {
    await callGroq({ apiKey:await credentials.get(), model:model(), system:'You are a connection check. Reply briefly.', contents:'Reply with OK.', maxTokens:64 });
    send('groqStatus', { configured: true, message: 'Groq connection succeeded.' });
  }
  async function refreshGroqModels() {
    send('groqModels', { models: await listGroqModels({ apiKey:await credentials.get() }), configuredModel:model() });
  }
  context.subscriptions.push(vscode.commands.registerCommand('codebaseDetective.configureGroq', configureGroq));
  context.subscriptions.push(vscode.commands.registerCommand('codebaseDetective.testGroq', testGroq));
  context.subscriptions.push(vscode.commands.registerCommand('codebaseDetective.removeGroqKey', removeGroqKey));
  const sameWorkspace = record => isSessionWorkspace(record,vscode.workspace.workspaceFolders?.map(folder=>folder.uri.fsPath));
  const mayUseSession = () => !!current && (launchedLocally || sameWorkspace(current));
  const companion = createCompanion(context,{credentials,model,openInterviewLab:openPanel});
  context.subscriptions.push(vscode.window.registerWebviewViewProvider('codebaseDetective.assistant',companion.provider,{webviewOptions:{retainContextWhenHidden:true}}));
  async function openAssistant() {
    await vscode.commands.executeCommand('workbench.view.explorer');
    await vscode.commands.executeCommand('codebaseDetective.assistant.focus');
  }
  context.subscriptions.push(vscode.commands.registerCommand('codebaseDetective.open',openAssistant));
  context.subscriptions.push(vscode.commands.registerCommand('codebaseDetective.newChat',async()=>{await companion.newChat();await openAssistant();}));
  context.subscriptions.push(vscode.commands.registerCommand('codebaseDetective.openInterviewLab',openPanel));
  context.subscriptions.push(vscode.commands.registerCommand('codebaseDetective.openActiveInterview',async()=>{if(!current) throw new Error('No saved interview.');await openInterviewWorkspace(current);if(!sameWorkspace(current)){launchedLocally=false;tree.setRoot(null);}}));
  const send = (type, payload = {}) => panel?.webview.postMessage({ type, payload });
  const recordFile = record => path.join(sessionsRoot, record.id, 'session.json');
  async function save(record) { await atomicWrite(recordFile(record), serializeSession(record)); current = record; send('sessionStateChanged', { session: publicSession(record) }); }
  const harness = path.join(context.extensionPath, 'challenges', 'retry-queue-v1', 'harness.js');
  async function runs() {
    if (!current) return [];
    const dir = path.join(sessionsRoot, current.id, 'runs');
    try { return (await Promise.all((await fs.readdir(dir)).filter(f => /^[a-f0-9-]{36}\.json$/i.test(f)).map(async f => JSON.parse(await fs.readFile(path.join(dir, f), 'utf8'))))).sort((a,b)=>a.startedAt-b.startedAt); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
  }
  async function persistRun(run) { const dir = path.join(sessionsRoot, run.sessionId, 'runs'); await fs.mkdir(dir, { recursive: true }); await atomicWrite(path.join(dir, `${run.id}.json`), JSON.stringify(run, null, 2)); }
  const answersFile = record => path.join(sessionsRoot, record.id, 'answers.json');
  const chatFile = record => path.join(sessionsRoot, record.id, 'chat.json');
  async function readChat() { if (!current) return []; try { return JSON.parse(await fs.readFile(chatFile(current),'utf8')); } catch (error) { if (error.code === 'ENOENT') return []; throw error; } }
  async function readAnswers() {
    let data;
    try { data = await fs.readFile(answersFile(current), 'utf8'); }
    catch (error) { if (error.code === 'ENOENT' && !current.answersHash) return {rootCause:'',implementation:'',verification:'',aiSupervision:''}; throw error; }
    if (current.answersHash && hash(data) !== current.answersHash) throw new Error('Submitted explanation hash does not match.');
    return answersSchema.parse(JSON.parse(data));
  }
  async function readSources(root) { const result = {}; for (const file of ['queue.js','worker.js','retryPolicy.js']) result[file] = await fs.readFile(path.join(root,file),'utf8'); return result; }
  async function report() {
    if (!current?.finalRunId) return null;
    const run = JSON.parse(await fs.readFile(path.join(sessionsRoot, current.id, 'runs', `${current.finalRunId}.json`), 'utf8'));
    const manifest = await verifySnapshot(current.snapshot);
    if (run.targetFingerprint !== manifest.fingerprint) throw new Error('Saved final run does not match the submission snapshot.');
    const points = score(run.tests, run.status);
    let qualitative = null;
    if (current.reportVersion) qualitative = JSON.parse(await fs.readFile(path.join(sessionsRoot,current.id,`report-v${current.reportVersion}.json`),'utf8'));
    return { status: current.scoringStatus, score: current.objectiveScore ?? null, passedPoints: points?.passedPoints ?? null, totalPoints: points?.totalPoints ?? 35, run, snapshotId: manifest.id, snapshotFingerprint: manifest.fingerprint, evaluatedAt: run.finishedAt, qualitativeStatus: current.qualitativeStatus || 'PENDING', qualitative };
  }
  async function assess() {
    assertCanAssess(current);
    const key = await credentials.get();
    if (!key) { await save({ ...current, qualitativeStatus:'PENDING' }); send('objectiveReportReady',{report:await report()}); return; }
    await save({ ...current, qualitativeStatus:'RUNNING' }); send('assessmentProgress',{status:'RUNNING'});
    try {
      const objective = await report(), answers = await readAnswers();
      const evidence = prepareEvidence({ answers, baseline:await readSources(current.baseline), finalFiles:await readSources(current.snapshot), finalRun:objective.run, priorRuns:(await runs()).filter(r=>r.id!==current.finalRunId), conversations:await readChat() });
      const ids = new Set(evidence.map(item=>item.id));
      const response = await callGroq({ apiKey:key, model:model(), system:assessmentSystemPrompt, schema:responseJsonSchema, contents:JSON.stringify({ instruction:'Score only the five qualitative criteria. Missing answers must reduce confidence; do not invent evidence. Return each criterion exactly once.', criteria:{rootCause:20,comprehension:15,codeQuality:15,debugging:10,aiSupervision:5}, objectiveScore:current.objectiveScore, evidence }) });
      const validated = validateAssessment(response, ids, current.objectiveScore);
      const version = (current.reportVersion || 0) + 1;
      const full = { ...validated, version, createdAt:Date.now(), snapshotId:objective.snapshotId, snapshotFingerprint:objective.snapshotFingerprint, finalRunId:current.finalRunId, evidence };
      await atomicWrite(path.join(sessionsRoot,current.id,`report-v${version}.json`),JSON.stringify(full,null,2));
      await save({ ...current, qualitativeStatus:'COMPLETE', reportVersion:version });
      send('finalReportReady',{report:await report()});
    } catch (error) { await save(failedAssessment(current)); send('assessmentFailed',{message:error.message}); throw error; }
  }
  async function evaluate() {
    if (!current?.snapshot || !['EVALUATING','EVALUATION_FAILED'].includes(current.status)) return;
    const manifest = await verifySnapshot(current.snapshot);
    if (current.status === 'EVALUATION_FAILED') await save({ ...current, status: 'EVALUATING', scoringStatus: 'PENDING' });
    send('submissionProgress', { stage: 'EVALUATING' });
    const run = await runFixed({ sessionId: current.id, target: current.snapshot, harness });
    await persistRun(run);
    if (run.targetFingerprint !== manifest.fingerprint) throw new Error('Final run target did not match snapshot.');
    const points = score(run.tests, run.status);
    if (!points) { await save({ ...current, status: 'EVALUATION_FAILED', scoringStatus: 'FAILED', finalRunId: run.id }); send('testRunFailed', { run }); return; }
    await save({ ...current, status: 'COMPLETED', scoringStatus: 'COMPLETE', finalRunId: run.id, objectiveScore: points.correctness, qualitativeStatus:'PENDING' });
    send('submissionCompleted', { session: publicSession(current) }); send('objectiveReportReady', { report: await report() });
    try { await assess(); } catch (error) { send('operationError',{code:'ASSESSMENT_FAILED',message:error.message}); }
  }
  async function submit(timeout = false, submittedAnswers = null) {
    if (!current || !['RUNNING','TIMED_OUT','SUBMITTING','EVALUATING','EVALUATION_FAILED'].includes(current.status)) throw new Error('This session cannot be submitted.');
    if (current.status === 'RUNNING' || current.status === 'TIMED_OUT') {
      const answers = answersSchema.parse(submittedAnswers || {rootCause:'',implementation:'',verification:'',aiSupervision:''});
      const data = JSON.stringify(answers);
      await atomicWrite(answersFile(current),data);
      await save({ ...current, status: 'SUBMITTING', submissionRequestedAt: Date.now(), scoringStatus: 'PENDING', answersHash:hash(data) });
    }
    if (current.status === 'SUBMITTING') {
      send('submissionProgress', { stage: 'SUBMITTING', timeout });
      const target = path.join(sessionsRoot, current.id, 'submission');
      try {
        let manifest;
        try { manifest = await verifySnapshot(target); }
        catch (error) { if (error.code !== 'ENOENT') throw error; manifest = await snapshot(current.workspace, target); }
        await save({ ...current, status: 'EVALUATING', snapshot: target, submittedAt: manifest.createdAt });
      } catch (error) { send('operationError', { code: 'SNAPSHOT_FAILED', message: error.message }); throw error; }
    }
    try { await evaluate(); }
    catch (error) { if (current.status === 'EVALUATING') await save({ ...current, status: 'EVALUATION_FAILED', scoringStatus: 'FAILED' }); throw error; }
  }
  async function exclusive(fn) { if (operation) throw new Error('Another interview operation is in progress.'); operation = Promise.resolve().then(fn); try { return await operation; } finally { operation = null; } }
  async function recover() {
    try {
      await ensureStorageDirectories(storageRoot);
      current = await loadCurrentSession(storageRoot);
      if (sameWorkspace(current)) tree.setRoot(current.workspace);
    } catch (error) {
      recoveryError = `Could not recover the saved interview: ${error.message}`;
    }
  }
  await recover();
  if (sameWorkspace(current)) {
    const handoff=current;
    void (async()=>{
      try {
        await vscode.window.showTextDocument(vscode.Uri.file(path.join(handoff.workspace,'queue.js')),{preview:false});
        await openAssistant();
        try { await vscode.commands.executeCommand('workbench.action.moveViewToSecondarySideBar'); } catch { /* VS Code may not expose this layout command */ }
      } catch(error) { vscode.window.showWarningMessage(`Interview workspace opened, but the assistant layout could not be restored: ${error.message}`); }
    })();
  }
  if (sameWorkspace(current) && current?.qualitativeStatus === 'RUNNING') await save(recoverAssessment(current));
  if (sameWorkspace(current) && (['TIMED_OUT','SUBMITTING','EVALUATING'].includes(current.status) || (current.status === 'RUNNING' && Date.now() >= current.deadlineAt))) void exclusive(() => submit(true)).catch(error => { recoveryError = `Submission recovery failed: ${error.message}`; send('operationError', { code: 'RECOVERY_FAILED', message: recoveryError }); });
  async function getState() {
    if (sameWorkspace(current) && current?.status === 'RUNNING' && Date.now() >= current.deadlineAt && !operation) void exclusive(() => submit(true)).catch(error => send('operationError', { code: 'TIMEOUT_SUBMISSION_FAILED', message: error.message }));
    return mayUseSession() ? publicSession(current) : null;
  }
  async function openInterviewWorkspace(record) {
    if (!record || record.status!=='RUNNING') throw new Error('No running interview is available to open.');
    await vscode.commands.executeCommand('vscode.openFolder',vscode.Uri.file(record.workspace),{forceNewWindow:true});
  }
  async function start(challengeId) {
    if (startPromise) return startPromise;
    startPromise = (async()=>{
      const record=await withStartLock(storageRoot, async () => {
        if (recoveryError) throw new Error(recoveryError);
        await getState();
        const existing=await loadCurrentSession(storageRoot);
        if (existing) current=existing;
        if (current) {
          if (current.challengeId===challengeId && current.status==='RUNNING' && Date.now()<current.deadlineAt) return current;
          assertCanStart(current);
        }
        const { manifest, starter } = await readChallenge(context);
        if (challengeId !== manifest.id) throw new Error('Unknown challenge.');
        const id = crypto.randomUUID(), root = path.join(sessionsRoot, id);
        const workspace = path.join(root, 'workspace'), baseline = path.join(root, 'baseline');
        let created = false, committed = false;
        try {
          await createSessionDirectory(storageRoot, id);
          created = true;
          await safeCopy(starter, baseline);
          await safeCopy(starter, workspace);
          const startedAt = Date.now();
          const next = { id, challengeId, startedAt, deadlineAt: startedAt + manifest.durationMinutes * 60000, status: 'RUNNING', workspace, baseline };
          await writeCurrentSession(storageRoot, next);
          committed = true; current = next; launchedLocally = true; tree.setRoot(workspace);
          send('sessionStarted', { session: publicSession(next) });
          return next;
        } catch (error) {
          if (created && !committed) await fs.rm(root, { recursive: true, force: true }).catch(() => {});
          throw error;
        }
      });
      try { await openInterviewWorkspace(record); launchedLocally=false; tree.setRoot(null); }
      catch (error) { send('operationError', { message: `Interview saved, but the new window could not open: ${error.message}. Use Codebase Detective: Open Active Interview Workspace to retry.` }); }
      return record;
    })();
    try { return await startPromise; } finally { startPromise = null; }
  }
  async function openPanel() {
    if (panel) { panel.reveal(); return; }
    panel = vscode.window.createWebviewPanel('codebaseDetective.interview', 'Codebase Detective', vscode.ViewColumn.Beside, { enableScripts: true, localResourceRoots: [vscode.Uri.file(path.join(context.extensionPath, 'media', 'ui'))] });
    panel.onDidDispose(() => { panel = null; }, null, context.subscriptions);
    panel.webview.onDidReceiveMessage(async raw => {
      const parsed = incoming.safeParse(raw);
      if (!parsed.success) { send('operationError', { message: 'Invalid interview request.' }); return; }
      try {
        const { type, payload } = parsed.data;
        if (type === 'startInterview') await start(payload.challengeId);
        else if (type === 'configureGroq') await configureGroq();
        else if (type === 'removeGroqKey') await removeGroqKey();
        else if (type === 'testGroq') await testGroq();
        else if (type === 'refreshGroqModels') await refreshGroqModels();
        else if (type === 'getInitialState') { const { manifest } = await readChallenge(context); const session=await getState(); send('initialState', { challenge: manifest, session, runs:session?await runs():[], report:session?await report():null, conversations:session?await readChat():[], groqConfigured:!!(await credentials.get()), currentFingerprint: session?.status === 'RUNNING' ? (await fingerprint(current.workspace)).fingerprint : null, error: recoveryError || (current&&!session?'An interview is active in another workspace. Use Codebase Detective: Open Active Interview.':null) }); }
        else if (type === 'getSessionState') { const session=await getState();send('sessionStateChanged', { session, currentFingerprint: session?.status === 'RUNNING' ? (await fingerprint(current.workspace)).fingerprint : null }); }
        else {
          if (!mayUseSession() || payload.sessionId !== current.id) throw new Error('Stale or unauthorized session request. Open the interview workspace to continue.');
          if (type === 'getTestRuns') send('testRunCompleted', { runs: await runs() });
          else if (type === 'getObjectiveReport') send('objectiveReportReady', { report: await report() });
          else if (type === 'runTests') await exclusive(async () => {
            if (current.status !== 'RUNNING' || Date.now() >= current.deadlineAt) { await getState(); throw new Error('Interview time has elapsed or submission has started.'); }
            send('testRunStarted', {});
            const run = await runFixed({ sessionId: current.id, target: current.workspace, harness });
            await persistRun(run); send(run.status === 'completed' ? 'testRunCompleted' : 'testRunFailed', { run });
          });
          else if (type === 'submitSession') await exclusive(async () => { if (current.status !== 'RUNNING') throw new Error('Already submitted.'); await submit(Date.now() >= current.deadlineAt, payload.answers); });
          else if (type === 'retrySubmission') await exclusive(async () => { if (current.status !== 'SUBMITTING') throw new Error('Snapshot is not retryable.'); await submit(); });
          else if (type === 'retryEvaluation') await exclusive(async () => { if (current.status !== 'EVALUATION_FAILED') throw new Error('Evaluation is not retryable.'); try { await evaluate(); } catch (error) { await save({ ...current, status: 'EVALUATION_FAILED', scoringStatus: 'FAILED' }); throw error; } });
          else if (type === 'retryAssessment') await exclusive(async () => { if (current.status !== 'COMPLETED' || current.qualitativeStatus === 'COMPLETE') throw new Error('Assessment is not retryable.'); await assess(); });
          else if (type === 'askAssistant') await exclusive(async () => {
            if (current.status !== 'RUNNING' || Date.now() >= current.deadlineAt) throw new Error('Assistant is available only during a running interview.');
            const editor = vscode.window.activeTextEditor;
            const candidatePath = editor?.document.uri.scheme === 'file' ? editor.document.uri.fsPath : undefined;
            const selectedPath = candidatePath && !path.relative(current.workspace,candidatePath).startsWith('..') ? candidatePath : undefined;
            const selection = selectedPath ? editor.document.getText(editor.selection).slice(0,4000) : payload.selection;
            const history = await readChat();
            const contextData = await buildContext({workspace:current.workspace,question:payload.question,mode:payload.mode,selectedPath,selection,history});
            const brief = await fs.readFile(path.join(current.workspace,'README.md'),'utf8');
            send('assistantProgress',{status:'RUNNING'});
            const answer = await callGroq({apiKey:await credentials.get(),model:model(),system:assistantSystemPrompt,contents:JSON.stringify({challengeInstructions:brief.slice(0,3000),...contextData})});
            const item = {id:crypto.randomUUID(),at:Date.now(),mode:payload.mode,question:payload.question,answer:answer.slice(0,6000),file:contextData.file};
            await atomicWrite(chatFile(current),JSON.stringify([...history,item]));
            send('assistantReply',{item});
          });
        }
      } catch (error) { send('operationError', { code: 'OPERATION_FAILED', message: error.message }); }
    }, null, context.subscriptions);
    try { await renderWebview(panel.webview,context.extensionPath,'index.html'); }
    catch (error) { panel.webview.html = '<html><body><h2>Codebase Detective</h2><p>Build assets are missing. Run npm run build and reopen this panel.</p></body></html>'; vscode.window.showErrorMessage(`Codebase Detective UI unavailable: ${error.message}`); }
  }
  const timer = setInterval(() => { void getState().catch(error => send('operationError', { message: `Timer update failed: ${error.message}` })); }, 1000);
  context.subscriptions.push({ dispose: () => clearInterval(timer) });
}
function deactivate() {}
module.exports = { activate, deactivate };
