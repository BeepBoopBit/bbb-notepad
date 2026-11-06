import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { maskedContent } from '../../notes/pairs';
import { Marked } from 'marked';
import DOMPurify from 'dompurify';
import type { CopyUnit } from './copy-model';
import { sourceTargets } from './copy-source';
import type { SentencePart,CopyTarget } from './copy-edit';

const converter = new TurndownService({headingStyle:'atx',codeBlockStyle:'fenced',bulletListMarker:'-',emDelimiter:'*'});
converter.use(gfm);converter.addRule('plainLineBreak',{filter:'br',replacement:()=> '\n'}); converter.remove(node=>node.nodeName.toLowerCase()==='button' || node.nodeName.toLowerCase()==='svg');
export type CopyPayload = { markdown:string; text?:string; direct?:string };
const plainParser=new Marked({gfm:true,async:false});
const payloads = new WeakMap<HTMLElement,CopyPayload>();
const units = new WeakMap<HTMLElement,CopyUnit>();
const elementTargets=new WeakMap<HTMLElement,CopyTarget>();
const elementSources=new WeakMap<HTMLElement,string>();
export const copyIcon = '<svg viewBox="0 0 20 20" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2"/><path d="M12 7V4a1 1 0 0 0-1-1H4a1 1 0 0 0-1 1v7a1 1 0 0 0 1 1h3"/></svg>';
export function setCopyPayload(element:HTMLElement,payload:CopyPayload) { payloads.set(element,payload); }
export function getCopyPayload(element:HTMLElement) { return payloads.get(element); }
export function getCopyUnit(element:Element|null) { return element ? units.get(element as HTMLElement) : undefined; }
export function getCopyTarget(element:HTMLElement) { return elementTargets.get(element) || units.get(element)?.target; }
function addUnit(element:HTMLElement,unit:CopyUnit) {
  element.dataset.copyUnit=unit.id; element.classList.add('copy-unit'); units.set(element,unit);
}
export function cleanText(element:HTMLElement) {
  const clone=element.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('button,.pair-header').forEach(node=>node.remove());
  function text(node:Node):string {
    if(node.nodeType===Node.TEXT_NODE)return node.textContent || '';
    if(!(node instanceof HTMLElement))return '';
    if(node.tagName==='BR')return '\n';
    if(node.tagName==='PRE')return (node.textContent || '')+'\n\n';
    const content=[...node.childNodes].map(text).join('');
    return /^(P|DIV|SECTION|H[1-6]|LI|TR|BLOCKQUOTE)$/.test(node.tagName) ? content+'\n\n' : content;
  }
  return text(clone).replace(/\n{3,}/g,'\n\n').trim();
}
function sliceIndex(root:HTMLElement) {
  const bounds=new WeakMap<Node,{start:number;end:number}>();let offset=0;
  function visit(node:Node) {const start=offset;if(node.nodeType===Node.TEXT_NODE)offset+=(node.textContent || '').length;else if(node.nodeName==='BR')offset++;else for(const child of node.childNodes)visit(child);bounds.set(node,{start,end:offset});}
  visit(root);return bounds;
}
function cloneSlice(root:HTMLElement,from:number,to:number,bounds:WeakMap<Node,{start:number;end:number}>) {
  function visit(node:Node):Node|null {
    const range=bounds.get(node)!;if(range.end<=from || range.start>=to)return null;
    if(node.nodeType===Node.TEXT_NODE)return document.createTextNode((node.textContent || '').slice(Math.max(0,from-range.start),to-range.start));
    if(!(node instanceof HTMLElement) || node.matches('button'))return null;
    const clone=node.cloneNode(false) as HTMLElement;
    for(const child of node.childNodes) {const part=visit(child);if(part)clone.append(part);}
    return clone.childNodes.length || clone.tagName==='BR' ? clone : null;
  }
  return visit(root) as HTMLElement|null;
}
export function plainMarkdown(source:string) {
  const element=document.createElement('div');
  element.innerHTML=DOMPurify.sanitize(plainParser.parse(source) as string,{FORBID_TAGS:['img','svg','script','style','iframe','video','audio','source']});
  return cleanText(element);
}
export function markdownFromElement(element:HTMLElement) {
  const wrapper=document.createElement('div');
  if(element.tagName==='LI' && element.parentElement?.tagName==='OL') {
    const list=element.parentElement.cloneNode(false) as HTMLOListElement;
    list.start=(element.parentElement as HTMLOListElement).start+[...element.parentElement.children].indexOf(element);
    list.append(element.cloneNode(true));wrapper.append(list);
  } else wrapper.append(element.cloneNode(true));
  return converter.turndown(wrapper).trim();
}

