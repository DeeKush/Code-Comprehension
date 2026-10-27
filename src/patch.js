const crypto = require('node:crypto');
const { z } = require('zod');
const { readContextFile, safeRelative } = require('./workspaceContext');

const patchSchema = {
  type:'object',
  properties:{summary:{type:'string'},changes:{type:'array',items:{type:'object',properties:{path:{type:'string'},replacement:{type:'string'}},required:['path','replacement'],additionalProperties:false}}},
  required:['summary','changes'],additionalProperties:false
};
const response = z.object({summary:z.string().min(1).max(500),changes:z.array(z.object({path:z.string().min(1).max(400),replacement:z.string().min(1).max(30000)}).strict()).min(1).max(3)}).strict();
const digest = text => crypto.createHash('sha256').update(text).digest('hex');

async function preparePatch(root, raw, approvedPaths) {
  const parsed=response.parse(typeof raw==='string'?JSON.parse(raw):raw);
  const allowed=new Set(approvedPaths);
  const seen=new Set(), changes=[];
  for (const item of parsed.changes) {
    const {relative}=safeRelative(root,item.path);
    if (!allowed.has(relative) || seen.has(relative)) throw new Error('Patch targets a file that was not attached or repeats a file.');
    seen.add(relative);
    const original=await readContextFile(root,relative);
    if (original.content===item.replacement) throw new Error('Patch makes no changes.');
    changes.push({path:relative,beforeHash:digest(original.content),replacement:item.replacement,reviewed:false});
  }
  return {id:crypto.randomUUID(),summary:parsed.summary,changes};
}

function assertUnchanged(patchItem, currentText) {
  if (digest(currentText)!==patchItem.beforeHash) throw new Error('The file changed after the proposal. Generate a fresh patch before applying.');
}

function firstCodeBlock(text) {
  const match=/```[\w+-]*\n([\s\S]*?)```/.exec(text);
  if (!match || !match[1].trim() || match[1].length>10000) throw new Error('This response has no insertable code block under 10,000 characters.');
  return match[1];
}

module.exports={patchSchema,preparePatch,assertUnchanged,firstCodeBlock};
