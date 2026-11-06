import { EditorView, runScopeHandlers } from '@codemirror/view';
import { getCopyUnit, plainMarkdown, nativeSelectionUnits } from './copy-units';
import { syntaxTree } from '@codemirror/language';
import { parsePairs, maskedContent, ENV_MASK } from '../../notes/pairs';
import { joinUnits, orderedUnits, toggleUnit, type CopyUnit } from './copy-model';
import { heldPreviewSelection, holdPreview } from './copy-state';
import { writeClipboard } from '../../platform/clipboard';
import { replacementPlan } from './copy-edit';
import { isolateHistory } from '@codemirror/commands';
export type CopySummary={count:number;message:string;error:boolean};
const controllers=new WeakMap<EditorView,CopyController>();
export function copyController(view:EditorView) { return controllers.get(view); }

type Gesture={x:number;y:number;shift:boolean;moved:boolean;anchor:CopyUnit;baseline:Map<string,CopyUnit>;edit:(offset?:number)=>void;offset:number;source?:boolean};
export class CopyController {
  selected=new Map<string,CopyUnit>();
  private known=new Map<string,CopyUnit>();
  private gesture:Gesture|null=null;
  private frame=0;
  private point:{x:number;y:number}|null=null;
  private disposed=false;
  private nativeActive=false;
  private message=''; private error=false; private timer?:ReturnType<typeof setTimeout>;
  private scope:HTMLElement;
  constructor(readonly view:EditorView,private notify:(summary:CopySummary)=>void) {
    controllers.set(view,this); this.scope=view.dom.closest('.markdown-editor') as HTMLElement;
    document.addEventListener('mousedown',this.documentDown,true);
    document.addEventListener('paste',this.onPaste,true);
    document.addEventListener('cut',this.onCut,true);
    document.addEventListener('beforeinput',this.onBeforeInput,true);
    view.dom.addEventListener('mousedown',this.sourceDown,true);
    document.addEventListener('mousemove',this.move,true);
    document.addEventListener('mouseup',this.up,true);
    document.addEventListener('copy',this.onCopy,true);
    document.addEventListener('keydown',this.onKey,true);
    this.refresh();
  }
  private publish() { this.notify({count:this.selected.size,message:this.message,error:this.error}); }
  private feedback(message:string,error=false) {
    clearTimeout(this.timer); this.message=message; this.error=error; this.publish();
    this.timer=setTimeout(()=>{this.message='';this.publish();},error ? 5000 : 1800);
  }
  async copy(text:string) {
    try { await writeClipboard(text); if(!this.disposed)this.feedback('Copied'); }
    catch { if(!this.disposed)this.feedback('Copy failed. Select text and press Ctrl/Cmd+C.',true); }
  }
  copySelected(plain=false) { return this.copy(joinUnits(this.selected.values(),plain)); }
  private hold() {
    if(!this.view.state.field(heldPreviewSelection)) this.view.dispatch({effects:holdPreview.of(this.view.state.selection)});
  }
  clear(restore=true) {
    this.gesture=null; cancelAnimationFrame(this.frame); this.frame=0;
    this.nativeActive=false;this.selected.clear(); this.message=''; this.error=false; clearTimeout(this.timer);
    this.view.dom.classList.remove('copy-native-selection','copy-collecting');
    if(restore) {
      const snapshot=this.view.state.field(heldPreviewSelection);
      if(snapshot) {
        window.getSelection()?.removeAllRanges();
        this.view.dispatch({selection:snapshot,effects:holdPreview.of(null)});
      }
    }
    this.refresh(); this.publish();
  }
  edited() { this.known.clear(); this.clear(false); }
  refresh() {
    this.view.dom.classList.toggle('copy-native-selection',this.nativeActive);
    this.view.dom.classList.toggle('copy-collecting',!!this.gesture?.shift);
    for(const line of this.view.dom.querySelectorAll<HTMLElement>('.cm-line')) {
      const pos=this.view.posAtDOM(line,0);
      line.classList.toggle('copy-selected',!!line.textContent?.trim() && [...this.selected.values()].some(unit=>unit.from!==undefined && unit.to!==undefined && pos>=unit.from && pos<=unit.to));
    }
    for(const element of this.view.dom.querySelectorAll<HTMLElement>('[data-copy-unit]')) {
      const unit=getCopyUnit(element); if(!unit)continue;
      this.known.set(unit.id,unit);
      const selected=this.selected.has(unit.id);
      element.classList.toggle('copy-selected',selected);
      const grab=element.querySelector<HTMLButtonElement>('.block-grab');
      grab?.setAttribute('aria-pressed',String(selected));
    }
  }
  toggle(unit:CopyUnit) {
    if(!this.selected.size)this.known.clear();
    this.nativeActive=false;this.hold(); window.getSelection()?.removeAllRanges();
    this.selected=toggleUnit(this.selected,unit);this.message='';clearTimeout(this.timer);
    this.refresh();this.publish();
    if(!this.selected.size)this.clear();
  }
  begin(event:MouseEvent,root:HTMLElement,edit:(offset?:number)=>void) {
    const target=event.target as Element;
    if(event.button!==0 || target.closest('button,input'))return;
    const unit=getCopyUnit(target.closest('[data-copy-unit]')) || getCopyUnit(root);
    if(!unit)return;
    if(!this.selected.size)this.known.clear();
    this.refresh();this.hold();
    const rootFrom=getCopyUnit(root)?.target?.from;
    let offset=unit.target && rootFrom!==undefined ? unit.target.from-rootFrom : Number(target.closest<HTMLElement>('[data-source-offset]')?.dataset.sourceOffset || 0);
    const plain=target.closest<HTMLElement>('.pair-plain-text');
    if(plain){
      const caret=document.caretRangeFromPoint?.(event.clientX,event.clientY);
      if(caret && plain.contains(caret.startContainer)){const range=document.createRange();range.selectNodeContents(plain);range.setEnd(caret.startContainer,caret.startOffset);offset=Number(plain.dataset.sourceOffset)+range.toString().length;}
    }
    this.point={x:event.clientX,y:event.clientY};
    this.gesture={x:event.clientX,y:event.clientY,shift:event.shiftKey,moved:false,anchor:unit,baseline:new Map(this.selected),edit,offset};
    event.stopPropagation();
    if(event.shiftKey) {
      this.nativeActive=false;event.preventDefault();window.getSelection()?.removeAllRanges();
      this.selected=toggleUnit(this.selected,unit);this.view.dom.classList.add('copy-collecting');this.view.focus();this.refresh();this.publish();
    } else {this.nativeActive=true;this.refresh();}
  }
  private sourceUnit(element:HTMLElement):CopyUnit|undefined {
    const position=this.view.posAtDOM(element,0);
    let node=syntaxTree(this.view.state).resolveInner(position,1);
    while(node.parent && !/^(Paragraph|ATXHeading[1-6]|SetextHeading[12]|FencedCode|IndentedCode|BulletList|OrderedList|Pair|Table)$/.test(node.name))node=node.parent;
    if(node.name==='Document') {
      const line=this.view.state.doc.lineAt(position);
      if(line.text.trim())return undefined;
      const unit:CopyUnit={id:`block:${line.from}:${line.to}`,position:line.from,ordinal:-1,parents:[],kind:'block',anchorOnly:true,markdown:'',text:'',from:line.from,to:line.to};
      this.known.set(unit.id,unit);return unit;
    }
    const id=`block:${node.from}:${node.to}`;const cached=this.known.get(id);if(cached){const unit={...cached,from:node.from,to:node.to};this.known.set(id,unit);return unit;}
    const source=this.view.state.doc.sliceString(node.from,node.to);const pair=node.name==='Pair' ? parsePairs(source)[0] : undefined;
    const markdown=pair ? pair.key==='ENV' ? `ENV: ${ENV_MASK}` : maskedContent(source.slice(pair.valueFrom,pair.valueTo)) : maskedContent(source);
    const code=node.getChild('CodeText');
    const unit:CopyUnit={id,position:node.from,ordinal:-1,parents:[],kind:code ? 'code' : 'block',markdown,text:code ? this.view.state.doc.sliceString(code.from,code.to) : plainMarkdown(markdown),from:node.from,to:node.to};
    this.known.set(id,unit);return unit;
  }
  private documentDown=(event:MouseEvent)=>{
    if(event.button!==0 || event.shiftKey)return;
    const target=event.target as Element;
    if(target.closest('.copy-toolbar,.block-grab,.outline-toggle,.pair-edit'))return;
    if(this.selected.size || this.view.state.field(heldPreviewSelection))this.clear();
  };
  private sourceDown=(event:MouseEvent)=>{
    const line=(event.target as Element).closest<HTMLElement>('.cm-line');
    if(event.button!==0 || !line || (event.target as Element).closest('button'))return;
    if(!this.selected.size)this.known.clear();
    const unit=this.sourceUnit(line);if(!unit)return;
    this.point={x:event.clientX,y:event.clientY};
    this.gesture={x:event.clientX,y:event.clientY,shift:event.shiftKey,moved:false,anchor:unit,baseline:new Map(this.selected),edit:()=>{},offset:0,source:true};
    if(event.shiftKey){
      this.nativeActive=false;event.preventDefault();event.stopImmediatePropagation();this.hold();window.getSelection()?.removeAllRanges();
      this.selected=toggleUnit(this.selected,unit);this.view.focus();this.refresh();this.publish();
    }
  };
  private existingSelection() {
    const selection=window.getSelection();
    if(!selection?.rangeCount || selection.isCollapsed || !selection.anchorNode || !selection.focusNode ||
      !this.view.dom.contains(selection.anchorNode) || !this.view.dom.contains(selection.focusNode))return [];
    const range=selection.getRangeAt(0),candidates:CopyUnit[]=[];
    for(const element of this.view.dom.querySelectorAll<HTMLElement>('[data-copy-unit],.cm-line')) {
      if(!range.intersectsNode(element))continue;
      // A boundary touching the next sentence does not select its content.
      const overlap=range.cloneRange(),bounds=document.createRange();bounds.selectNodeContents(element);
      if(overlap.compareBoundaryPoints(Range.START_TO_START,bounds)<0)overlap.setStart(bounds.startContainer,bounds.startOffset);
      if(overlap.compareBoundaryPoints(Range.END_TO_END,bounds)>0)overlap.setEnd(bounds.endContainer,bounds.endOffset);
      if(overlap.collapsed || !overlap.toString().length)continue;
      const unit=element.matches('.cm-line') ? this.sourceUnit(element) : getCopyUnit(element);
      if(unit)candidates.push(unit);
    }
    const parents=new Set(candidates.flatMap(unit=>unit.parents));
    return candidates.filter(unit=>!unit.anchorOnly && !parents.has(unit.id));
  }
  private collectExisting(units:CopyUnit[]) {
    if(!units.length)return;
    this.nativeActive=false;this.hold();
    this.selected=new Map(units.map(unit=>[unit.id,unit]));
    window.getSelection()?.removeAllRanges();this.view.focus();this.refresh();this.publish();
  }
  private promote(x:number,y:number) {
    const gesture=this.gesture;if(!gesture || gesture.shift)return;
    gesture.shift=true;this.nativeActive=false;this.hold();window.getSelection()?.removeAllRanges();this.view.focus();
    this.view.dom.classList.remove('copy-native-selection');this.view.dom.classList.add('copy-collecting');
    this.refresh();
    for(const line of this.view.dom.querySelectorAll<HTMLElement>('.cm-line'))this.sourceUnit(line);
    this.selected=toggleUnit(gesture.baseline,gesture.anchor);
    const last=this.atPoint(x,y);if(last)this.selectRange(last);else {this.refresh();this.publish();}
  }
  private atPoint(x:number,y:number) {
    const target=document.elementFromPoint(x,y);
    if(!target || !this.view.dom.contains(target))return undefined;
    const line=target.closest<HTMLElement>('.cm-line');
    return line ? this.sourceUnit(line) : getCopyUnit(target.closest('[data-copy-unit]'));
  }
  private selectRange(last:CopyUnit) {
    const gesture=this.gesture;if(!gesture)return;
    const blockMode=gesture.anchor.id.startsWith('block:');
    if(blockMode && !last.id.startsWith('block:')) last=this.known.get(last.parents.find(id=>id.startsWith('block:')) || '') || last;
    const ordered=orderedUnits(this.known.values()).filter(unit=>blockMode ? unit.id.startsWith('block:') : !unit.id.startsWith('block:'));
    const start=ordered.findIndex(unit=>unit.id===gesture.anchor.id),end=ordered.findIndex(unit=>unit.id===last.id);
    if(start<0 || end<0)return;
    let selected=new Map(gesture.baseline);
    // Prefer leaf units so selecting a sentence never also selects its container.
    const range=ordered.slice(Math.min(start,end),Math.max(start,end)+1);
    const parentIds=new Set(range.flatMap(unit=>unit.parents));
    for(const unit of range) {
      if(parentIds.has(unit.id))continue;
      if(!selected.has(unit.id))selected=toggleUnit(selected,unit);
    }
    this.selected=selected;this.message='';clearTimeout(this.timer);this.refresh();this.publish();
  }
  private autoScroll=()=>{
    this.frame=0;if(!this.gesture?.shift || !this.point)return;
    const bounds=this.view.scrollDOM.getBoundingClientRect();
    const distance=this.point.y>bounds.bottom-40 ? Math.min(24,(this.point.y-bounds.bottom+40)/2) : this.point.y<bounds.top+40 ? -Math.min(24,(bounds.top+40-this.point.y)/2) : 0;
    if(!distance)return;
    const previous=this.view.scrollDOM.scrollTop;this.view.scrollDOM.scrollTop+=distance;
    this.refresh();
    const unit=this.atPoint(this.point.x,Math.max(bounds.top+4,Math.min(bounds.bottom-4,this.point.y)));
    if(unit)this.selectRange(unit);
    if(previous!==this.view.scrollDOM.scrollTop)this.frame=requestAnimationFrame(this.autoScroll);
  };
  private move=(event:MouseEvent)=>{
    const gesture=this.gesture;if(!gesture)return;
    if(Math.hypot(event.clientX-gesture.x,event.clientY-gesture.y)>4)gesture.moved=true;
    this.point={x:event.clientX,y:event.clientY};
    if(event.shiftKey && !gesture.shift)this.promote(event.clientX,event.clientY);
    if(!gesture.moved || !gesture.shift)return;
    this.refresh();
    event.preventDefault();this.point={x:event.clientX,y:event.clientY};
    const unit=this.atPoint(event.clientX,event.clientY);if(unit)this.selectRange(unit);
    if(!this.frame)this.frame=requestAnimationFrame(this.autoScroll);
  };
  private up=(event:MouseEvent)=>{
    const gesture=this.gesture;if(!gesture || event.button!==0)return;
    cancelAnimationFrame(this.frame);this.frame=0;
    this.view.dom.classList.remove('copy-collecting');
    if(gesture.shift){this.gesture=null;this.refresh();this.publish();return;}
    if(gesture.source){this.gesture=null;return;}
    if(!gesture.moved) {
      this.selected.clear();this.gesture=null;this.view.dom.classList.remove('copy-native-selection');
      window.getSelection()?.removeAllRanges();this.publish();gesture.edit(gesture.offset);
    } else {
      // A plain drag stays precise. Shift is the explicit upgrade to collection.
      this.gesture=null;this.publish();
    }
  };
  replace(text:string,event='input.type') {
    if(!this.selected.size)return false;
    const plan=replacementPlan(this.selected.values(),text.replace(/\r\n?/g,'\n'),this.view.state.doc.toString());
    if(!plan.changes.length)return false;
    this.clear(false);window.getSelection()?.removeAllRanges();
    this.view.dispatch({
      changes:plan.changes.map(change=>({...change,insert:change.insert.replace(/\n/g,this.view.state.lineBreak)})),
      selection:{anchor:plan.cursor},effects:holdPreview.of(null),userEvent:event,
      annotations:isolateHistory.of('before'),scrollIntoView:true,
    });
    this.view.focus();return true;
  }
  private hasNativeSelection(){const selection=window.getSelection();return !!(this.nativeActive && selection && !selection.isCollapsed && selection.anchorNode && this.view.dom.contains(selection.anchorNode));}
  private within(target:EventTarget|null) {return (target instanceof Node && this.scope.contains(target)) || this.scope.contains(document.activeElement) || this.hasNativeSelection();}
  private adoptNative() {
    if(this.selected.size || !this.nativeActive)return;
    const selection=window.getSelection();if(!selection || selection.isCollapsed || !selection.rangeCount)return;
    this.selected=new Map(nativeSelectionUnits(this.view.dom,selection.getRangeAt(0)).map(unit=>[unit.id,unit]));
  }
  private onPaste=(event:ClipboardEvent)=>{
    this.adoptNative();
    if(!this.selected.size || !this.within(event.target) || !event.clipboardData)return;
    const text=event.clipboardData.getData('text/plain');
    if(!text && !event.clipboardData.types.includes('text/plain'))return;
    event.preventDefault();event.stopImmediatePropagation();this.replace(text,'input.paste');
  };
  private onCut=(event:ClipboardEvent)=>{
    this.adoptNative();
    if(!this.selected.size || !this.within(event.target) || !event.clipboardData)return;
    event.preventDefault();event.stopImmediatePropagation();event.clipboardData.setData('text/plain',joinUnits(this.selected.values()));this.replace('','delete.cut');
  };
  private onBeforeInput=(event:InputEvent)=>{
    this.adoptNative();
    if(!this.selected.size || !this.within(event.target) || (event.target as Element).closest('button'))return;
    let text=event.data;
    if(event.inputType==='insertParagraph')text='\n';
    if(event.inputType==='insertLineBreak')text='\n';
    if(event.inputType.startsWith('delete'))text='';
    if(text===null)return;
    event.preventDefault();event.stopImmediatePropagation();this.replace(text,event.inputType.startsWith('delete') ? 'delete.selection' : 'input.type');
  };
  private async cut() {
    const doc=this.view.state.doc,signature=[...this.selected.keys()].join('|');
    try {
      await writeClipboard(joinUnits(this.selected.values()));
      if(!this.disposed && this.view.state.doc===doc && [...this.selected.keys()].join('|')===signature)this.replace('','delete.cut');
    } catch {this.feedback('Copy failed; the selected text was kept.',true);}
  }
  private onCopy=(event:ClipboardEvent)=>{
    const active=document.activeElement;
    if(!active || !this.scope.contains(active) || (active as HTMLElement).getAttribute('aria-hidden')==='true')return;
    const selection=window.getSelection();
    // Preserve exact, ordinary text copying when a normal drag selected text.
    const native=this.nativeActive && selection && !selection.isCollapsed && selection.anchorNode && this.view.dom.contains(selection.anchorNode);
    if(!native && !this.selected.size)return;
    const text=native ? selection.toString() : joinUnits(this.selected.values());
    if(!event.clipboardData)return;
    event.preventDefault();event.stopImmediatePropagation();event.clipboardData.setData('text/plain',text);this.feedback('Copied');
  };
  private onKey=(event:KeyboardEvent)=>{
    if(event.key==='Shift' && !this.selected.size) {
      const units=this.existingSelection();
      if(this.gesture && !this.gesture.shift)this.promote(this.point?.x ?? this.gesture.x,this.point?.y ?? this.gesture.y);
      this.collectExisting(units);
    }
    if(event.key==='Escape' && this.nativeActive){event.preventDefault();event.stopPropagation();this.clear();this.view.focus();return;}
    const editingKey=(!event.ctrlKey && !event.metaKey && !event.altKey && (event.key.length===1 || ['Enter','Backspace','Delete'].includes(event.key))) || ((event.ctrlKey || event.metaKey) && ['x','v'].includes(event.key.toLowerCase()));
    const nativeEditing=editingKey && this.hasNativeSelection();
    if(editingKey)this.adoptNative();
    if(!this.selected.size || (!this.scope.contains(document.activeElement) && !nativeEditing))return;
    if(nativeEditing && (event.ctrlKey || event.metaKey) && event.key.toLowerCase()==='v')this.view.focus();
    if(event.key==='Escape') {
      event.preventDefault();event.stopPropagation();this.clear();this.view.focus();return;
    }
    if(event.key==='Tab') {
      event.preventDefault();event.stopPropagation();
      const buttons=this.scope.querySelectorAll<HTMLButtonElement>('.copy-toolbar button');
      const index=[...buttons].indexOf(document.activeElement as HTMLButtonElement);
      const next=index<0 ? event.shiftKey ? buttons.length-1 : 0 : (index+(event.shiftKey ? -1 : 1)+buttons.length)%buttons.length;
      buttons[next]?.focus();return;
    }
    if(event.key.startsWith('Arrow')) {event.preventDefault();event.stopImmediatePropagation();this.clear();this.view.focus();runScopeHandlers(this.view,event,'editor');return;}
    const mod=event.ctrlKey || event.metaKey;
    if(mod && event.key.toLowerCase()==='a') {event.preventDefault();event.stopImmediatePropagation();this.clear();this.view.focus();runScopeHandlers(this.view,event,'editor');return;}
    const target=event.target as Element;
    if(target.closest('input,textarea,.copy-toolbar'))return;
    if(target.closest('.block-grab') && ['Enter',' '].includes(event.key))return;
    if(['Backspace','Delete'].includes(event.key)){event.preventDefault();event.stopImmediatePropagation();this.replace('','delete.selection');return;}
    if(mod && event.key.toLowerCase()==='x'){event.preventDefault();event.stopImmediatePropagation();void this.cut();return;}
    if(!mod && !event.altKey && !event.isComposing) {
      const erase=event.key==='Backspace' || event.key==='Delete';
      const enter=event.key==='Enter';
      const printable=event.key.length===1 || /[^\x00-\x7F]/.test(event.key);
      if(erase || enter || printable) {
        event.preventDefault();event.stopImmediatePropagation();
        this.replace(erase ? '' : enter ? '\n' : event.key,erase ? 'delete.selection' : 'input.type');
      }
    }
  };
  destroy() {
    this.disposed=true;clearTimeout(this.timer);cancelAnimationFrame(this.frame);
    document.removeEventListener('mousedown',this.documentDown,true);
    document.removeEventListener('paste',this.onPaste,true);document.removeEventListener('cut',this.onCut,true);
    document.removeEventListener('beforeinput',this.onBeforeInput,true);
    this.view.dom.removeEventListener('mousedown',this.sourceDown,true);
    document.removeEventListener('mousemove',this.move,true);document.removeEventListener('mouseup',this.up,true);
    document.removeEventListener('copy',this.onCopy,true);document.removeEventListener('keydown',this.onKey,true);
    controllers.delete(this.view);
  }
}
