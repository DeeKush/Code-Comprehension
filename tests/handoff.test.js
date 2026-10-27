const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const Module=require('node:module');

test('Start Interview opens a new native workspace and a second host restores the same deadline',async t=>{
  const temporary=await fs.mkdtemp(path.join(os.tmpdir(),'codebase-handoff-test-'));
  t.after(()=>fs.rm(temporary,{recursive:true,force:true}));
  const commands=new Map(),panels=[],opened=[],shown=[],views=[],diffs=[];
  const vscode={
    EventEmitter:class {constructor(){this.event=()=>({dispose(){}});}fire(){}},
    TreeItem:class {constructor(uri,state){this.uri=uri;this.collapsibleState=state;}},
    TreeItemCollapsibleState:{Collapsed:1,None:0},
    Uri:{file:fsPath=>({scheme:'file',fsPath,toString:()=>`file:${fsPath}`}),parse:value=>({toString:()=>value})},
    ViewColumn:{Beside:2},
    workspace:{workspaceFolders:[],getConfiguration:()=>({get:(_key,fallback)=>fallback}),registerTextDocumentContentProvider:()=>({dispose(){}})},
    languages:{getDiagnostics:()=>[]},
    WorkspaceEdit:class {constructor(){this.replacements=[];}replace(uri,_range,text){this.replacements.push({uri,text});}},
    Range:class {constructor(start,end){this.start=start;this.end=end;}},
    commands:{registerCommand:(id,callback)=>{commands.set(id,callback);return {dispose(){}};},executeCommand:async(id,...args)=>{if(id==='vscode.openFolder')opened.push(args);if(id==='vscode.diff')diffs.push(args);}},
    window:{registerTreeDataProvider:()=>({dispose(){}}),registerWebviewViewProvider:(_id,provider)=>{views.push(provider);return {dispose(){}};},showTextDocument:async(uri)=>{shown.push(uri.fsPath);},showWarningMessage:()=>{},showErrorMessage:()=>{},createWebviewPanel:()=>{const messages=[];const webview={cspSource:'mock:',asWebviewUri:uri=>({toString:()=>`mock:${uri.fsPath}`}),postMessage:message=>{messages.push(message);},onDidReceiveMessage(fn){this.receive=fn;return {dispose(){}};}};const panel={webview,messages,reveal(){},onDidDispose:()=>({dispose(){}})};panels.push(panel);return panel;}}
  };
  const originalLoad=Module._load;
  Module._load=function(request,parent,isMain){if(request==='vscode')return vscode;return originalLoad.call(this,request,parent,isMain);};
  let extension;
  try { extension=require('../src/extension'); }
  finally { Module._load=originalLoad; }
  const storageRoot=path.join(temporary,'globalStorage');
  const context=()=>({extensionPath:path.resolve(__dirname,'..'),globalStorageUri:{fsPath:storageRoot},secrets:{get:async()=>undefined},subscriptions:[]});
  const first=context();t.after(()=>first.subscriptions.forEach(item=>item.dispose?.()));
  await extension.activate(first);
  const assistantMessages=[];
  const assistantWebview={cspSource:'mock:',asWebviewUri:uri=>({toString:()=>`mock:${uri.fsPath}`}),postMessage:message=>assistantMessages.push(message),onDidReceiveMessage(fn){this.receive=fn;return {dispose(){}};}};
  await views[0].resolveWebviewView({webview:assistantWebview,onDidDispose:()=>({dispose(){}})});
  assert.match(assistantWebview.html,/assistant-/);
  await assistantWebview.receive({type:'getState',payload:{}});
  const assistantState=assistantMessages.find(message=>message.type==='state').payload;
  assert.equal(assistantState.provider,'Groq');
  await assistantWebview.receive({type:'sendMessage',payload:{chatId:assistantState.archive.activeId,text:'Explain this project'}});
  assert.equal(assistantMessages.at(-1).type,'requestFailed');
  const savedChat=assistantMessages.filter(message=>message.type==='state').at(-1).payload.archive.conversations[0];
  assert.deepEqual(savedChat.messages.map(message=>message.role),['user']);
  const project=path.join(temporary,'project');await fs.mkdir(project);
  const projectFile=path.join(project,'queue.js');let sourceText='const count = 1;\n';await fs.writeFile(projectFile,sourceText);
  vscode.workspace.workspaceFolders=[{uri:vscode.Uri.file(project)}];
  const document={uri:vscode.Uri.file(projectFile),languageId:'javascript',getText:()=>sourceText,isDirty:false,positionAt:index=>({line:0,character:index})};
  vscode.window.activeTextEditor={document,selection:{isEmpty:true,start:{line:0},end:{line:0},active:{line:0,character:0}}};
  vscode.workspace.openTextDocument=async()=>document;
  vscode.workspace.applyEdit=async edit=>{for(const item of edit.replacements){sourceText=item.text;await fs.writeFile(item.uri.fsPath,item.text);}return true;};
  await assistantWebview.receive({type:'getState',payload:{}});
  await assistantWebview.receive({type:'attachCurrentFile',payload:{}});
  assert.equal(assistantMessages.at(-1).type,'state',assistantMessages.at(-1).payload.message);
  assert.equal(assistantMessages.at(-1).payload.archive.conversations[0].attachments.length,1);
  const originalFetch=globalThis.fetch;
  globalThis.fetch=async()=>({ok:true,status:200,json:async()=>({choices:[{finish_reason:'stop',message:{content:JSON.stringify({summary:'Update count',changes:[{path:'queue.js',replacement:'const count = 2;\n'}]})}}]})});
  t.after(()=>{globalThis.fetch=originalFetch;});
  first.secrets.get=async()=> 'mock-key';
  await assistantWebview.receive({type:'proposePatch',payload:{text:'Change count to two'}});
  assert.equal(assistantMessages.at(-1).type,'requestFinished',assistantMessages.at(-1).payload.message);
  await assistantWebview.receive({type:'applyPatch',payload:{}});
  assert.match(assistantMessages.at(-1).payload.message,/Preview every/i);
  await assistantWebview.receive({type:'previewPatch',payload:{index:0}});
  assert.equal(diffs.length,1);
  await assistantWebview.receive({type:'rejectPatch',payload:{}});
  assert.equal(sourceText,'const count = 1;\n');
  await assistantWebview.receive({type:'proposePatch',payload:{text:'Change count to two'}});
  await assistantWebview.receive({type:'previewPatch',payload:{index:0}});
  await assistantWebview.receive({type:'applyPatch',payload:{}});
  assert.equal(sourceText,'const count = 2;\n');
  vscode.workspace.workspaceFolders=[];
  vscode.window.activeTextEditor=null;
  await commands.get('codebaseDetective.openInterviewLab')();
  await panels.at(-1).webview.receive({type:'startInterview',payload:{challengeId:'retry-queue-v1'}});
  assert.equal(opened.length,1);
  assert.equal(opened[0][1].forceNewWindow,true);
  const workspace=opened[0][0].fsPath;
  assert.equal((await fs.stat(path.join(workspace,'queue.js'))).isFile(),true);
  const pointer=JSON.parse(await fs.readFile(path.join(storageRoot,'current-session.json'),'utf8'));
  const record=JSON.parse(await fs.readFile(path.join(storageRoot,'sessions',pointer.id,'session.json'),'utf8'));
  assert.equal(record.workspace,workspace);
  assert.equal(record.deadlineAt-record.startedAt,3600000);
  vscode.workspace.workspaceFolders=[{uri:vscode.Uri.file(workspace)}];
  const second=context();t.after(()=>second.subscriptions.forEach(item=>item.dispose?.()));
  await extension.activate(second);
  await new Promise(resolve=>setTimeout(resolve,30));
  assert.ok(shown.includes(path.join(workspace,'queue.js')));
  await commands.get('codebaseDetective.openInterviewLab')();
  await panels.at(-1).webview.receive({type:'getInitialState',payload:{}});
  const initial=panels.at(-1).messages.find(message=>message.type==='initialState');
  assert.equal(initial.payload.session.id,record.id);
  assert.equal(initial.payload.session.deadlineAt,record.deadlineAt);
  await panels.at(-1).webview.receive({type:'startInterview',payload:{challengeId:'retry-queue-v1'}});
  assert.equal((await fs.readdir(path.join(storageRoot,'sessions'))).filter(name=>/^[a-f0-9-]{36}$/i.test(name)).length,1);
});
