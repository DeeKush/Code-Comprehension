const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const crypto=require('node:crypto');
const { storagePath,readChats,archiveCorruptChats,writeChats,startChat,addUserMessage,addAssistantMessage,clearChat,deleteChat,historyFor }=require('../src/companionStore');
const { safeRelative,readContextFile,boundedHistory }=require('../src/workspaceContext');
const { preparePatch,assertUnchanged,firstCodeBlock }=require('../src/patch');
const { incoming }=require('../src/companionContracts');
const { isSessionWorkspace }=require('../src/sessionStorage');

async function temporary(t) { const root=await fs.mkdtemp(path.join(os.tmpdir(),'codebase-companion-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root; }

test('chat survives restart with multi-turn history and remains separate from interview sessions',async t=>{
  const root=await temporary(t), file=storagePath(root,'workspace-A');
  let data=startChat(await readChats(file)), id=data.activeId;
  data=addUserMessage(data,id,'Why does this retry fail?',['queue.js']).data;
  data=addAssistantMessage(data,id,'The queue retries too early.','openai/gpt-oss-120b').data;
  data=addUserMessage(data,id,'What test would confirm it?').data;
  await writeChats(file,data);
  const reopened=await readChats(file);
  assert.deepEqual(historyFor(reopened,id).map(item=>item.role),['user','assistant','user']);
  assert.equal(reopened.conversations[0].messages[0].context[0],'queue.js');
  assert.equal(file.startsWith(path.join(root,'chats')),true);
  assert.equal(await fs.stat(path.dirname(file)).then(()=>true),true);
  const cleared=clearChat(reopened,id);
  assert.equal(cleared.conversations[0].messages.length,0);
  assert.equal((await readChats(file)).conversations[0].messages.length,3);
  assert.equal(deleteChat(reopened,id).conversations.length,0);
});

test('corrupt chat data reports an error rather than overwriting it',async t=>{
  const root=await temporary(t),file=storagePath(root,'workspace-B');
  await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,'{broken');
  await assert.rejects(readChats(file),/could not be loaded/i);
  assert.equal(await fs.readFile(file,'utf8'),'{broken');
  const recovered=await archiveCorruptChats(file);
  assert.equal(recovered.conversations.length,1);
  assert.equal((await fs.readdir(path.dirname(file))).some(name=>name.includes('.corrupt-')),true);
});

test('workspace context bounds files and rejects traversal, secrets and generated folders',async t=>{
  const root=await temporary(t);
  await fs.writeFile(path.join(root,'queue.js'),'line one\nline two');
  await fs.writeFile(path.join(root,'.env'),'private');
  await fs.writeFile(path.join(root,'large.js'),'x'.repeat(200));
  assert.equal((await readContextFile(root,'queue.js')).content,'line one\nline two');
  assert.throws(()=>safeRelative(root,'../outside.js'));
  assert.throws(()=>safeRelative(root,'.env'));
  assert.throws(()=>safeRelative(root,'node_modules/pkg.js'));
  await assert.rejects(readContextFile(root,'large.js',100),/too large/i);
  assert.equal(boundedHistory(Array.from({length:20},(_,i)=>({role:'user',content:String(i)}))).length,12);
});

test('reviewable patches require approved paths and unchanged source',async t=>{
  const root=await temporary(t);
  await fs.writeFile(path.join(root,'queue.js'),'const count = 1;\n');
  const patch=await preparePatch(root,{summary:'Update count',changes:[{path:'queue.js',replacement:'const count = 2;\n'}]},['queue.js']);
  assert.equal(patch.changes[0].reviewed,false);
  assert.doesNotThrow(()=>assertUnchanged(patch.changes[0],'const count = 1;\n'));
  assert.throws(()=>assertUnchanged(patch.changes[0],'const count = 9;\n'),/changed/i);
  await assert.rejects(preparePatch(root,{summary:'Unsafe',changes:[{path:'../outside.js',replacement:'x'}]},['queue.js']));
  await assert.rejects(preparePatch(root,{summary:'Unapproved',changes:[{path:'queue.js',replacement:'x'}]},[]));
});

test('assistant boundary rejects unknown actions, keys and malformed patch commands',()=>{
  const id=crypto.randomUUID();
  assert.equal(incoming.safeParse({type:'sendMessage',payload:{chatId:id,text:'Hello'}}).success,true);
  assert.equal(incoming.safeParse({type:'sendMessage',payload:{chatId:id,text:'Hello',apiKey:'secret'}}).success,false);
  assert.equal(incoming.safeParse({type:'executeShell',payload:{command:'dir'}}).success,false);
  assert.equal(incoming.safeParse({type:'applyPatch',payload:{path:'../outside'}}).success,false);
  assert.equal(incoming.safeParse({type:'insertCode',payload:{chatId:id,messageId:crypto.randomUUID()}}).success,true);
  assert.equal(firstCodeBlock('Try this:\n```js\nconst x = 1;\n```'),'const x = 1;\n');
  assert.throws(()=>firstCodeBlock('No code here'),/no insertable/i);
});

test('second extension host restores only the matching interview workspace',()=>{
  const record={workspace:path.join(os.tmpdir(),'codebase-session','workspace')};
  assert.equal(isSessionWorkspace(record,[record.workspace]),true);
  assert.equal(isSessionWorkspace(record,[path.join(os.tmpdir(),'another-project')]),false);
  assert.equal(isSessionWorkspace(record,[]),false);
});
