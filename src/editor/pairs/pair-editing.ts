import { Prec } from '@codemirror/state';
import { EditorView, keymap } from '@codemirror/view';
import { pairCompletion } from '../../notes/pairs';

export const pairEditing = [
  EditorView.inputHandler.of((view,from,to,text) => {
    if (text !== '{' && text !== '}') return false;
    const change = pairCompletion(view.state.doc.toString(),from,to,text);
    if (!change) return false;
    view.dispatch({changes:change.insert ? {from,to,insert:change.insert} : undefined,selection:{anchor:change.head},userEvent:'input.type'});
    return true;
  }),
  Prec.high(keymap.of([{key:'Enter',shift:expandPair,run:expandPair},{key:'Shift-Enter',run:expandPair}])),
];
function expandPair(view:EditorView) {
    const range = view.state.selection.main;
    const change = pairCompletion(view.state.doc.toString(),range.from,range.to,'Enter');
    if (!change) return false;
    view.dispatch({changes:{from:range.from,to:range.to,insert:change.insert.replace(/\n/g,view.state.lineBreak)},selection:{anchor:change.head},userEvent:'input.type'});
    return true;
  }
