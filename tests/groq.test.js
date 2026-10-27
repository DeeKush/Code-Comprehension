const test = require('node:test');
const assert = require('node:assert/strict');
const { callGroq, createGroqCredentials, listGroqModels, CHAT_URL } = require('../src/groq');
const { responseJsonSchema, assistantSystemPrompt, assessmentSystemPrompt, validateAssessment } = require('../src/ai');
const manifest = require('../package.json');

const success = content => ({ok:true,status:200,json:async()=>({choices:[{finish_reason:'stop',message:{role:'assistant',content}}]})});
const args = {apiKey:'private-key',model:'openai/gpt-oss-120b',system:assistantSystemPrompt,contents:'Explain queue.js'};

test('SecretStorage adapter stores, loads, replaces, and removes only the Groq key', async () => {
  const values=new Map();
  const secrets={get:async key=>values.get(key),store:async(key,value)=>{values.set(key,value);},delete:async key=>{values.delete(key);}};
  const credentials=createGroqCredentials(secrets);
  await assert.rejects(credentials.set('  '),/non-empty/i);
  await credentials.set(' private-key ');
  assert.equal(await credentials.get(),'private-key');
  assert.deepEqual([...values.keys()],['codebaseDetective.groqApiKey']);
  await credentials.set('replacement-key');
  assert.equal(await credentials.get(),'replacement-key');
  await credentials.remove();
  assert.equal(await credentials.get(),undefined);
});

test('connection and text generation use Groq Chat Completions and configured model', async () => {
  assert.equal(manifest.contributes.configuration.properties['codebaseDetective.groqModel'].default,'openai/gpt-oss-120b');
  let url, options;
  const result=await callGroq({...args,fetchImpl:async(u,o)=>{url=u;options=o;return success('OK');}});
  assert.equal(result,'OK');
  assert.equal(url,CHAT_URL);
  assert.equal(options.method,'POST');
  assert.equal(options.headers.Authorization,'Bearer private-key');
  assert.equal(options.headers['Content-Type'],'application/json');
  assert.ok(!url.includes('private-key'));
  const body=JSON.parse(options.body);
  assert.equal(body.model,args.model);
  assert.deepEqual(body.messages.map(item=>item.role),['system','user']);
  assert.equal(body.messages[1].content,args.contents);
  assert.equal(body.stream,false);
  assert.equal(body.response_format,undefined);
});

test('assessment uses documented strict schema and still validates evidence locally', async () => {
  let body;
  const criteria=[['rootCause',20],['comprehension',15],['codeQuality',15],['debugging',10],['aiSupervision',5]]
    .map(([id,points])=>({id,points,rationale:'Evidence supports it',evidenceIds:['answer:rootCause'],confidence:'medium'}));
  const assessment={criteria,strengths:[],improvements:[],exercises:[],summary:'Supported',limitations:[]};
  const answer=await callGroq({...args,system:assessmentSystemPrompt,schema:responseJsonSchema,fetchImpl:async(_url,options)=>{body=JSON.parse(options.body);return success(JSON.stringify(assessment));}});
  assert.equal(body.response_format.type,'json_schema');
  assert.equal(body.response_format.json_schema.strict,true);
  assert.equal(body.response_format.json_schema.schema.additionalProperties,false);
  assert.equal(body.response_format.json_schema.schema.properties.criteria.items.additionalProperties,false);
  assert.equal(validateAssessment(answer,new Set(['answer:rootCause']),35).overallScore,100);
  assert.throws(()=>validateAssessment(answer,new Set(),35),/unknown evidence/i);
});

test('Groq errors distinguish status and preserve only sanitized API detail', async () => {
  for (const [status,expected] of [
    [400,'Invalid request'],[401,'Authentication failed'],[402,'Insufficient credits'],[403,'Access denied'],
    [404,'Model'],[408,'timed out'],[413,'too large'],[429,'Rate limit'],[503,'service error']
  ]) {
    await assert.rejects(callGroq({...args,fetchImpl:async()=>({ok:false,status,json:async()=>({error:{type:'request_error',message:'Safe detail'}})})}),error=>{
      assert.equal(error.httpStatus,status);
      assert.equal(error.apiCode,'request_error');
      assert.ok(error.message.includes(expected));
      assert.ok(error.message.includes('Safe detail'));
      return true;
    });
  }
  await assert.rejects(callGroq({...args,fetchImpl:async()=>({ok:false,status:400,json:async()=>({error:{message:'Bad https://example.test/?key=private-key and private-key'}})})}),error=>{
    assert.ok(!error.message.includes('private-key'));
    assert.ok(!error.message.includes('https://'));
    return true;
  });
});

test('Groq rejects absent key, network and timeout failures, invalid JSON, and empty output', async () => {
  await assert.rejects(callGroq({...args,apiKey:'',fetchImpl:async()=>success('OK')}),/not configured/i);
  await assert.rejects(callGroq({...args,fetchImpl:async()=>{throw Error('secret details');}}),/network/i);
  await assert.rejects(callGroq({...args,fetchImpl:async()=>{const error=Error('abort');error.name='AbortError';throw error;}}),/timed out/i);
  await assert.rejects(callGroq({...args,fetchImpl:async()=>({ok:true,status:200,json:async()=>{throw Error('bad JSON');}})}),/invalid JSON/i);
  await assert.rejects(callGroq({...args,fetchImpl:async()=>success('')}),/empty or malformed/i);
  await assert.rejects(callGroq({...args,fetchImpl:async()=>({ok:true,status:200,json:async()=>({choices:[]})})}),/empty or malformed/i);
  await assert.rejects(callGroq({...args,fetchImpl:async()=>({ok:true,status:200,json:async()=>({choices:[{finish_reason:'length',message:{content:'partial'}}]})})}),/truncated/i);
  await assert.rejects(callGroq({...args,contents:'x'.repeat(120001),fetchImpl:async()=>success('OK')}),/too large/i);
});

test('model-list diagnostic returns bounded IDs without exposing the key', async () => {
  let url,options;
  const models=await listGroqModels({apiKey:'private-key',fetchImpl:async(u,o)=>{url=u;options=o;return {ok:true,status:200,json:async()=>({data:[{id:'openai/gpt-oss-120b',active:true},{id:'old-model',active:false},{id:'bad secret?'}]})};}});
  assert.deepEqual(models,['openai/gpt-oss-120b']);
  assert.equal(url,'https://api.groq.com/openai/v1/models');
  assert.equal(options.headers.Authorization,'Bearer private-key');
  assert.ok(!url.includes('private-key'));
});

test('multi-turn requests preserve roles and cancellation aborts the fetch', async () => {
  let body;
  const messages=[{role:'user',content:'What failed?'},{role:'assistant',content:'The retry order.'},{role:'user',content:'Why?'}];
  await callGroq({...args,messages,fetchImpl:async(_url,options)=>{body=JSON.parse(options.body);return success('Because the delay is skipped.');}});
  assert.deepEqual(body.messages.map(item=>item.role),['system','user','assistant','user']);
  const controller=new AbortController();
  const request=callGroq({...args,signal:controller.signal,fetchImpl:async(_url,options)=>new Promise((_resolve,reject)=>{const stop=()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'}));if(options.signal.aborted) stop();else options.signal.addEventListener('abort',stop);})});
  controller.abort();
  await assert.rejects(request,/cancelled/i);
});
