import {findColumn,type EditorState} from '@codemirror/state';
import {outlineItems,outlineState} from '../outline';
import {markdownRendering} from '../markdown/markdown-preview';

export function pairCursorContext(state:EditorState,position:number) {
  const outline=state.field(outlineState,false),items=outlineItems(state);
  const raw=items.some(item=>item.kind==='pair' && outline?.rawPairs.has(item.from) && position>=item.from && position<=item.to);
  const pair=raw ? undefined : items.filter(item=>item.kind==='pair' && position>=item.from && position<=item.to).at(-1);
  const collapsed=items.some(item=>outline?.collapsed.has(item.from) && (item.kind==='pair' || state.field(markdownRendering,false)!==false) && position>=item.from && position<=(item.kind==='pair' ? item.to : item.bodyTo));
  return {pair,collapsed,hidden:!raw && (collapsed || !!(pair && (position<pair.bodyFrom || position>pair.bodyTo))),raw};
}
// Resolve only structural boundaries. Normal text and wrapped visual lines retain
// CodeMirror's own navigation. A null head means there is no editable line beyond.
export function pairNavigation(state:EditorState,position:number,forward:boolean,column?:number):{head:number|null;handled:boolean} {
  const outline=state.field(outlineState,false),items=outlineItems(state);let head=position,handled=false;
  const onLine=(pos:number)=>{const line=state.doc.lineAt(pos);return line.from+findColumn(line.text,column || 0,state.tabSize);};
  const outside=(from:number,to:number)=>{
    const number=state.doc.lineAt(forward ? to : from).number+(forward ? 1 : -1);
    if(number<1 || number>state.doc.lines)return null;
    const line=state.doc.line(number);return column===undefined ? forward ? line.from : line.to : onLine(line.from);
  };
  for(let tries=0;tries<items.length*2+2;tries++) {
    if(items.some(item=>item.kind==='pair' && outline?.rawPairs.has(item.from) && head>=item.from && head<=item.to))return {head,handled};
    const collapsed=items.find(item=>outline?.collapsed.has(item.from) && (item.kind==='pair' || state.field(markdownRendering,false)!==false) && head>=item.from && head<=(item.kind==='pair' ? item.to : item.bodyTo));
    if(collapsed){const next=outside(collapsed.from,collapsed.kind==='pair' ? collapsed.to : collapsed.bodyTo);handled=true;if(next===null)return {head:null,handled};head=next;continue;}
    const pair=items.filter(item=>item.kind==='pair' && head>=item.from && head<=item.to && (!item.block && column!==undefined || head<item.bodyFrom || head>item.bodyTo)).at(-1);
    if(!pair)return {head,handled};
    handled=true;
    if(!pair.block){
      if(column!==undefined)return {head:Math.min(pair.bodyTo,pair.bodyFrom+findColumn(state.doc.sliceString(pair.bodyFrom,pair.bodyTo),column,state.tabSize)),handled};
      if(forward)return {head:pair.bodyFrom,handled};
      const next=outside(pair.from,pair.to);if(next===null)return {head:pair.bodyFrom,handled};head=next;continue;
    }
    const header=head<pair.bodyFrom;
    if(header===forward){head=column===undefined ? header ? pair.bodyFrom : pair.bodyTo : onLine(header ? pair.bodyFrom : pair.bodyTo);head=Math.max(pair.bodyFrom,Math.min(pair.bodyTo,head));continue;}
    const next=outside(pair.from,pair.to);
    if(next===null)return {head:header ? pair.bodyFrom : pair.bodyTo,handled};
    head=next;
  }
  return {head:null,handled:true};
}
