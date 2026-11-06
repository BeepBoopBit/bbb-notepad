import { EditorSelection, findColumn } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { livePreview } from './markdown-preview';
import {pairCursorContext,pairNavigation} from '../pairs/pair-navigation';
import {holdPreview} from '../copy/copy-state';
import {copyController} from '../copy/copy-controller';
function select(view:EditorView,head:number,forward:boolean,extend:boolean,goal?:number) {
  const range=view.state.selection.main;
  const selection=extend ? EditorSelection.range(range.anchor,head,goal) : EditorSelection.cursor(head,forward ? 1 : -1,undefined,goal);
  copyController(view)?.clear(false);
  view.dispatch({selection:EditorSelection.create([selection]),effects:holdPreview.of(null),scrollIntoView:true,userEvent:'select'});view.focus();return true;
}
function moveAcrossPreview(view:EditorView,forward:boolean,extend=false):boolean {
  const decorations=view.state.field(livePreview,false);if(!decorations || view.state.selection.ranges.length!==1)return false;
  const range=view.state.selection.main;if(!extend && !range.empty)return false;
  const line=view.state.doc.lineAt(range.head),current=pairCursorContext(view.state,range.head);
  const nextNumber=line.number+(forward ? 1 : -1);
  const nextLine=nextNumber>=1 && nextNumber<=view.state.doc.lines ? view.state.doc.line(nextNumber) : null;
  let hidden=false;if(nextLine)decorations.between(nextLine.from,nextLine.to,(from,to)=>{if(from<to && from<=nextLine.to && to>=nextLine.from)hidden=true;});
  if(!current.hidden && (!nextLine || !hidden && !pairCursorContext(view.state,nextLine.from).hidden))return false;
  const visual=view.moveVertically(range,forward);
  if(!current.hidden && visual.head!==range.head && view.state.doc.lineAt(visual.head).number===line.number)return false;
  const coords=view.coordsAtPos(range.head,range.assoc || (forward ? 1 : -1)),left=view.contentDOM.getBoundingClientRect().left;
  const padding=parseFloat(getComputedStyle(view.contentDOM).paddingLeft) || 0;
  const goal=range.goalColumn ?? visual.goalColumn ?? (coords ? coords.left-left : padding);
  const column=Math.max(0,Math.round((goal-padding)/view.defaultCharacterWidth));
  // A scalar's hidden prefix is not an editable stop, including on initial focus.
  if(current.pair && !current.pair.block && current.hidden && !current.raw && !current.collapsed){const target=pairNavigation(view.state,range.head,true,column);if(target.head!==null)return select(view,target.head,forward,extend,goal);}
  if(!nextLine){
    if(current.hidden && current.pair){const target=pairNavigation(view.state,range.head,range.head<current.pair.bodyFrom,column);if(target.head!==null)return select(view,target.head,forward,extend,goal);return true;}
    return false;
  }
  const candidate=nextLine.from+findColumn(nextLine.text,column,view.state.tabSize);
  const target=pairNavigation(view.state,candidate,forward,column);
  if(target.head===null){
    if(current.hidden){const fallback=pairNavigation(view.state,range.head,!forward,column);if(fallback.head!==null)return select(view,fallback.head,forward,extend,goal);}
    return target.handled;
  }
  if(!hidden && !target.handled && !current.hidden)return false;
  return select(view,target.head,forward,extend,goal);
}
function moveAcrossPair(view:EditorView,forward:boolean,extend=false):boolean {
  if(view.state.selection.ranges.length!==1)return false;
  const range=view.state.selection.main;if(!extend && !range.empty)return false;
  const candidate=range.head+(forward ? 1 : -1),current=pairCursorContext(view.state,range.head);
  if(candidate<0 || candidate>view.state.doc.length)return false;
  const target=pairNavigation(view.state,candidate,forward);
  const leavingScalar=current.pair && !current.pair.block && !current.raw && candidate>current.pair.to;
  if(!target.handled && !current.hidden && !leavingScalar)return false;
  if(target.head===null)return true;
  return select(view,target.head,forward,extend);
}
function lineBoundary(view:EditorView,forward:boolean,extend=false):boolean {
  if(view.state.selection.ranges.length!==1)return false;
  const range=view.state.selection.main,current=pairCursorContext(view.state,range.head),pair=current.pair;
  if(current.raw || !pair || pair.block && !current.hidden)return false;
  if(current.collapsed){const target=pairNavigation(view.state,range.head,forward);return target.head===null ? true : select(view,target.head,forward,extend);}
  const head=pair.block ? range.head<pair.bodyFrom ? pair.bodyFrom : forward ? pair.bodyTo : Math.max(pair.bodyFrom,view.state.doc.lineAt(pair.bodyTo).from) : forward ? pair.bodyTo : pair.bodyFrom;
  return select(view,head,forward,extend);
}
function documentBoundary(view:EditorView,forward:boolean,extend=false):boolean {
  if(view.state.selection.ranges.length!==1)return false;
  const position=forward ? view.state.doc.length : 0,target=pairNavigation(view.state,position,!forward);
  if(!target.handled)return false;
  return target.head===null ? true : select(view,target.head,forward,extend);
}
export const markdownNavigation=keymap.of([
  {key:'ArrowDown',run:view=>moveAcrossPreview(view,true),shift:view=>moveAcrossPreview(view,true,true)},
  {key:'ArrowUp',run:view=>moveAcrossPreview(view,false),shift:view=>moveAcrossPreview(view,false,true)},
  {key:'ArrowRight',run:view=>moveAcrossPair(view,true),shift:view=>moveAcrossPair(view,true,true)},
  {key:'ArrowLeft',run:view=>moveAcrossPair(view,false),shift:view=>moveAcrossPair(view,false,true)},
  {key:'Home',run:view=>lineBoundary(view,false),shift:view=>lineBoundary(view,false,true)},
  {key:'End',run:view=>lineBoundary(view,true),shift:view=>lineBoundary(view,true,true)},
  {key:'Mod-Home',mac:'Meta-ArrowUp',run:view=>documentBoundary(view,false),shift:view=>documentBoundary(view,false,true)},
  {key:'Mod-End',mac:'Meta-ArrowDown',run:view=>documentBoundary(view,true),shift:view=>documentBoundary(view,true,true)},
]);
