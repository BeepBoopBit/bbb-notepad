import {useEffect,useRef,useState} from 'react';
import type {Update} from '@tauri-apps/plugin-updater';
import {updates,type UpdateStatus} from './updates';
import {Icon} from '../ui/icons';
type Phase='checking'|'unconfigured'|'unsupported'|'current'|'available'|'downloading'|'installing'|'error';
export function UpdateDialog({onClose,beforeInstall,onFailure}:{onClose():void;beforeInstall():Promise<void>;onFailure():void}) {
  const [phase,setPhase]=useState<Phase>('checking'),[status,setStatus]=useState<UpdateStatus|null>(null),[error,setError]=useState(''),[progress,setProgress]=useState<number|null>(null);
  const update=useRef<Update|null>(null),mounted=useRef(true),operation=useRef(0),panel=useRef<HTMLElement>(null);
  const busy=phase==='downloading' || phase==='installing';
  async function check(){
    const run=++operation.current;setPhase('checking');setError('');
    try{
      await update.current?.close().catch(()=>{});update.current=null;
      const info=await updates.status();if(!mounted.current || run!==operation.current)return;setStatus(info);
      if(!info.desktop){setPhase('unsupported');return;}if(!info.configured){setPhase('unconfigured');return;}
      const result=await updates.check();
      if(!mounted.current || run!==operation.current){await result?.close();return;}
      update.current=result;setPhase(result ? 'available' : 'current');
    }catch(reason){if(mounted.current && run===operation.current){setError(String(reason));setPhase('error');}}
  }
  useEffect(()=>{
    mounted.current=true;void check();panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return()=>{mounted.current=false;operation.current++;void update.current?.close().catch(()=>{});};
  },[]);
  async function install(){
    const pending=update.current;if(!pending)return;
    setPhase('downloading');setProgress(null);let downloaded=0,total=0;
    try{
      await pending.download(event=>{
        if(event.event==='Started'){total=event.data.contentLength || 0;downloaded=0;}
        if(event.event==='Progress')downloaded+=event.data.chunkLength;
        if(mounted.current)setProgress(total ? Math.min(100,Math.round(downloaded*100/total)) : null);
      },{timeout:120_000});
      setPhase('installing');await beforeInstall();
      await pending.install({restartAfterInstall:true});await updates.restart();
    }catch(reason){onFailure();if(mounted.current){setError(String(reason));setPhase('error');}}
  }
  const titles:Record<Phase,string>={checking:'Checking for updates…',unconfigured:'Updates aren’t configured yet',unsupported:'Updates are available in the desktop app',current:'You’re up to date',available:`bbb-notepad ${update.current?.version || ''} is available`,downloading:'Downloading update…',installing:'Saving notes and installing…',error:'Could not complete the update'};
  return <div className="overlay update-overlay" onMouseDown={event=>{if(event.target===event.currentTarget && !busy)onClose();}}>
    <section ref={panel} className="settings-panel update-panel" role="dialog" aria-modal="true" aria-label="Check for updates" aria-busy={phase==='checking' || busy} onKeyDown={event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();if(!busy)onClose();}
      if(event.key==='Tab'){
        const buttons=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];if(!buttons.length){event.preventDefault();return;}
        event.preventDefault();const index=buttons.indexOf(document.activeElement as HTMLButtonElement);buttons[(index+(event.shiftKey ? -1 : 1)+buttons.length)%buttons.length]?.focus();
      }
    }}>
      <div className="settings-heading"><h2>Updates</h2><button className="icon-button" aria-label="Close updates" title="Close updates" disabled={busy} onClick={onClose}><Icon name="close"/></button></div>
      {status && <p>bbb-notepad · Current version {status.version}</p>}
      <h3 role="status" aria-live="polite">{titles[phase]}</h3>
      {phase==='unconfigured' && <p>This build has no update source configured. Future release builds can connect to the release repository.</p>}
      {phase==='available' && <><p>Your notes will be saved before installation. The app will restart.</p><pre className="release-notes">{update.current?.body || 'No release notes provided.'}</pre></>}
      {phase==='downloading' && <progress aria-label="Update download progress" max={100} value={progress===null ? undefined : progress}/>}
      {phase==='installing' && <p>Keeping a local backup of your notes before updating. Please wait.</p>}
      {phase==='error' && <p className="update-error" role="alert">{error}</p>}
      <div className="dialog-actions">
        {!busy && <button onClick={onClose}>Close</button>}
        {phase==='available' && <button onClick={()=>void install()}>Download and install</button>}
        {(phase==='error' || phase==='current') && <button onClick={()=>void check()}>Check again</button>}
      </div>
    </section>
  </div>;
}
