import { StateEffect, StateField, type EditorState, type Range } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { syntaxTree } from '@codemirror/language';
import { renderBlock } from './markdown-render';
import { pairHeader,parsePairs } from '../../notes/pairs';
import { outlineItems,outlineState,outlineToggleButton,editPairSource,toggleOutline,type OutlineItem } from '../outline';
import { heldPreviewSelection, holdPreview } from '../copy/copy-state';
import { installCopyUnits, getCopyUnit, getCopyPayload, getCopyTarget, copyIcon } from '../copy/copy-units';
import { copyController } from '../copy/copy-controller';

export const setPreviewTheme=StateEffect.define<'light'|'dark'>();
export const previewTheme=StateField.define<'light'|'dark'>({create:()=>'dark',update:(value,tr)=>{for(const effect of tr.effects)if(effect.is(setPreviewTheme))value=effect.value;return value;}});

export const setMarkdownRendering=StateEffect.define<boolean>();
export const markdownRendering=StateField.define<boolean>({create:()=>true,update:(value,tr)=>{for(const effect of tr.effects)if(effect.is(setMarkdownRendering))value=effect.value;return value;}});

export function previewBlocks(state: EditorState) {
  const blocks: Array<{ from: number; to: number }> = [];
  const outline=state.field(outlineState,false);
  const markdown=state.field(markdownRendering,false) ?? true;
  const selection=state.field(heldPreviewSelection,false) || state.selection;
  function collect(parent: import('@lezer/common').SyntaxNode) {
    for (let node = parent.firstChild; node; node = node.nextSibling) {
      if (node.from === node.to || node.to - node.from > 100_000 || node.name === 'OpenPair') continue;
      let editing = selection.ranges.some(range => range.from <= node!.to && range.to >= node!.from);
      if(node.name==='Pair' && !outline?.rawPairs.has(node.from)) {
        const pair=parsePairs(state.doc.sliceString(node.from,node.to))[0];
        if(pair)editing=selection.ranges.some(range=>range.empty ? range.head>=node!.from+pair.valueFrom && range.head<=node!.from+pair.valueTo : range.from<=node!.from+pair.valueTo && range.to>=node!.from+pair.valueFrom);
      }
      if ((node.name==='Pair' || (markdown && /^ATXHeading[1-6]$/.test(node.name))) && outline?.collapsed.has(node.from))blocks.push({from:node.from,to:node.to});
      else if (!editing && (markdown || node.name==='Pair')) blocks.push({from:node.from,to:node.to});
      else if (node.name === 'Pair' && !outline?.rawPairs.has(node.from)) {
        for (let child = node.firstChild; child; child = child.nextSibling) if (child.name === 'Document') collect(child);
      }
    }
  }
  collect(syntaxTree(state).topNode);
  return blocks;
}

