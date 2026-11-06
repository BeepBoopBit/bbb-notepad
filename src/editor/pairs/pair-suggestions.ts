import {Prec,StateEffect,StateField,type EditorState} from '@codemirror/state';
import {EditorView,keymap,showTooltip,type Tooltip} from '@codemirror/view';
import {pairSuggestions,completePair} from '../../notes/pairs';
const choose=StateEffect.define<number>(),dismiss=StateEffect.define<null>();
type Menu=NonNullable<ReturnType<typeof pairSuggestions>>&{index:number};
function menuAt(state:EditorState):Menu|null {
  const range=state.selection.main;if(!range.empty)return null;
  const line=state.doc.lineAt(range.head);if(range.head!==line.to || !/^ {0,3}![A-Za-z_]*$/.test(line.text))return null;
  const menu=pairSuggestions(state.doc.toString(),range.from,range.to);
  return menu ? {...menu,index:0} : null;
}
function execute(view:EditorView,index:number) {
  const menu=view.state.field(pairMenu);if(!menu)return false;
  const option=menu.options[index],completion=completePair(option.key,option.block,menu.indent);
  view.dispatch({changes:{from:menu.from,to:menu.to,insert:completion.insert.replace(/\n/g,view.state.lineBreak)},selection:{anchor:menu.from+completion.head},scrollIntoView:true,userEvent:'input.complete'});
  view.focus();return true;
}
const pairMenu=StateField.define<Menu|null>({
  create:menuAt,
  update(value,tr){
    if(tr.docChanged || tr.selection)value=menuAt(tr.state);
    for(const effect of tr.effects){if(effect.is(dismiss))value=null;if(effect.is(choose) && value)value={...value,index:(value.index+effect.value+value.options.length)%value.options.length};}
    return value;
  },
  provide:field=>showTooltip.from(field,menu=>menu ? {
    pos:menu.to,above:false,
    create(view){
      const dom=document.createElement('div');dom.className='slash-menu pair-menu';dom.setAttribute('role','menu');dom.setAttribute('aria-label','Supported pairs');
      menu.options.forEach((option,index)=>{
        const button=document.createElement('button');button.type='button';button.setAttribute('role','menuitem');button.classList.toggle('active',index===menu.index);
        const label=document.createElement('strong');label.textContent=`!${option.key}:${option.block ? '{}' : ' value'}`;
        const detail=document.createElement('span');detail.textContent=option.description;button.append(label,detail);
        button.addEventListener('mousedown',event=>event.preventDefault());button.addEventListener('click',()=>execute(view,index));dom.append(button);
      });return {dom};
    },
  } satisfies Tooltip : null),
});
export const pairSuggestionEditing=[pairMenu,Prec.highest(keymap.of([
  {key:'Enter',run:view=>{const menu=view.state.field(pairMenu);return menu ? execute(view,menu.index) : false;}},
  ...(['ArrowDown','ArrowUp'] as const).map((key,index)=>({key,run:(view:EditorView)=>{if(!view.state.field(pairMenu))return false;view.dispatch({effects:choose.of(index ? -1 : 1)});return true;}})),
  {key:'Escape',stopPropagation:true,run:view=>{if(!view.state.field(pairMenu))return false;view.dispatch({effects:dismiss.of(null)});return true;}},
]))];
