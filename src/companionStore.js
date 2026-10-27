const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { z } = require('zod');
const { atomicWrite } = require('./sessionStorage');

const message = z.object({ id:z.string().uuid(), role:z.enum(['user','assistant']), content:z.string().min(1).max(30000), at:z.number().int().positive(), model:z.string().max(100).optional(), context:z.array(z.string().max(180)).max(12).optional() }).strict();
const attachment = z.object({kind:z.enum(['file','selection','folder']),path:z.string().min(1).max(400),start:z.number().int().nonnegative().optional(),end:z.number().int().nonnegative().optional()}).strict();
const conversation = z.object({ id:z.string().uuid(), title:z.string().min(1).max(100), createdAt:z.number().int().positive(), updatedAt:z.number().int().positive(), messages:z.array(message).max(200), attachments:z.array(attachment).max(8).default([]), includeWorkspace:z.boolean().default(false) }).strict();
const archive = z.object({ version:z.literal(1), conversations:z.array(conversation).max(30), activeId:z.string().uuid().nullable() }).strict();
const empty = () => ({ version:1, conversations:[], activeId:null });

function storagePath(storageRoot, workspaceKey) {
  const hash = crypto.createHash('sha256').update(workspaceKey || 'no-workspace').digest('hex').slice(0,24);
  return path.join(storageRoot, 'chats', hash, 'conversations.json');
}

async function readChats(file) {
  let raw;
  try { raw=await fs.readFile(file,'utf8'); }
  catch (error) { if (error.code === 'ENOENT') return empty(); throw error; }
  try { return archive.parse(JSON.parse(raw)); }
  catch { const error=new Error('Saved conversations could not be loaded. Archive the damaged file to start a new chat without deleting it.'); error.code='CHAT_CORRUPT'; throw error; }
}

async function archiveCorruptChats(file) {
  try { await readChats(file); throw new Error('The conversation file is not corrupt.'); }
  catch(error) { if(error.code!=='CHAT_CORRUPT') throw error; }
  const backup=`${file}.corrupt-${Date.now()}`;
  await fs.rename(file,backup);
  const fresh=startChat(empty());
  await writeChats(file,fresh);
  return fresh;
}

async function writeChats(file, data) {
  const checked = archive.parse(data);
  await fs.mkdir(path.dirname(file), { recursive:true });
  await atomicWrite(file, JSON.stringify(checked));
  return checked;
}

function startChat(data, now = Date.now()) {
  if (data.conversations.length>=30) throw new Error('Chat limit reached. Delete an old conversation before starting another.');
  const item = { id:crypto.randomUUID(), title:'New chat', createdAt:now, updatedAt:now, messages:[], attachments:[], includeWorkspace:false };
  return { ...data, activeId:item.id, conversations:[item, ...data.conversations] };
}

function addUserMessage(data, chatId, content, context = [], now = Date.now()) {
  if (typeof content !== 'string' || !content.trim() || content.length > 8000) throw new Error('Enter a message under 8,000 characters.');
  const existing=data.conversations.find(item => item.id === chatId);
  if (!existing) throw new Error('Chat not found.');
  if (existing.messages.length>=199) throw new Error('This chat is full. Start a new chat to preserve its history.');
  const user = message.parse({id:crypto.randomUUID(),role:'user',content:content.trim(),at:now,context});
  return { data:{ ...data, activeId:chatId, conversations:data.conversations.map(item => item.id === chatId ? { ...item, title:item.messages.length ? item.title : content.trim().slice(0,80), updatedAt:now, messages:[...item.messages,user] } : item) }, user };
}

function addAssistantMessage(data, chatId, content, model, now = Date.now()) {
  const reply = message.parse({id:crypto.randomUUID(),role:'assistant',content,at:now,model});
  return { data:{ ...data, conversations:data.conversations.map(item => item.id === chatId ? { ...item, updatedAt:now, messages:[...item.messages,reply] } : item) }, reply };
}

function deleteChat(data, chatId) {
  if(!data.conversations.some(item=>item.id===chatId)) throw new Error('Chat not found.');
  const conversations=data.conversations.filter(item=>item.id!==chatId);
  return { ...data, conversations, activeId:conversations[0]?.id||null };
}

function clearChat(data, chatId) {
  if (!data.conversations.some(item => item.id === chatId)) throw new Error('Chat not found.');
  return { ...data, conversations:data.conversations.map(item => item.id === chatId ? { ...item, title:'New chat', messages:[], updatedAt:Date.now() } : item) };
}

function historyFor(data, chatId) {
  const chat = data.conversations.find(item => item.id === chatId);
  if (!chat) throw new Error('Chat not found.');
  return chat.messages.slice(-12).map(({role,content}) => ({role,content:content.slice(0,5000)}));
}

module.exports = { storagePath, readChats, archiveCorruptChats, writeChats, startChat, addUserMessage, addAssistantMessage, clearChat, deleteChat, historyFor };