// Unit metadata lives in WeakMaps, not data attributes containing note/ENV values.
export function installCopyUnits(root:HTMLElement,source:string,position:number,to:number) {
  const rootId=`block:${position}:${to}`;
  const pair=root.querySelector<HTMLElement>(':scope > .pair');
  const payload=pair ? payloads.get(pair) : undefined;
  const code=root.querySelector<HTMLElement>('pre,.mermaid-diagram');
  const codePayload=code ? payloads.get(code) : undefined;
  addUnit(root,{id:rootId,position,ordinal:-1,parents:[],kind:code && !pair ? 'code' : 'block',target:{from:position,to},markdown:payload?.markdown ?? maskedContent(source),text:payload?.text ?? codePayload?.text ?? (code ? code.textContent || '' : cleanText(root))});
  let ordinal=0;
  const elements=[...root.querySelectorAll<HTMLElement>('.pair,p,h1,h2,h3,h4,h5,h6,li,pre,table,.mermaid-diagram,hr')];
  const idByElement=new Map<HTMLElement,string>();
  const targetByContainer=new Map<HTMLElement,ReturnType<typeof sourceTargets>>();
  for (const element of elements) {
    if (element.closest('pre')!==element && element.closest('pre')) continue;
    if (element.matches('p') && element.closest('li,table,.pair-env')) continue;
    if (element.matches('li') && element.parentElement?.closest('li')) continue;
    const parentElements:HTMLElement[]=[];
    for(let parent=element.parentElement;parent && parent!==root;parent=parent.parentElement) if(idByElement.has(parent)) parentElements.unshift(parent);
    const parents=[rootId,...parentElements.map(parent=>idByElement.get(parent)!)];
    const container=element.closest<HTMLElement>('[data-source-offset]')!;
    const relative=Number(container?.dataset.sourceOffset || 0);
    let targets=targetByContainer.get(container);
    if(!targets){targets=sourceTargets(source.slice(relative,Number(container?.dataset.sourceEnd ?? source.length)),position+relative);targetByContainer.set(container,targets);}
    const target=targets(element.matches('.pair') ? 'PAIR' : element.matches('.mermaid-diagram') ? 'MERMAID' : element.tagName);
    const id=`unit:${position}:${relative}:${ordinal++}`; idByElement.set(element,id);
    const ownPayload=payloads.get(element);
    if(!target)continue;
    elementTargets.set(element,target);elementSources.set(element,source.slice(target.from-position,target.to-position));
    if (element.matches('p') && !element.closest('li,table')) {
      const logicalText=(node:Node):string=>node.nodeType===Node.TEXT_NODE ? node.textContent || '' : node.nodeName==='BR' ? '\n' : [...node.childNodes].map(logicalText).join('');
      const text=logicalText(element);
      const segments=typeof Intl.Segmenter==='function' ? [...new Intl.Segmenter(undefined,{granularity:'sentence'}).segment(text)] : [{segment:text,index:0}];
      const spans:HTMLElement[]=[];const bounds=sliceIndex(element);const parts:SentencePart[]=[];
      for(let i=0;i<segments.length;i++) {
        const {segment,index}=segments[i]; if(!segment.trim()) continue;
        const span=document.createElement('span'); span.className='copy-sentence';
        const fragment=cloneSlice(element,index,index+segment.length,bounds);
        if(fragment) span.append(...fragment.childNodes);
        const context=element.closest('blockquote') ? document.createElement('blockquote') : document.createElement('div');
        context.append(span.cloneNode(true));
        const separator=i>0 && /\n/.test(segments[i-1].segment.match(/\s*$/)?.[0] || '') ? '\n' : ' ';
        const part=parts.length;parts.push({markdown:markdownFromElement(span),separator});
        addUnit(span,{target:target ? {...target,part,parts} : undefined,separator,id:`${id}:s${i}`,position:position+relative,ordinal:ordinal++,parents,kind:'sentence',group:id,markdown:markdownFromElement(context),text:segment.trim()});
        spans.push(span);
      }
      if(spans.length) element.replaceChildren(...spans);
    } else {
      const kind=element.matches('.pair') ? 'pair' : element.matches('pre,.mermaid-diagram') ? 'code' : 'block';
      addUnit(element,{target,id,position:position+relative,ordinal:ordinal++,parents,kind,markdown:ownPayload?.markdown ?? markdownFromElement(element),text:ownPayload?.text ?? (element.tagName==='PRE' ? element.textContent || '' : cleanText(element))});
    }
  }
  for(const element of root.querySelectorAll<HTMLElement>('.pair-plain-text')) {
    const relative=Number(element.dataset.sourceOffset),end=Number(element.dataset.sourceEnd);
    const target={from:position+relative,to:position+end};elementTargets.set(element,target);
    const parents=[rootId];for(let parent=element.parentElement;parent && parent!==root;parent=parent.parentElement){const id=idByElement.get(parent);if(id)parents.push(id);}
    addUnit(element,{id:`plain:${position+relative}:${position+end}`,position:position+relative,ordinal:ordinal++,parents,kind:'block',target,markdown:maskedContent(source.slice(relative,end)),text:element.textContent || ''});
  }
  return rootId;
}

