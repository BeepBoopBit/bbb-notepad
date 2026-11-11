import { Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { insertNewlineContinueMarkupCommand } from '@codemirror/lang-markdown';
import {pairExit} from '../notes/pairs';
import {outlineItems,outlineState} from './outline';
import {holdPreview} from './copy/copy-state';
import { copyController } from './copy/copy-controller';
export const blockEditing=[
  EditorView.inputHandler.of((view,_from,_to,text)=>copyController(view)?.replace(text) || false),
  Prec.high(keymap.of([
    {key:'Enter',run:view=>insertBreak(view,true)},
    {key:'Shift-Enter',run:view=>insertBreak(view,false)},
  ])),
];
const continueMarkup=insertNewlineContinueMarkupCommand({nonTightLists:false});
export function insertBreak(view:EditorView,exit:boolean) {
  const range=view.state.selection.main;
  const canExit=exit && range.empty && view.state.selection.ranges.length===1 && outlineItems(view.state).some(item=>item.kind==='pair' && item.block && ['IDEA','SCRIPT'].includes(item.label) && range.head>=item.bodyFrom && range.head<=item.bodyTo);
  const plan=canExit ? pairExit(view.state.doc.toString(),range.from,range.to,view.state.field(outlineState,false)?.rawPairs) : null;
  if(plan){
    view.dispatch({changes:plan.insert ? {from:plan.from,insert:plan.insert.replace(/\n/g,view.state.lineBreak)} : undefined,selection:{anchor:plan.head},effects:holdPreview.of(null),scrollIntoView:true,userEvent:plan.insert ? 'input.type' : 'select'});
    return true;
  }
  if(exit && continueMarkup(view))return true;
  view.dispatch(view.state.replaceSelection(view.state.lineBreak),{scrollIntoView:true,userEvent:'input.type'});
  return true;
}