const cleanups = new WeakMap<HTMLElement, () => void>();
class MarkdownWidget extends WidgetType {
  constructor(readonly from: number, readonly to: number, readonly source: string,readonly outline?:object,readonly styledPair?:string,readonly theme='dark',readonly markdown=true) { super(); }
  eq(other: MarkdownWidget) { return this.from === other.from && this.to === other.to && this.source === other.source && this.outline===other.outline && this.styledPair===other.styledPair && this.theme===other.theme && this.markdown===other.markdown; }
  toDOM(view: EditorView) {
    const dom = document.createElement('div');
    dom.className = 'markdown-block'+(this.styledPair ? ` pair-body-preview pair-body-${this.styledPair.toLowerCase()}` : ''); dom.tabIndex = 0;
    const pair = pairHeader(this.source.split('\n',1)[0]);
    dom.setAttribute('role', pair ? 'group' : 'button'); dom.setAttribute('aria-label', pair ? `${pair.key} pair` : 'Edit Markdown block');
    const edit = (offset = 0,raw=false) => {
      const parsed=pair ? parsePairs(this.source)[0] : undefined;
      if(parsed && !raw && offset<parsed.valueFrom)offset=parsed.valueFrom;
      copyController(view)?.clear(false);
      const anchor=Math.min(this.to,this.from+offset);
      const heading=outlineItems(view.state).find(item=>item.kind==='heading' && anchor>=item.from && anchor<=item.to);
      const expand=heading && view.state.field(outlineState,false)?.collapsed.has(heading.from) ? [toggleOutline.of(heading.from)] : [];
      view.dispatch({ selection: { anchor }, effects:[holdPreview.of(null),...expand,...(raw ? [editPairSource.of(this.from+offset)] : [])], scrollIntoView: true });
      view.focus();
    };
    dom.addEventListener('mousedown',event=>copyController(view)?.begin(event,dom,edit));
    dom.addEventListener('click', event => {
      event.preventDefault();
      const button = (event.target as Element).closest<HTMLElement>('[data-edit-offset]');
      if (button) edit(Number(button.dataset.editOffset),true);
    });
    dom.addEventListener('keydown', event => {
      if (event.target === dom && (event.key === 'Enter' || event.key === ' ')) {
        event.preventDefault();
        if(event.shiftKey) { const unit=getCopyUnit(dom);if(unit)copyController(view)?.toggle(unit); } else edit();
      }
    });
    cleanups.set(dom, renderBlock(dom, this.source, view,this.theme,this.markdown));
    installCopyUnits(dom,this.source,this.from,this.to);
    decorateOutline(dom,view,this.from,this.to);
    const tools=document.createElement('div');tools.className='block-tools';
    const grab=document.createElement('button');grab.type='button';grab.className='block-grab';
    grab.innerHTML='<svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7 4h1m4 0h1M7 10h1m4 0h1M7 16h1m4 0h1"/></svg>';
    grab.setAttribute('aria-label','Select whole block');grab.setAttribute('aria-pressed','false');grab.title='Select whole block';
    grab.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();const unit=getCopyUnit(dom);if(unit){const controller=copyController(view);const selected=controller?.selected.size===1 && controller.selected.has(unit.id);if(!event.shiftKey)controller?.clear();if(event.shiftKey || !selected)controller?.toggle(unit);}});
    tools.append(grab);
    if(pair?.key!=='ENV') {
      const copy=document.createElement('button');copy.type='button';copy.className='block-copy';copy.innerHTML=copyIcon;
      const code=dom.querySelector<HTMLElement>('pre,.mermaid-diagram');
      copy.setAttribute('aria-label',code && !pair ? 'Copy code' : 'Copy block');copy.title=code && !pair ? 'Copy code' : 'Copy Markdown block';
      copy.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();void copyController(view)?.copy(code && !pair ? getCopyPayload(code)?.direct ?? code.textContent ?? '' : getCopyUnit(dom)!.markdown);});
      tools.append(copy);
    }
    const header=dom.querySelector<HTMLElement>(':scope > .pair > .pair-header');
    const env=dom.querySelector<HTMLElement>(':scope > .pair-env');
    (header || env || dom).append(tools);
    return dom;
  }
  destroy(dom: HTMLElement) { cleanups.get(dom)?.(); cleanups.delete(dom); }
  ignoreEvent() { return true; }
}

