import { Prec, StateEffect, StateField, type EditorState } from '@codemirror/state';
import { EditorView, keymap, showTooltip, type Tooltip } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { outlineItems,outlineState, setAllOutline } from './outline';
import { isolateHistory } from '@codemirror/commands';
import { holdPreview } from './copy/copy-state';
const commands=[{name:'collapse',description:'Collapse all headings and pairs'},{name:'expand',description:'Expand all headings and pairs'}] as const;
const chooseCommand=StateEffect.define<number>();
const dismissCommands=StateEffect.define<null>();
type Menu={from:number;to:number;query:string;index:number;names:typeof commands[number][]};
function menuAt(state:EditorState):Menu|null {
  const range=state.selection.main;if(!range.empty)return null;
  const line=state.doc.lineAt(range.head);if(range.head!==line.to)return null;
  const match=/^ {0,3}\/([a-z]*)[ \t]*$/.exec(line.text);if(!match)return null;
  for(let node=syntaxTree(state).resolveInner(range.head,-1);node.parent;node=node.parent)if(['FencedCode','IndentedCode'].includes(node.name))return null;
  const names=commands.filter(command=>command.name.startsWith(match[1]));
  return names.length ? {from:line.from,to:line.to,query:match[1],index:0,names} : null;
}
function execute(view:EditorView,name:'collapse'|'expand') {
  const menu=view.state.field(commandMenu);if(!menu)return false;
  const changes=[{from:menu.from,to:menu.to,insert:''}];let anchor=menu.from;
  if(name==='collapse' && outlineItems(view.state).some(item=>item.kind==='pair' && item.from<=menu.from && item.to>=menu.to)) {
    const padding=view.state.doc.line(view.state.doc.lines).text ? '\n\n' : '';
    if(padding)changes.push({from:view.state.doc.length,to:view.state.doc.length,insert:padding.replace(/\n/g,view.state.lineBreak)});
    anchor=view.state.doc.length-(menu.to-menu.from)+padding.length;
  }
  view.dispatch({changes,selection:{anchor},annotations:isolateHistory.of('full'),effects:[setAllOutline.of(name==='collapse'),holdPreview.of(null)],userEvent:'input.command',scrollIntoView:true});
  view.focus();return true;
}
const commandMenu=StateField.define<Menu|null>({
  create:menuAt,
  update(value,tr) {
    if(tr.docChanged || tr.selection)value=menuAt(tr.state);
    for(const effect of tr.effects) {
      if(effect.is(dismissCommands))value=null;
      if(effect.is(chooseCommand) && value)value={...value,index:(value.index+effect.value+value.names.length)%value.names.length};
    }
    return value;
  },
  provide:field=>showTooltip.from(field,menu=>menu ? {
    pos:menu.to,above:true,strictSide:false,
    create(view) {
      const dom=document.createElement('div');dom.className='slash-menu';dom.setAttribute('role','menu');dom.setAttribute('aria-label','Slash commands');
      menu.names.forEach((command,index)=>{
        const button=document.createElement('button');button.type='button';button.setAttribute('role','menuitem');button.classList.toggle('active',menu.index===index);
        const label=document.createElement('strong');label.textContent='/'+command.name;
        const detail=document.createElement('span');detail.textContent=command.description;button.append(label,detail);
        button.addEventListener('mousedown',event=>event.preventDefault());button.addEventListener('click',()=>execute(view,command.name));dom.append(button);
      });return {dom};
    },
  } satisfies Tooltip : null),
});
export const slashCommands=[outlineState,commandMenu,Prec.highest(keymap.of([
  {key:'Enter',run:view=>{const menu=view.state.field(commandMenu);return menu ? execute(view,menu.names[menu.index].name) : false;}},
  ...(['ArrowDown','ArrowUp'] as const).map((key,index)=>({key,run:(view:EditorView)=>{if(!view.state.field(commandMenu))return false;view.dispatch({effects:chooseCommand.of(index ? -1 : 1)});return true;}})),
  {key:'Escape',stopPropagation:true,run:view=>{if(!view.state.field(commandMenu))return false;view.dispatch({effects:dismissCommands.of(null)});return true;}},
]))];
