import { StateEffect, StateField, type EditorState } from '@codemirror/state';
import { syntaxTree } from '@codemirror/language';
import type { SyntaxNode } from '@lezer/common';
import { holdPreview } from './copy/copy-state';
import type { EditorView } from '@codemirror/view';
import { copyController } from './copy/copy-controller';
import { parsePairs } from '../notes/pairs';

export type OutlineItem={from:number;to:number;bodyFrom:number;bodyTo:number;kind:'heading'|'pair';label:string;block?:boolean};
const itemCache=new WeakMap<EditorState,OutlineItem[]>();
export function outlineItems(state:EditorState):OutlineItem[] {
  const cached=itemCache.get(state);if(cached)return cached;
  const items:OutlineItem[]=[];
  function visit(parent:SyntaxNode) {
    for(let node=parent.firstChild;node;node=node.nextSibling) {
      if(/^ATXHeading[1-6]$/.test(node.name)) {
        const level=Number(node.name.at(-1));let end=parent.to;
        for(let next=node.nextSibling;next;next=next.nextSibling)if(/^ATXHeading[1-6]$/.test(next.name) && Number(next.name.at(-1))<=level){end=next.from;break;}
        let last=state.doc.lineAt(Math.max(node.to,end-1));
        while(last.from>node.to && !last.text.trim())last=state.doc.line(last.number-1);
        end=Math.max(node.to,Math.min(end,last.to));
        items.push({from:node.from,to:node.to,bodyFrom:node.to,bodyTo:Math.max(node.to,end),kind:'heading',label:state.doc.sliceString(node.from,node.to).replace(/^#+\s*/, '').replace(/\s+#+\s*$/,'') || 'Heading'});
      } else if(node.name==='Pair') {
        const pair=parsePairs(state.doc.sliceString(node.from,node.to))[0];
        if(pair)items.push({from:node.from,to:node.to,bodyFrom:node.from+pair.valueFrom,bodyTo:node.from+pair.valueTo,kind:'pair',label:pair.key,block:pair.block});
        for(let child=node.firstChild;child;child=child.nextSibling)if(child.name==='Document')visit(child);
      }
    }
  }
  visit(syntaxTree(state).topNode);itemCache.set(state,items);return items;
}
export const toggleOutline=StateEffect.define<number>();
export const setAllOutline=StateEffect.define<boolean>();
export const editPairSource=StateEffect.define<number>();
export const outlineState=StateField.define<{collapsed:Set<number>;rawPairs:Set<number>}>({
  create:()=>({collapsed:new Set(),rawPairs:new Set()}),
  update(value,tr) {
    let collapsed=value.collapsed,rawPairs=value.rawPairs;
    if(tr.docChanged) {
      collapsed=new Set([...collapsed].map(pos=>tr.changes.mapPos(pos,1)));
      rawPairs=new Set([...rawPairs].map(pos=>tr.changes.mapPos(pos,1)));
    }
    for(const effect of tr.effects) {
      if(effect.is(toggleOutline)){collapsed=new Set(collapsed);if(collapsed.has(effect.value))collapsed.delete(effect.value);else collapsed.add(effect.value);}
      if(effect.is(setAllOutline))collapsed=new Set(effect.value ? outlineItems(tr.state).map(item=>item.from) : []);
      if(effect.is(editPairSource)){rawPairs=new Set(rawPairs);rawPairs.add(effect.value);collapsed=new Set(collapsed);collapsed.delete(effect.value);}
    }
    if(tr.docChanged || (tr.selection && rawPairs.size)) {
      const items=outlineItems(tr.state),valid=new Set(items.map(item=>item.from));
      collapsed=new Set([...collapsed].filter(pos=>valid.has(pos)));
      rawPairs=new Set([...rawPairs].filter(pos=>items.some(item=>item.kind==='pair' && item.from===pos && tr.state.selection.ranges.some(range=>range.from<=item.to && range.to>=item.from))));
    }
    if(collapsed.size===value.collapsed.size && [...collapsed].every(pos=>value.collapsed.has(pos)))collapsed=value.collapsed;
    if(rawPairs.size===value.rawPairs.size && [...rawPairs].every(pos=>value.rawPairs.has(pos)))rawPairs=value.rawPairs;
    return collapsed===value.collapsed && rawPairs===value.rawPairs ? value : {collapsed,rawPairs};
  },
});
export function outlineToggleButton(view:EditorView,item:OutlineItem) {
  const collapsed=view.state.field(outlineState,false)?.collapsed.has(item.from) || false;
  const button=document.createElement('button');button.type='button';button.className='outline-toggle';
  button.classList.toggle('collapsed',collapsed);button.setAttribute('aria-expanded',String(!collapsed));
  button.setAttribute('aria-label',`${collapsed ? 'Expand' : 'Collapse'} ${item.label} ${item.kind==='pair' ? 'pair' : 'section'}`);
  button.title=button.getAttribute('aria-label')!;
  button.addEventListener('mousedown',event=>{event.preventDefault();event.stopPropagation();});
  button.addEventListener('click',event=>{
    event.preventDefault();event.stopPropagation();
    copyController(view)?.clear(false);
    const range=view.state.selection.main;
    const inside=item.kind==='heading' ? range.head>item.bodyFrom && range.head<=item.bodyTo : range.head>=item.from && range.head<=item.to;
    view.dispatch({effects:[toggleOutline.of(item.from),holdPreview.of(null)],...(!collapsed && inside ? {selection:{anchor:item.kind==='heading' ? item.to : item.from}} : {})});
    view.focus();
  });return button;
}
