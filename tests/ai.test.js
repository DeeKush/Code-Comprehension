const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { MODES, buildContext, validateAssessment, assertCanAssess, recoverAssessment, failedAssessment, prepareEvidence, answersSchema } = require('../src/ai');

const criteria = [
  ['rootCause',20],['comprehension',15],['codeQuality',15],['debugging',10],['aiSupervision',5]
].map(([id,points])=>({id,points,rationale:'Supported by evidence',evidenceIds:['answer:rootCause'],confidence:'medium'}));
const sample = {criteria,strengths:['Explained the transition'],improvements:['Add an edge test'],exercises:['Trace another async queue'],summary:'Useful practice',limitations:[]};

test('validates assessment evidence, bounds, and final score', () => {
  const valid = validateAssessment(sample,new Set(['answer:rootCause']),35);
  assert.equal(valid.qualitativePoints,65); assert.equal(valid.overallScore,100);
  assert.throws(()=>validateAssessment(sample,new Set()));
  assert.throws(()=>validateAssessment({...sample,criteria:[{...criteria[0],points:21},...criteria.slice(1)]},new Set(['answer:rootCause']),35));
  assert.throws(()=>validateAssessment('{bad',new Set(['answer:rootCause']),35));
  assert.throws(()=>validateAssessment({...sample,criteria:[criteria[0],criteria[0],...criteria.slice(2)]},new Set(['answer:rootCause']),35));
  assert.throws(()=>validateAssessment(sample,new Set(),35));
});

test('missing explanations create no invented answer evidence', () => {
  const answers=answersSchema.parse({rootCause:'',implementation:'',verification:'',aiSupervision:''});
  const evidence=prepareEvidence({answers,baseline:{'queue.js':'old'},finalFiles:{'queue.js':'new'},finalRun:{tests:[]}});
  assert.ok(evidence.some(e=>e.id==='diff:queue.js'));
  assert.ok(!evidence.some(e=>e.kind==='answer'));
});

test('all four assistant modes build bounded source context and reject traversal', async () => {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'detective-ai-'));
  try {
    await fs.writeFile(path.join(root,'queue.js'),'module.exports = 1;');
    for (const mode of MODES) {
      const result=await buildContext({workspace:root,mode,question:'What happens?',history:[]});
      assert.equal(result.mode,mode);
      assert.equal(result.file,'queue.js');
    }
    await assert.rejects(buildContext({workspace:root,mode:'explain',question:'x',selectedPath:'../outside.js'}));
    await assert.rejects(buildContext({workspace:root,mode:'explain',question:'x'.repeat(2001)}));
  } finally { await fs.rm(root,{recursive:true,force:true}); }
});

test('provider failure keeps objective score and snapshot without inventing a report', () => {
  const record={status:'COMPLETED',objectiveScore:23,qualitativeStatus:'RUNNING',snapshot:'same-snapshot',reportVersion:0};
  const failed=failedAssessment(record);
  assert.equal(failed.qualitativeStatus,'FAILED');
  assert.equal(failed.objectiveScore,23);
  assert.equal(failed.snapshot,'same-snapshot');
  assert.equal(failed.reportVersion,0);
  assert.doesNotThrow(()=>assertCanAssess(failed));
  const interrupted=recoverAssessment(record);
  assert.equal(interrupted.qualitativeStatus,'FAILED');
  assert.equal(interrupted.snapshot,'same-snapshot');
  assert.throws(()=>assertCanAssess({...failed,qualitativeStatus:'COMPLETE'}));
  assert.throws(()=>assertCanAssess({...failed,status:'RUNNING'}));
});
