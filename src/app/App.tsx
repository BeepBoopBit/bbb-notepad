import { desktop } from '../platform/environment';
import React, { useEffect, useLayoutEffect, useRef, useState, lazy, Suspense } from 'react';
import { flushSync } from 'react-dom';
import { storage, title, snippet, type Note, type Session } from '../notes/storage';
import './style.css';
import { createNoteId } from '../notes/id';
import { WindowControls } from './WindowControls';
import { UpdateDialog } from '../updates/UpdateDialog';
import { updates } from '../updates/updates';
import { Icon } from '../ui/icons';
import { Settings,SettingsMenu } from '../settings/Settings';
import { savedTheme,savedZoom,persistPreference,clampZoom,type Theme } from '../settings/preferences';
import { decodeFile,openDesktopFile,saveTextFile,fileName,MAX_FILE_BYTES,type OpenedFile } from '../files/files';
import { FileMenu } from '../files/FileMenu';
import { ViewMenu } from '../files/ViewMenu';
import { plainBlockBreak } from '../editor/plain-block-break';
import type { EditorPosition, NoteEditorHandle } from '../editor/editor-types';
import { pairCompletion,pairSuggestions,completePair,pairExit, searchMatch,parsePairs,nextFence,type Fence } from '../notes/pairs';

let loadedMarkdownEditor:typeof import('../editor/MarkdownEditor').default|undefined;
async function loadMarkdownEditor(){const module=await import('../editor/MarkdownEditor');loadedMarkdownEditor=module.default;return module;}
const MarkdownEditor = lazy(loadMarkdownEditor);
function savedRenderPreference() {
  try { return localStorage.getItem('bbb-notes-render-markdown') === 'true'; } catch { return false; }
}

