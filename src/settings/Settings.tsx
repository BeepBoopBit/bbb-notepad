import {useEffect,useRef,useState} from 'react';
import {Icon} from '../ui/icons';
import type {Theme} from './preferences';
export function Settings({theme,onTheme,onClose}:{theme:Theme;onTheme(theme:Theme):void;onClose():void}) {
  const panel=useRef<HTMLElement>(null);
  useEffect(()=>{panel.current?.querySelector<HTMLButtonElement>('button')?.focus();},[]);
  return <div className="overlay settings-overlay" onMouseDown={event=>{if(event.target===event.currentTarget)onClose();}}>
    <section ref={panel} className="settings-panel" role="dialog" aria-modal="true" aria-label="Normal settings" onKeyDown={event=>{
      if(event.key==='Escape'){event.preventDefault();event.stopPropagation();onClose();}
      if(event.key==='Tab'){
        const buttons=[...event.currentTarget.querySelectorAll<HTMLButtonElement>('button')],index=buttons.indexOf(document.activeElement as HTMLButtonElement);
        event.preventDefault();buttons[(index+(event.shiftKey ? -1 : 1)+buttons.length)%buttons.length]?.focus();
      }
    }}>
      <div className="settings-heading"><h2>Normal settings</h2><button className="icon-button" aria-label="Close settings" title="Close settings" onClick={onClose}><Icon name="close"/></button></div>
      <div className="settings-row"><div><h3>Theme</h3><p>Choose your appearance.</p></div><div className="theme-options" role="group" aria-label="Theme">
        {(['light','dark'] as const).map(value=><button key={value} aria-pressed={theme===value} onClick={()=>onTheme(value)}><Icon name={value==='light' ? 'sun' : 'moon'}/>{value==='light' ? 'Light' : 'Dark'}</button>)}
      </div></div>
    </section>
  </div>;
}
export function SettingsMenu({onOpen,onUpdates,disabled=false}:{onOpen():void;onUpdates():void;disabled?:boolean}) {
  const [open,setOpen]=useState(false);const focusOnOpen=useRef<'first'|'last'|null>(null);const root=useRef<HTMLDivElement>(null);const trigger=useRef<HTMLButtonElement>(null);
  useEffect(()=>{
    if(!open)return;
    if(focusOnOpen.current){const items=[...root.current!.querySelectorAll<HTMLButtonElement>('[role=menuitem]')];items[focusOnOpen.current==='last' ? items.length-1 : 0]?.focus();focusOnOpen.current=null;}
    const outside=(event:MouseEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
    document.addEventListener('mousedown',outside);return()=>document.removeEventListener('mousedown',outside);
  },[open]);
  return <div className="settings-menu-root" ref={root} onKeyDown={event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setOpen(false);trigger.current?.focus();}
    if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();if(!open){focusOnOpen.current=event.key==='ArrowUp' ? 'last' : 'first';setOpen(true);}else {const items=[...root.current!.querySelectorAll<HTMLButtonElement>('[role=menuitem]')],index=items.indexOf(document.activeElement as HTMLButtonElement);items[index<0 ? event.key==='ArrowUp' ? items.length-1 : 0 : (index+(event.key==='ArrowUp' ? -1 : 1)+items.length)%items.length]?.focus();}}
    if(event.key==='Tab')setOpen(false);
  }}>
    <button ref={trigger} className="icon-button settings-button" disabled={disabled} aria-label="Settings" title="Settings" aria-haspopup="menu" aria-expanded={open} onClick={event=>{focusOnOpen.current=event.detail===0 ? 'first' : null;setOpen(value=>!value);}}><Icon name="settings"/></button>
    {open && <div className="settings-dropdown" role="menu" aria-label="Settings menu"><button role="menuitem" onClick={()=>{setOpen(false);onOpen();}}>Normal settings</button><button role="menuitem" onClick={()=>{setOpen(false);onUpdates();}}>Check for updates</button></div>}
  </div>;
}