function decorateOutline(dom:HTMLElement,view:EditorView,from:number,to:number) {
  const outline=view.state.field(outlineState,false);if(!outline)return;
  const markdown=view.state.field(markdownRendering,false) ?? true;
  const items=outlineItems(view.state).filter(item=>item.from>=from && item.to<=to && (markdown || item.kind==='pair'));
  for(const item of items) {
    if(item.kind==='pair') {
      const card=[...dom.querySelectorAll<HTMLElement>('.pair')].find(card=>Number(card.dataset.sourceOffset)+from===item.from);
      if(!card)continue;
      const header=card.querySelector<HTMLElement>(':scope > .pair-header') || card;
      header.prepend(outlineToggleButton(view,item));
      const value=card.querySelector<HTMLElement>(':scope > .pair-value');if(value)value.hidden=outline.collapsed.has(item.from);
    } else {
      const heading=[...dom.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6')].find(element=>getCopyTarget(element)?.from===item.from);
      if(heading && item.bodyTo>item.bodyFrom)heading.prepend(outlineToggleButton(view,item));
    }
  }
  for(const item of items.filter(item=>item.kind==='heading' && outline.collapsed.has(item.from))) {
    for(const element of dom.querySelectorAll<HTMLElement>('p,h1,h2,h3,h4,h5,h6,li,pre,table,hr,.pair,.mermaid-diagram,[data-source-offset]')) {
      const target=getCopyTarget(element);
      const start=target?.from ?? (element.dataset.sourceOffset!==undefined ? from+Number(element.dataset.sourceOffset) : -1);
      const end=target?.to ?? (element.dataset.sourceEnd!==undefined ? from+Number(element.dataset.sourceEnd) : -1);
      if(start>item.bodyFrom && end<=item.bodyTo && end>=start)element.hidden=true;
    }
  }
}
class OutlineWidget extends WidgetType {
  constructor(readonly item:OutlineItem,readonly footer=false,readonly inline=false){super();}
  eq(other:OutlineWidget){return this.item.from===other.item.from && this.item.to===other.item.to && this.item.label===other.item.label && this.footer===other.footer && this.inline===other.inline;}
  toDOM(view:EditorView) {
    const dom=document.createElement(this.inline ? 'span' : 'div');
    if(this.footer){dom.className='pair-shell-end pair-body-'+this.item.label.toLowerCase();return dom;}
    dom.className=`pair-shell-start pair-body-${this.item.label.toLowerCase()}${this.inline ? ' pair-shell-inline' : ''}`;
    dom.append(outlineToggleButton(view,this.item));
    const label=document.createElement('strong');label.className='pair-label';label.textContent=this.item.label+(this.inline ? ':' : '');dom.append(label);
    const edit=document.createElement('button');edit.type='button';edit.className='pair-edit';edit.textContent='Edit';edit.setAttribute('aria-label',`Edit ${this.item.label} pair`);
    edit.addEventListener('mousedown',event=>{event.preventDefault();event.stopPropagation();});
    edit.addEventListener('click',event=>{event.preventDefault();event.stopPropagation();copyController(view)?.clear(false);view.dispatch({selection:{anchor:this.item.from},effects:[editPairSource.of(this.item.from),holdPreview.of(null)]});view.focus();});
    dom.append(edit);return dom;
  }
  ignoreEvent(){return true;}
}
function decorations(state: EditorState): DecorationSet {
  const markdown=state.field(markdownRendering,false) ?? true;
  const outline=state.field(outlineState,false),items=outline ? outlineItems(state).filter(item=>markdown || item.kind==='pair') : [];
  const caret=state.selection.main;
  const activeLine=state.doc.lineAt(caret.head);
  // Keep the bottom capture line usable after collapsing the note.
  const folds=items.filter(item=>item.kind==='heading' && outline?.collapsed.has(item.from) && item.bodyTo>item.bodyFrom).map(item=>caret.empty && activeLine.number===state.doc.lines && activeLine.from>item.bodyFrom ? {...item,bodyTo:Math.min(item.bodyTo,activeLine.from-1)} : item);
  const insideFold=(from:number,to:number)=>folds.some(item=>from>=item.bodyFrom && to<=item.bodyTo);
  const blocks=previewBlocks(state).filter(block=>!insideFold(block.from,block.to));
  const covered=(from:number,to:number)=>insideFold(from,to) || blocks.some(block=>from>=block.from && to<=block.to);
  const ranges:Range<Decoration>[]=[];
  const selection=state.field(heldPreviewSelection,false) || state.selection;
  const activePairs=items.filter(item=>item.kind==='pair' && !outline?.collapsed.has(item.from) && !items.some(parent=>outline?.rawPairs.has(parent.from) && item.from>=parent.from && item.to<=parent.to) && !covered(item.from,item.to) && selection.ranges.some(range=>range.from<=item.to && range.to>=item.from));
  for(const {from,to} of blocks) {
    const parent=activePairs.filter(item=>from>=item.bodyFrom && to<=item.bodyTo).at(-1);
    ranges.push(Decoration.replace({block:true,widget:new MarkdownWidget(from,to,state.doc.sliceString(from,to),outline,parent?.label,state.field(previewTheme,false) || 'dark',markdown)}).range(from,to));
  }
  for(const item of folds)if(!blocks.some(block=>item.bodyFrom>=block.from && item.bodyTo<=block.to) && !folds.some(parent=>parent!==item && item.from>parent.bodyFrom && item.bodyTo<=parent.bodyTo))ranges.push(Decoration.replace({block:true}).range(item.bodyFrom,item.bodyTo));
  for(const item of activePairs) {
    if(item.block) {
      const first=state.doc.lineAt(item.from),last=state.doc.lineAt(item.to);
      ranges.push(Decoration.replace({block:true,widget:new OutlineWidget(item)}).range(first.from,first.to));
      if(last.from>first.to)ranges.push(Decoration.replace({block:true,widget:new OutlineWidget(item,true)}).range(last.from,last.to));
      for(let n=first.number+1;n<last.number;n++) {
        const line=state.doc.line(n);if(!covered(line.from,line.to))ranges.push(Decoration.line({class:`pair-body-line pair-body-${item.label.toLowerCase()}`}).range(line.from));
      }
    } else if(item.bodyFrom>item.from) {
      ranges.push(Decoration.replace({widget:new OutlineWidget(item,false,true)}).range(item.from,item.bodyFrom));
    }
  }
  return Decoration.set(ranges,true);
}
export const livePreview = StateField.define<DecorationSet>({
  create: decorations,
  update(value, transaction) {
    if (transaction.docChanged || transaction.selection || transaction.effects.some(effect=>effect.is(holdPreview) || effect.is(editPairSource) || effect.is(setPreviewTheme) || effect.is(setMarkdownRendering)) || transaction.startState.field(outlineState,false)!==transaction.state.field(outlineState,false) || syntaxTree(transaction.startState) !== syntaxTree(transaction.state))return decorations(transaction.state);
    return value;
  },
  provide: field => EditorView.decorations.from(field),
});