document.documentElement.dataset.theme=savedTheme();
type FileInfo=Omit<OpenedFile,'content'>;
function savedFileInfo():Record<string,FileInfo>{try{return JSON.parse(localStorage.getItem('bbb-notes-file-info-v1') || '{}');}catch{return {};}}
const blank = (): Note => ({ id: createNoteId(), content: '', updated: Date.now() });
export default function App() {
  const [data, setData] = useState<Session>({ notes: [], tabs: [], active: null });
  const current = useRef(data);
  const loaded = useRef(false);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState('Loading…');
  const [error, setError] = useState('');
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Note[]>([]);
  const [selected, setSelected] = useState(0);
  const editor = useRef<HTMLTextAreaElement>(null);
  const markdownEditor = useRef<NoteEditorHandle>(null);
  const [renderMarkdown, setRenderMarkdown] = useState(savedRenderPreference);
  const [wordWrap,setWordWrap]=useState(()=>{try{return localStorage.getItem('bbb-notes-word-wrap')!=='false';}catch{return true;}});
  const [richEnabled, setRichEnabled] = useState(renderMarkdown);
  const [richComponent,setRichComponent]=useState(()=>loadedMarkdownEditor);
  const pendingCommand=useRef<'collapse'|'expand'|undefined>(undefined);
  const pendingMatch = useRef<string | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const dirty = useRef(new Map<string, Note>());
  const queue = useRef<Promise<void>>(Promise.resolve());
  const searchVersion = useRef(0);
  const positions = useRef(new Map<string, EditorPosition>());
  const [theme,setTheme]=useState<Theme>(savedTheme);
  const [zoom,setZoom]=useState(savedZoom);const zoomRef=useRef(zoom);zoomRef.current=zoom;
  const [settingsOpen,setSettingsOpen]=useState(false);
  const [updateOpen,setUpdateOpen]=useState(false);const updateOpenRef=useRef(false);updateOpenRef.current=updateOpen;
  const [installing,setInstalling]=useState(false);const installationLock=useRef(false);
  const [fileInfo,setFileInfo]=useState(savedFileInfo);
  const [fileBusy,setFileBusy]=useState(false);const fileLock=useRef(false);
  const [fileError,setFileError]=useState('');
  const [fileStatus,setFileStatus]=useState('');
  const [exportDialog,setExportDialog]=useState<{id:string;content:string;name:string}|null>(null);
  const fileInput=useRef<HTMLInputElement>(null);
  const toolbar=useRef<HTMLDivElement>(null);
  const active = data.notes.find(n => n.id === data.active);

  useLayoutEffect(()=>{document.documentElement.dataset.theme=theme;persistPreference('theme',theme);},[theme]);
  useLayoutEffect(()=>{
    document.documentElement.style.setProperty('--editor-font-size',`${14*zoom/100}px`);
    document.documentElement.style.setProperty('--editor-line-height',`${25*zoom/100}px`);
    persistPreference('zoom',String(zoom));
  },[zoom]);
  useEffect(()=>{try{localStorage.setItem('bbb-notes-file-info-v1',JSON.stringify(fileInfo));}catch{ /* File labels remain available in this session. */ }},[fileInfo]);
  useEffect(()=>{
    const wheel=(event:WheelEvent)=>{if(!event.ctrlKey && !event.metaKey)return;event.preventDefault();if(event.deltaY)setZoom(value=>clampZoom(value+(event.deltaY<0 ? 10 : -10)));};
    window.addEventListener('wheel',wheel,{passive:false});return()=>window.removeEventListener('wheel',wheel);
  },[]);
  function imported(file:OpenedFile) {
    const note={...blank(),content:file.content};dirty.current.set(note.id,note);
    const {content:_,...info}=file;setFileInfo(value=>({...value,[note.id]:info}));
    setFileError('');setFileStatus('');open(note);
    if(file.unsupported){setRenderMarkdown(false);persistPreference('render-markdown','false');}
  }
  async function openFile() {
    if(fileLock.current)return;
    setFileError('');setFileStatus('');
    if(!desktop){fileInput.current?.click();return;}
    fileLock.current=true;setFileBusy(true);
    try{const file=await openDesktopFile();if(file)imported(file);}catch(error){setFileError(`Could not open file: ${String(error)}`);}finally{fileLock.current=false;setFileBusy(false);}
  }
  async function browserFile(file:File|undefined) {
    if(!file)return;fileLock.current=true;setFileBusy(true);
    try{if(file.size>MAX_FILE_BYTES)throw new Error('File is too large to open (maximum 16 MiB).');imported(decodeFile(file.name,new Uint8Array(await file.arrayBuffer())));}catch(error){setFileError(`Could not open file: ${String(error)}`);}finally{fileLock.current=false;setFileBusy(false);if(fileInput.current)fileInput.current.value='';}
  }
  async function exportFile(id:string,content:string,name:string) {
    fileLock.current=true;setFileBusy(true);setFileError('');setFileStatus('');
    try{const saved=await saveTextFile(content,fileName(name));if(saved){setFileStatus(`Saved ${saved}`);setFileInfo(value=>({...value,[id]:{name:saved,encoding:'UTF-8',unsupported:value[id]?.unsupported || false,truncated:value[id]?.truncated || false}}));}}catch(error){setFileError(`Could not save file: ${String(error)}`);}finally{fileLock.current=false;setFileBusy(false);}
  }
  const fileActions=useRef({openFile,saveAs:()=>{}});
  async function saveAs() {
    if(fileLock.current)return;
    const note=current.current.notes.find(note=>note.id===current.current.active);if(!note)return;
    const suggested=fileInfo[note.id]?.name || fileName(title(note))+'.txt';
    if(desktop)await exportFile(note.id,note.content,suggested);else setExportDialog({id:note.id,content:note.content,name:suggested});
  }
  fileActions.current={openFile,saveAs};
  async function beforeInstall(){
    installationLock.current=true;setInstalling(true);
    try{await flush();await updates.backup();}catch(error){installationLock.current=false;setInstalling(false);throw error;}
  }
  function installFailed(){installationLock.current=false;setInstalling(false);}
  function closeUpdates(){setUpdateOpen(false);requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('.settings-button')?.focus());}
  function closeSettings(){setSettingsOpen(false);requestAnimationFrame(()=>document.querySelector<HTMLButtonElement>('.settings-button')?.focus());}
  useEffect(()=>{
    if(richEnabled || !active)return;
    const element=editor.current;
    if(parsePairs(active.content).length || (element && pairSuggestions(element.value,element.selectionStart,element.selectionEnd))) {
      let cancelled=false;
      void loadMarkdownEditor().then(module=>{if(cancelled)return;remember();setRichComponent(()=>module.default);setRichEnabled(true);});
      return()=>{cancelled=true;};
    }
  },[active?.id,active?.content,richEnabled]);
  function update(next: Session) { current.current = next; setData(next); }
  function flush() {
    clearTimeout(timer.current);
    // Serialize writes; retain dirty notes until their exact revision is acknowledged.
    queue.current = queue.current.catch(() => {}).then(async () => {
      const snapshot = current.current;
      for (const note of [...dirty.current.values()]) {
        await storage.saveNote(note);
        if (dirty.current.get(note.id) === note) dirty.current.delete(note.id);
      }
      await storage.saveSession(snapshot.tabs, snapshot.active);
      if (!dirty.current.size) { setStatus('All changes saved'); setError(''); }
    }).catch(e => { setStatus('Not saved'); setError(`Could not save your notes: ${String(e)}`); throw e; });
    return queue.current;
  }
  function schedule() {
    setStatus('Saving…'); clearTimeout(timer.current);
    timer.current = setTimeout(() => { void flush().catch(() => {}); }, 200);
  }
  function remember() {
    pendingCommand.current=undefined;
    if (markdownEditor.current && current.current.active) {
      positions.current.set(current.current.active, markdownEditor.current.getPosition());
      return;
    }
    const el = editor.current;
    if (el && current.current.active) positions.current.set(current.current.active, {start:el.selectionStart,end:el.selectionEnd,scroll:el.scrollTop});
  }
  function focus(id: string, match?: string) {
    requestAnimationFrame(() => {
      if (markdownEditor.current) { markdownEditor.current.focus(positions.current.get(id), match); return; }
      const el = editor.current; if (!el) return;
      el.focus();
      const position = positions.current.get(id);
      const index = match ? el.value.toLowerCase().indexOf(match.toLowerCase()) : -1;
      if (index >= 0) { el.setSelectionRange(index,index+match!.length); const lines = el.value.slice(0,index).split('\n').length; el.scrollTop = Math.max(0,(lines-4)*25*zoomRef.current/100); }
      else if (position) { el.setSelectionRange(position.start,position.end); el.scrollTop = position.scroll; }
    });
  }
  function open(note: Note, match?: string) {
    remember(); pendingMatch.current = match; const s = current.current;
    update({notes:s.notes.some(n => n.id === note.id) ? s.notes : [...s.notes,note], tabs:s.tabs.includes(note.id) ? s.tabs : [...s.tabs,note.id], active:note.id});
    setSearching(false); schedule(); focus(note.id,match);
  }
  function create() { const note = blank(); dirty.current.set(note.id,note); open(note); }
  function close(id: string) {
    remember(); const s = current.current; const tabs = s.tabs.filter(t => t !== id);
    if (!tabs.length) {
      const note = blank(); dirty.current.set(note.id,note);
      update({notes:[...s.notes,note],tabs:[note.id],active:note.id}); focus(note.id);
    } else {
      const active = s.active === id ? tabs[Math.min(s.tabs.indexOf(id),tabs.length-1)] : s.active;
      update({...s,tabs,active}); if (active) focus(active);
    }
    schedule();
  }
  useEffect(() => {
    storage.load().then(s => {
      if (!s.tabs.length) { const note = blank(); s = {notes:[note],tabs:[note.id],active:note.id}; dirty.current.set(note.id,note); }
      update(s); loaded.current = true; setReady(true); setStatus('All changes saved');
      if (dirty.current.size) schedule();
      if (s.active) focus(s.active);
    }).catch(e => { setStatus('Unable to open notes'); setError(String(e)); });
    let dispose: (() => void) | undefined;
    let disposed = false;
    if (desktop) void import('@tauri-apps/api/window').then(async ({getCurrentWindow}) => {
      const window = getCurrentWindow();
      const unlisten = await window.onCloseRequested(async event => {
        event.preventDefault();
        if(installationLock.current)return;
        try { if (loaded.current) await flush(); await window.destroy(); } catch { /* Keep the window and unsaved text available. */ }
      });
      if (disposed) unlisten(); else dispose = unlisten;
    }).catch(e => setError(`Unable to protect window closure: ${String(e)}`));
    const unload = (event: BeforeUnloadEvent) => {
      if (dirty.current.size) { void flush().catch(() => {}); event.preventDefault(); }
    };
    window.addEventListener('beforeunload',unload);
    return () => { disposed = true; dispose?.(); window.removeEventListener('beforeunload',unload); };
  }, []);
  useEffect(() => {
    if (!searching) return;
    const version = ++searchVersion.current;
    const timer = setTimeout(async () => {
      try {
        await flush();
        const found = await storage.search(query);
        if (version === searchVersion.current) { setResults(found); setSelected(0); }
      } catch (e) { if (version === searchVersion.current) setError(`Could not search notes: ${String(e)}`); }
    },120);
    return () => { clearTimeout(timer); searchVersion.current++; };
  },[query,searching,data]);
  useEffect(() => {
    function key(event: KeyboardEvent) {
      if (!ready) return;
      if(installationLock.current){event.preventDefault();event.stopImmediatePropagation();return;}
      const mod = event.ctrlKey || event.metaKey;
      if(updateOpenRef.current && mod && ['n','t','o','s','w','k','tab'].includes(event.key.toLowerCase())){event.preventDefault();event.stopImmediatePropagation();return;}
      if(mod && !event.altKey && ['n','t','o','s','0','k','w'].includes(event.key.toLowerCase()))event.stopPropagation();
      if (mod && !event.altKey && ['n','t'].includes(event.key.toLowerCase())) { event.preventDefault(); create(); }
      if(mod && event.key.toLowerCase()==='o'){event.preventDefault();void fileActions.current.openFile();}
      if(mod && event.key.toLowerCase()==='s'){
        event.preventDefault();
        if(event.shiftKey)void flush().catch(()=>{});
        else void fileActions.current.saveAs();
      }
      if(mod && event.key==='0'){event.preventDefault();setZoom(100);}
      if (mod && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearching(v => !v); }
      if (mod && event.key.toLowerCase() === 'w' && current.current.active) { event.preventDefault(); close(current.current.active); }
      if (event.ctrlKey && event.key === 'Tab') {
        event.preventDefault(); const s = current.current; const i = s.tabs.indexOf(s.active!);
        const id = s.tabs[(i+(event.shiftKey ? -1 : 1)+s.tabs.length)%s.tabs.length];
        const note = s.notes.find(n => n.id === id); if (note) open(note);
      }
      if (event.key === 'Escape' && !(event.target as Element).closest('.settings-panel,.settings-menu-root,.file-menu-root,.slash-menu,.cm-editor')) { setSearching(false); if (current.current.active) focus(current.current.active); }
    }
    window.addEventListener('keydown',key,true); return () => window.removeEventListener('keydown',key,true);
  },[ready]);
  function editContent(content: string) {
    if(installationLock.current)return;
    const s = current.current;
    const active = s.notes.find(note => note.id === s.active); if (!active) return;
    const note = {...active, content, updated:Date.now()}; dirty.current.set(note.id, note);
    update({...s, notes:s.notes.map(item => item.id === note.id ? note : item)}); schedule();
  }
  function toggleMarkdown() {
    remember(); pendingMatch.current = undefined;
    const next = !renderMarkdown;
    setRenderMarkdown(next); if (next) setRichEnabled(true);
    try { localStorage.setItem('bbb-notes-render-markdown', String(next)); } catch { /* The session toggle still works. */ }
  }
  function completePlainPair(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.nativeEvent.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    const element = event.currentTarget;
    const suggestions=event.key==='Enter' && !event.shiftKey ? pairSuggestions(element.value,element.selectionStart,element.selectionEnd) : null;
    if(suggestions){
      event.preventDefault();const option=suggestions.options[0],completion=completePair(option.key,option.block,suggestions.indent);
      const before=element.value;remember();element.setSelectionRange(suggestions.from,suggestions.to);
      if(!document.execCommand('insertText',false,completion.insert))flushSync(()=>editContent(before.slice(0,suggestions.from)+completion.insert+before.slice(suggestions.to)));
      element.setSelectionRange(suggestions.from+completion.head,suggestions.from+completion.head);return;
    }
    const start=element.value.lastIndexOf('\n',element.selectionStart-1)+1;
    const endIndex=element.value.indexOf('\n',element.selectionStart),end=endIndex<0 ? element.value.length : endIndex;
    const command=/^ {0,3}\/(collapse|expand)[ \t]*$/.exec(element.value.slice(start,end));
    let fence:Fence=null;
    if(command)for(const line of element.value.slice(0,start).split('\n'))fence=nextFence(line,fence);
    if(event.key==='Enter' && !event.shiftKey && element.selectionStart===element.selectionEnd && command && !fence && active) {
      event.preventDefault();pendingCommand.current=command[1] as 'collapse'|'expand';pendingMatch.current=undefined;
      let content=element.value.slice(0,start)+element.value.slice(end),head=start;
      if(command[1]==='collapse' && parsePairs(element.value).some(pair=>pair.block && start>=pair.valueFrom && start<=pair.valueTo)) {
        if(!content.endsWith('\n'))content+='\n\n';head=content.length;
      }
      positions.current.set(active.id,{start:head,end:head,scroll:element.scrollTop});
      editContent(content);
      setRenderMarkdown(true);setRichEnabled(true);
      try{localStorage.setItem('bbb-notes-render-markdown','true');}catch{ /* Session preference remains available. */ }
      return;
    }
    const completion=pairCompletion(element.value,element.selectionStart,element.selectionEnd,event.key);
    const exit=event.key==='Enter' && !event.shiftKey && !completion ? pairExit(element.value,element.selectionStart,element.selectionEnd) : null;
    if(exit){
      event.preventDefault();const source=element.value;element.setSelectionRange(exit.from,exit.from);
      if(exit.insert && !document.execCommand('insertText',false,exit.insert))flushSync(()=>editContent(source.slice(0,exit.from)+exit.insert+source.slice(exit.from)));
      element.setSelectionRange(exit.head,exit.head);return;
    }
    const change = completion || (event.key==='Enter' ? plainBlockBreak(element.value,element.selectionStart,element.selectionEnd,event.shiftKey) : null);
    if (!change) return;
    event.preventDefault();
    const from = element.selectionStart; const to = element.selectionEnd;
    // Native insertion keeps the textarea's undo stack where the platform supports it.
    if (change.insert && !document.execCommand('insertText',false,change.insert)) {
      flushSync(() => editContent(element.value.slice(0,from)+change.insert+element.value.slice(to)));
    }
    element.focus(); element.setSelectionRange(change.head,change.head);
  }
  const RichEditor=richComponent || MarkdownEditor;
  const modifier = navigator.platform.includes('Mac') ? '⌘' : 'Ctrl';
  return <main>
    <nav inert={installing} className="titlebar" aria-label="Note tabs" data-tauri-drag-region><div className="tabs">{data.tabs.map(id => {
      const note = data.notes.find(n => n.id === id)!;
      return <div className={`tab ${id === data.active ? 'active' : ''}`} key={id}>
        <button className="tab-title" aria-current={id === data.active ? 'page' : undefined} onClick={() => open(note)}>{note && fileInfo[note.id]?.name || title(note)}</button>
        <button className="close" aria-label={`Close ${note && fileInfo[note.id]?.name || title(note)}`} title="Close tab; note stays searchable" onClick={() => close(id)}>×</button>
      </div>;
    })}</div><button className="new" disabled={!ready} onClick={create} title={`New note (${modifier}+N / ${modifier}+T)`} aria-label="New note">+</button>
      <div className="titlebar-drag" data-tauri-drag-region title="Drag to move · double-click to maximize" />
      <button className="search-button" disabled={!ready} onClick={() => setSearching(true)} aria-label="Search all notes" title={`Search all notes (${modifier}+K)`}><svg viewBox="0 0 20 20"><circle cx="8" cy="8" r="5.5"/><path d="m12 12 5 5"/></svg></button>
      <WindowControls onError={setError}/>
    </nav>
    {!desktop && <div className="preview">Browser preview · stored in this browser only. The desktop app uses SQLite.</div>}
    {error && <div className="error" role="alert">{error} <button onClick={() => void flush().catch(() => {})} disabled={!ready}>Retry save</button></div>}
    {fileError && <div className="file-error" role="alert">{fileError}<button aria-label="Dismiss file error" onClick={()=>setFileError('')}><Icon name="close"/></button></div>}
    <input ref={fileInput} className="sr-only" type="file" tabIndex={-1} aria-label="Choose file to open" onChange={event=>void browserFile(event.target.files?.[0])}/>
    <section inert={installing} className="editor"><div ref={toolbar} className="note-heading" role="toolbar" aria-label="Note actions">
      <FileMenu ready={ready} busy={fileBusy} modifier={modifier} onNew={create} onOpen={()=>void openFile()} onSave={()=>void saveAs()}/>
      <ViewMenu ready={ready} wordWrap={wordWrap} onToggle={()=>{setWordWrap(!wordWrap);persistPreference('word-wrap',String(!wordWrap));}}/>
      <button className="icon-button render-toggle" disabled={!ready} aria-label="Render Markdown" title={renderMarkdown ? 'Turn Markdown rendering off' : 'Turn Markdown rendering on'} aria-pressed={renderMarkdown} onClick={toggleMarkdown}><Icon name="markdown"/></button>
      <SettingsMenu disabled={!ready || fileBusy || installing} onOpen={()=>setSettingsOpen(true)} onUpdates={()=>{setSettingsOpen(false);setSearching(false);setUpdateOpen(true);}}/>
    </div>
    {active && fileInfo[active.id]?.unsupported && <div className="file-notice" role="status">File unsupported as text. Showing a readable ASCII preview or recovered text{fileInfo[active.id].truncated ? ' (first 64 KiB)' : ''}. Saving exports this displayed text.</div>}
    <span className="sr-only" role="status">{fileStatus}</span>
      {active && (richEnabled ? <Suspense fallback={<p className="editor-loading" role="status">Loading Markdown editor…</p>}><RichEditor key={active.id} noteId={active.id} initialCommand={pendingCommand.current} onRenderRequested={()=>{setRenderMarkdown(true);try{localStorage.setItem('bbb-notes-render-markdown','true');}catch{ /* Session preference remains available. */ }}} ref={markdownEditor} content={active.content} wordWrap={wordWrap} render={renderMarkdown} theme={theme} zoom={zoom} onChange={editContent} initialPosition={positions.current.get(active.id)} initialMatch={pendingMatch.current}/></Suspense> : <textarea key={active.id} ref={editor} wrap={wordWrap ? 'soft' : 'off'} style={{whiteSpace:wordWrap ? 'pre-wrap' : 'pre',overflowWrap:wordWrap ? 'anywhere' : 'normal'}} aria-label="Note content" spellCheck={false} placeholder="Paste something. Catch a thought.\nIt’ll be here when you come back." value={active.content} onKeyDown={completePlainPair} onChange={e => editContent(e.target.value)}/>)}
    </section>
    <footer><span className={error ? 'failed' : ''}><i/> {status}</span><span>{active?.content.length.toLocaleString() || 0} characters · {data.tabs.length} open {data.tabs.length === 1 ? 'note' : 'notes'}</span><span><button className="zoom-reset" title="Reset editor zoom (Ctrl+0)" aria-label="Reset editor zoom" onClick={()=>setZoom(100)}>{zoom}%</button> · {modifier}+N / T new · {modifier}+K search</span></footer>
    {updateOpen && <UpdateDialog onClose={closeUpdates} beforeInstall={beforeInstall} onFailure={installFailed}/>}
    {settingsOpen && <Settings theme={theme} onTheme={setTheme} onClose={closeSettings}/>}
    {exportDialog && <div className="overlay" onMouseDown={event=>{if(event.target===event.currentTarget)setExportDialog(null);}}><form className="settings-panel export-panel" role="dialog" aria-modal="true" aria-label="Save note as" onKeyDown={event=>{
      if(event.key==='Escape'){event.stopPropagation();setExportDialog(null);}
      if(event.key==='Tab'){const elements=[...event.currentTarget.querySelectorAll<HTMLElement>('input,button')];const index=elements.indexOf(document.activeElement as HTMLElement);event.preventDefault();elements[(index+(event.shiftKey ? -1 : 1)+elements.length)%elements.length]?.focus();}
    }} onSubmit={event=>{event.preventDefault();const target=exportDialog;setExportDialog(null);void exportFile(target.id,target.content,target.name);}}>
      <h2>Save note as</h2><label>Filename<input autoFocus aria-label="Filename" value={exportDialog.name} onChange={event=>setExportDialog({...exportDialog,name:event.target.value})}/></label>
      <p>Use .txt or any extension you choose.</p><div className="dialog-actions"><button type="button" onClick={()=>setExportDialog(null)}>Cancel</button><button type="submit" disabled={!exportDialog.name.trim()}>Save</button></div>
    </form></div>}
    {searching && <div className="overlay" onMouseDown={e => {if (e.target === e.currentTarget) setSearching(false);}}>
      <section className="search-panel" role="dialog" aria-modal="true" aria-label="Search all notes" onKeyDown={e => {
        if (e.key === 'Tab') { e.preventDefault(); (e.currentTarget.querySelector('input') as HTMLInputElement)?.focus(); }
        if (e.key === 'ArrowDown') {e.preventDefault(); setSelected(i => Math.min(i+1,results.length-1));}
        if (e.key === 'ArrowUp') {e.preventDefault(); setSelected(i => Math.max(0,i-1));}
        if (e.key === 'Enter' && results[selected]) { e.preventDefault(); e.stopPropagation(); open(results[selected],searchMatch(results[selected].content,query)); }
      }}><div className="search-input"><input autoFocus aria-label="Search text" placeholder="Search text or pair:IDEA, pair:ENV token…" value={query} onChange={e => setQuery(e.target.value)}/><button onClick={() => setSearching(false)}>Esc</button></div>
        <div className="search-meta">{query ? `${results.length} matches` : 'Recent notes'} · ↑ ↓ to navigate · Enter to open</div>
        <div className="results">{results.map((note,i) => <button key={note.id} className={`result ${selected === i ? 'selected' : ''}`} onClick={() => open(note,searchMatch(note.content,query))}><strong>{title(note)}</strong><p>{snippet(note.content,query) || 'Empty note'}</p></button>)}{!results.length && <p className="no-results">No notes found. Try a different word or fragment.</p>}</div>
      </section>
    </div>}
  </main>;
}