function logicalText(node:Node):string {
  return node.nodeType===Node.TEXT_NODE ? node.textContent || '' : node.nodeName==='BR' ? '\n' : [...node.childNodes].map(logicalText).join('');
}
function selectedOffsets(element:HTMLElement,range:Range) {
  function offset(container:Node,index:number,fallback:number) {
    if(!element.contains(container))return fallback;
    const prefix=document.createRange();prefix.setStart(element,0);prefix.setEnd(container,index);return logicalText(prefix.cloneContents()).length;
  }
  return {from:offset(range.startContainer,range.startOffset,0),to:offset(range.endContainer,range.endOffset,logicalText(element).length)};
}
export function nativeSelectionUnits(root:HTMLElement,range:Range):CopyUnit[] {
  const result:CopyUnit[]=[];
  for(const element of root.querySelectorAll<HTMLElement>('p,h1,h2,h3,h4,h5,h6,pre,.pair-plain-text')) {
    const target=elementTargets.get(element);if(!target || !range.intersectsNode(element))continue;
    const text=logicalText(element);const selected=selectedOffsets(element,range);if(selected.from===selected.to)continue;
    if(element.matches('.pair-plain-text')){
      result.push({id:`native:${target.from}`,position:target.from,ordinal:0,parents:[],kind:'code',markdown:text.slice(selected.from,selected.to),text:text.slice(selected.from,selected.to),target:{from:target.from+selected.from,to:target.from+selected.to}});continue;
    }
    if(element.tagName==='PRE' && target.literalFrom!==undefined && target.literalTo!==undefined) {
      result.push({id:`native:${target.from}`,position:target.from,ordinal:0,parents:[],kind:'code',markdown:text.slice(selected.from,selected.to),text:text.slice(selected.from,selected.to),target:{from:target.literalFrom+selected.from,to:Math.min(target.literalTo,target.literalFrom+selected.to)}});continue;
    }
    const bounds=sliceIndex(element);
    function slice(from:number,to:number) {
      if(from===to)return '';
      const part=text.slice(from,to);if(!part.trim())return part;
      const fragment=cloneSlice(element,from,to,bounds);if(!fragment)return '';
      const inline=document.createElement('div');inline.append(...fragment.childNodes);
      return (part.match(/^\s*/)?.[0] || '')+markdownFromElement(inline)+(part.match(/\s*$/)?.[0] || '');
    }
    const prefix=/^H[1-6]$/.test(element.tagName) ? /^#{1,6}[ \t]+/.exec(elementSources.get(element) || '')?.[0] || '' : '';
    const parts:SentencePart[]=[{markdown:prefix+slice(0,selected.from),separator:''},{markdown:slice(selected.from,selected.to),separator:''},{markdown:slice(selected.to,text.length),separator:''}];
    result.push({id:`native:${target.from}`,position:target.from,ordinal:0,parents:[],kind:'sentence',markdown:parts[1].markdown,text:text.slice(selected.from,selected.to),target:{...target,part:1,parts}});
  }
  return result;
}
