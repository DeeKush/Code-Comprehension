import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import './assistant.css';
import './patch.css';

const vscode = acquireVsCodeApi();
const post = (type,payload={}) => vscode.postMessage({type,payload});

function HighlightedCode({code}) {
  return <code>{code.split(/(\b(?:const|let|var|function|return|if|else|await|async|class|throw|new|import|export|from)\b|\b\d+\b|"[^"\n]*"|'[^'\n]*')/g).map((part,i) => <span key={i} className={/^(?:const|let|var|function|return|if|else|await|async|class|throw|new|import|export|from)$/.test(part)?'keyword':/^(?:\d+|"|')/.test(part)?'literal':''}>{part}</span>)}</code>;
}

function Markdown({text}) {
  const blocks=[];
  const pattern=/```([\w+-]*)\n([\s\S]*?)```/g;
  let cursor=0, match;
  while ((match=pattern.exec(text))!==null) {
    if (match.index>cursor) blocks.push({type:'prose',value:text.slice(cursor,match.index)});
    blocks.push({type:'code',language:match[1],value:match[2]});
    cursor=pattern.lastIndex;
  }
  if(cursor<text.length) blocks.push({type:'prose',value:text.slice(cursor)});
  return <div className="markdown">{blocks.map((block,i)=>block.type==='code' ? <div className="codeblock" key={i}><div className="codebar"><span>{block.language||'code'}</span><button onClick={()=>navigator.clipboard.writeText(block.value)}>Copy code</button></div><pre><HighlightedCode code={block.value}/></pre></div> : <div key={i}>{block.value.split(/\r?\n/).map((line,j)=>line.startsWith('### ') ? <h4 key={j}>{line.slice(4)}</h4> : line.startsWith('## ') ? <h3 key={j}>{line.slice(3)}</h3> : /^[-*] /.test(line) ? <div className="listline" key={j}>• {line.slice(2)}</div> : line.trim() ? <p key={j}>{line}</p> : <br key={j}/>)}</div>)}</div>;
}

function App() {
  const [archive,setArchive]=useState(null), [model,setModel]=useState(''), [configured,setConfigured]=useState(false), [workspace,setWorkspace]=useState(null);
  const [draft,setDraft]=useState(''), [busy,setBusy]=useState(false), [error,setError]=useState(''), [notice,setNotice]=useState(''), [labels,setLabels]=useState([]), [models,setModels]=useState([]), [settings,setSettings]=useState(false), [patch,setPatch]=useState(null);
  const bottom=useRef(null);
  useEffect(()=>{
    const receive=event=>{
      const {type,payload}=event.data||{};
      if(!payload || typeof payload!=='object') return;
      if(type==='state') {setArchive(payload.archive);setModel(payload.model);setConfigured(!!payload.configured);setWorkspace(payload.workspace);}
      else if(type==='requestStarted') {setBusy(true);setLabels(payload.labels||[]);setError('');if(payload.kind==='chat')setDraft('');}
      else if(type==='requestFinished') {setBusy(false);setError('');}
      else if(type==='requestFailed') {setBusy(false);setError(payload.message||'Request failed.');}
      else if(type==='operationError') {setBusy(false);setError(payload.message||'Operation failed.');}
      else if(type==='notice') setNotice(payload.message||'');
      else if(type==='models') setModels(payload.models||[]);
      else if(type==='patchProposed') setPatch(payload);
      else if(type==='patchApplied') {setPatch(null);setNotice(payload.message||'Patch applied.');}
      else if(type==='patchRejected') setPatch(null);
    };
    window.addEventListener('message',receive);post('getState');
    return()=>window.removeEventListener('message',receive);
  },[]);
  const active=archive?.conversations.find(item=>item.id===archive.activeId);
  useEffect(()=>bottom.current?.scrollIntoView({block:'end'}),[active?.messages.length,busy]);
  const send=()=>{if(!draft.trim()||busy||!active)return;setBusy(true);post('sendMessage',{chatId:active.id,text:draft.trim()});setError('');};
  return <main className="assistant">
    <header><div><strong>Codebase Detective</strong><small>Groq · {model||'model unavailable'}</small></div><div className="header-actions"><button title="New chat" onClick={()=>post('newChat')}>＋</button><button title="Settings" onClick={()=>setSettings(!settings)}>⚙</button></div></header>
    {settings && <section className="settings"><strong>Settings</strong><p>Groq key: {configured?'configured':'not configured'}</p><div className="row"><button onClick={()=>post('configureGroq')}>{configured?'Replace Groq key':'Configure Groq key'}</button><button onClick={()=>post('removeGroqKey')} disabled={!configured}>Remove key</button></div><div className="row"><button onClick={()=>post('testGroq')} disabled={!configured}>Test connection</button><button onClick={()=>post('refreshModels')} disabled={!configured}>Refresh models</button></div>{models.length>0 && <label>Model<select value={model} onChange={event=>post('setModel',{model:event.target.value})}><option value={model}>{model}</option>{models.filter(item=>item!==model).map(item=><option key={item}>{item}</option>)}</select></label>}<p className="hint">Model listing does not guarantee inference access. Keys stay in VS Code SecretStorage.</p></section>}
    <nav aria-label="Conversations"><select aria-label="Active conversation" value={active?.id||''} onChange={event=>post('selectChat',{chatId:event.target.value})}>{archive?.conversations.map(item=><option key={item.id} value={item.id}>{item.title}</option>)}</select><button onClick={()=>active&&post('clearChat',{chatId:active.id})} disabled={!active?.messages.length}>Clear</button><button onClick={()=>active&&post('deleteChat',{chatId:active.id})} disabled={!active}>Delete</button></nav>
    <div className="workspace"><span>{workspace ? `Workspace: ${workspace}` : 'No workspace folder open'}</span><button onClick={()=>post('openInterviewLab')}>Interview Lab</button></div>
    <section className="transcript" aria-live="polite">
      {!active?.messages.length && <div className="empty"><h2>What are you working on?</h2><p>Ask a question, then attach files or enable targeted workspace context. No repository contents are sent by default.</p>{['Explain the selected function','Help debug this error','Review my current file'].map(prompt=><button key={prompt} onClick={()=>setDraft(prompt)}>{prompt}</button>)}</div>}
      {active?.messages.map(item=><article className={`message ${item.role}`} key={item.id}><div className="message-head"><strong>{item.role==='assistant'?'Assistant':'You'}</strong><span>{item.model||''}</span></div>{item.role==='assistant'?<Markdown text={item.content}/>:<p>{item.content}</p>}{item.context?.length>0 && <small>Context: {item.context.join(', ')}</small>}<button className="copy" onClick={()=>navigator.clipboard.writeText(item.content)}>Copy</button>{item.role==='assistant' && item.content.includes('```') && <button className="copy" onClick={()=>post('insertCode',{chatId:active.id,messageId:item.id})}>Insert code at cursor</button>}</article>)}
      {busy && <p className="working">Groq is responding…</p>}<div ref={bottom}/>
    </section>
    <section className="composer"><div className="context-controls"><button onClick={()=>post('attachCurrentFile')} disabled={!workspace}>+ Current file</button><button onClick={()=>post('attachSelection')} disabled={!workspace}>+ Selection</button><button onClick={()=>post('pickFile')} disabled={!workspace}>+ File</button><button onClick={()=>post('pickFolder')} disabled={!workspace}>+ Folder</button></div><label className="workspace-toggle"><input type="checkbox" checked={!!active?.includeWorkspace} onChange={event=>post('toggleWorkspace',{include:event.target.checked})}/> Include targeted workspace context</label><div className="chips">{active?.attachments?.map((item,index)=><button key={`${item.path}-${index}`} onClick={()=>post('removeAttachment',{index})} title="Remove context">{item.kind==='selection'?`Selection: ${item.path}:${item.start+1}-${item.end+1}`:item.kind==='folder'?`Folder: ${item.path}`:item.path} ×</button>)}</div>{!active?.attachments?.length && !active?.includeWorkspace && <small>No source context attached.</small>}{labels.length>0 && <small>Last request included: {labels.join(', ')}</small>}
      {patch && <div className="patch"><strong>Proposed edit: {patch.summary}</strong>{patch.files.map((item,index)=><button key={item.path} onClick={()=>post('previewPatch',{index})}>{item.reviewed?'✓ ':''}Review {item.path}</button>)}<div className="row"><button onClick={()=>post('applyPatch')} disabled={patch.files.some(item=>!item.reviewed)}>Apply reviewed changes</button><button onClick={()=>post('rejectPatch')}>Reject</button></div></div>}
      {error.includes('Saved conversations') && <button onClick={()=>post('recoverChats')}>Archive unreadable chats and start new</button>}
      <textarea aria-label="Message" placeholder="Ask about your code…" value={draft} maxLength={8000} onChange={event=>setDraft(event.target.value)} onKeyDown={event=>{if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();send();}}}/><div className="composer-actions"><small>Enter to send · Shift+Enter for newline</small>{busy?<button onClick={()=>post('cancelRequest')}>Stop</button>:<div className="row"><button onClick={()=>post('proposePatch',{text:draft.trim()})} disabled={!draft.trim()||!active?.attachments?.some(item=>item.kind==='file')}>Propose edit</button><button onClick={send} disabled={!draft.trim()}>Send</button></div>}</div>{error && <div className="error" role="alert">{error}{active?.messages.at(-1)?.role==='user' && <button onClick={()=>post('retryMessage',{chatId:active.id})}>Retry</button>}</div>}{notice && <p className="notice">{notice}</p>}</section>
  </main>;
}

createRoot(document.getElementById('root')).render(<App/>);
