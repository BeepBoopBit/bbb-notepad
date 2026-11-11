import {useEffect,useRef,useState} from 'react';
export function ViewMenu({ready,wordWrap,onToggle}:{ready:boolean;wordWrap:boolean;onToggle():void}) {
  const [open,setOpen]=useState(false);const focusOnOpen=useRef<'first'|'last'|null>(null);const root=useRef<HTMLDivElement>(null);const trigger=useRef<HTMLButtonElement>(null);
  const items=()=>[...root.current?.querySelectorAll<HTMLButtonElement>('[role=menuitemcheckbox]:not(:disabled)') || []];
  useEffect(()=>{
    if(!open)return;
    if(focusOnOpen.current){const buttons=items();buttons[focusOnOpen.current==='last' ? buttons.length-1 : 0]?.focus();focusOnOpen.current=null;}
    const outside=(event:MouseEvent)=>{if(!root.current?.contains(event.target as Node))setOpen(false);};
    document.addEventListener('mousedown',outside);return()=>document.removeEventListener('mousedown',outside);
  },[open]);
  function run(action:()=>void){setOpen(false);action();}
  return <div ref={root} className="file-menu-root view-menu-root" onKeyDown={event=>{
    if(event.key==='Escape'){event.preventDefault();event.stopPropagation();setOpen(false);trigger.current?.focus();}
    if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){
      event.preventDefault();
      if(!open){focusOnOpen.current=event.key==='ArrowUp' || event.key==='End' ? 'last' : 'first';setOpen(true);return;}
      const buttons=items(),index=buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next=event.key==='Home' ? 0 : event.key==='End' ? buttons.length-1 : index<0 ? event.key==='ArrowUp' ? buttons.length-1 : 0 : (index+(event.key==='ArrowUp' ? -1 : 1)+buttons.length)%buttons.length;
      buttons[next]?.focus();
    }
    if(event.key==='Tab')setOpen(false);
  }}>
    <button ref={trigger} className="file-menu-trigger" disabled={!ready} aria-label="View" aria-haspopup="menu" aria-expanded={open} onClick={event=>{focusOnOpen.current=event.detail===0 ? 'first' : null;setOpen(value=>!value);}}>View</button>
    {open && <div className="file-dropdown" role="menu" aria-label="View menu">
      <button role="menuitemcheckbox" aria-checked={wordWrap} onClick={()=>run(onToggle)}>Word Wrap <span aria-hidden="true">{wordWrap ? "✓" : ""}</span></button>
    </div>}
  </div>;
}
