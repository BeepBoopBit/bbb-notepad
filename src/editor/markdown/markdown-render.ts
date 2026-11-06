import DOMPurify from 'dompurify';
import { Marked } from 'marked';
import { EditorView } from '@codemirror/view';
import { languages } from '@codemirror/language-data';
import { LanguageDescription } from '@codemirror/language';
import { classHighlighter, highlightTree } from '@lezer/highlight';
import { parsePairs, nextFence, ENV_MASK, maskedContent, type Fence, type Pair } from '../../notes/pairs';
import { setCopyPayload, copyIcon } from '../copy/copy-units';
import { copyController } from '../copy/copy-controller';

const markdown = new Marked({ gfm: true, breaks: true, async: false, tokenizer:{lheading(){ return undefined; }} });
const pendingDiagrams = new Map<string, Promise<string>>();
const diagramCache = new Map<string, string>();
let mermaidModule: Promise<typeof import('mermaid')> | undefined;
let diagramId = 0;
let diagramQueue:Promise<unknown>=Promise.resolve();

async function diagram(source: string,theme:string): Promise<string> {
  const key=theme+'\n'+source;
  const cached = diagramCache.get(key);
  if (cached) return cached;
  const pending = pendingDiagrams.get(key);
  if (pending) return pending;
  const render = (async () => {
    mermaidModule ??= import('mermaid').catch(error => { mermaidModule = undefined; throw error; });
    const { default: mermaid } = await mermaidModule;
    const job=diagramQueue.then(async()=>{
      mermaid.initialize({startOnLoad:false,securityLevel:'strict',theme:theme==='light' ? 'default' : 'dark',layout:'dagre',htmlLabels:false,suppressErrorRendering:true,maxTextSize:50_000,maxEdges:500,fontFamily:'system-ui, sans-serif'});
      return mermaid.render(`bbb-diagram-${++diagramId}`,source);
    });
    diagramQueue=job.catch(()=>{});
    const {svg}=await job;
    const clean = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true }, FORBID_TAGS: ['foreignObject', 'image'] });
    if (diagramCache.size >= 32) diagramCache.delete(diagramCache.keys().next().value!);
    diagramCache.set(key, clean);
    return clean;
  })();
  pendingDiagrams.set(key, render);
  try { return await render; } finally { pendingDiagrams.delete(key); }
}

async function colorCode(element: HTMLElement, code: string, language: string, alive: () => boolean) {
  const descriptor = LanguageDescription.matchLanguageName(languages, language, true);
  if (!descriptor) return;
  const support = await descriptor.load();
  if (!alive()) return;
  const fragment = document.createDocumentFragment();
  let offset = 0;
  highlightTree(support.language.parser.parse(code), classHighlighter, (from, to, classes) => {
    fragment.append(document.createTextNode(code.slice(offset, from)));
    const span = document.createElement('span'); span.className = classes;
    span.textContent = code.slice(from, to); fragment.append(span); offset = to;
  });
  fragment.append(document.createTextNode(code.slice(offset)));
  element.replaceChildren(fragment);
}

// Called only for widgets CodeMirror mounts near the visible viewport.
export function renderBlock(container: HTMLElement, source: string, view: EditorView,theme='dark',renderMarkdown=true): () => void {
  let disposed = false;
  const alive = () => !disposed && container.isConnected;
  const resized = () => view.requestMeasure();
  container.addEventListener('pair-resize',resized);
  appendContent(container, source, 0,0,renderMarkdown);
  container.querySelectorAll('input').forEach(input => { input.disabled = true; });
  const jobs = new Map<HTMLElement,() => void>();
  container.querySelectorAll<HTMLElement>('pre > code').forEach(code => {
    const language = [...code.classList].find(name => name.startsWith('language-'))?.slice(9).toLowerCase();
    if (!language) return;
    const text = code.textContent || '';
    const codePayload={markdown:`\`\`\`${language}\n${text.replace(/\n$/,'')}\n\`\`\``,text,direct:text};
    setCopyPayload(code.parentElement!,codePayload);
    if (language === 'mermaid') {
      const target = document.createElement('div'); target.className = 'mermaid-diagram';
      target.textContent = 'Rendering diagram…'; setCopyPayload(target,codePayload); code.parentElement!.replaceWith(target);
      jobs.set(target,() => {
        if (text.length > 50_000) { target.textContent = 'Diagram is too large to preview. Click to edit its source.'; return; }
        void diagram(text,theme).then(svg => {
          if (!alive()) return;
          target.innerHTML = svg; view.requestMeasure();
        }).catch(() => {
          if (!alive()) return;
          target.replaceChildren();
          const message = document.createElement('p'); message.className = 'diagram-error';
          message.textContent = 'Diagram could not be rendered. Click to edit its source.';
          const fallback = document.createElement('pre'); fallback.textContent = text;
          target.append(message, fallback); view.requestMeasure();
        });
      });
    } else if (text.length <= 100_000) {
      jobs.set(code.parentElement!,() => { void colorCode(code, text, language, alive).catch(() => {}).finally(() => { if (alive()) view.requestMeasure(); }); });
    }
  });
  // Expensive diagram/code work waits until a block is actually visible.
  const observer = new IntersectionObserver(entries => {
    for(const entry of entries)if(entry.isIntersecting) {
      const target=entry.target as HTMLElement,job=jobs.get(target);
      observer.unobserve(target);jobs.delete(target);job?.();
    }
  }, { root: view.scrollDOM, rootMargin: '100px' });
  for(const target of jobs.keys())observer.observe(target);
  return () => { disposed = true; observer.disconnect(); container.removeEventListener('pair-resize',resized); };
}

function separatedMarkdown(source: string) {
  let fence: Fence = null;
  return source.split('\n').map(line => {
    const previous = fence; fence = nextFence(line, fence);
    return !previous && !fence && /^ {0,3}-{3,}[ \t]*$/.test(line) ? `\n${line}\n` : line;
  }).join('\n');
}
function appendMarkdown(container: HTMLElement, source: string, offset: number,renderMarkdown:boolean) {
  if (!source) return;
  const part = document.createElement('div'); part.dataset.sourceOffset = String(offset); part.dataset.sourceEnd=String(offset+source.length);
  if(!renderMarkdown){part.className='pair-plain-text';part.textContent=source;container.append(part);return;}
  part.innerHTML = DOMPurify.sanitize(markdown.parse(separatedMarkdown(source)) as string, {
    USE_PROFILES:{html:true},
    FORBID_TAGS:['style','script','iframe','object','embed','form','img','video','audio','source'],
    FORBID_ATTR:['style','srcset'],
  });
  container.append(part);
}
function appendContent(container: HTMLElement, source: string, offset: number, depth = 0,renderMarkdown=true) {
  if (depth >= 32) { container.textContent = source; return; }
  const pairs = parsePairs(source).filter(pair => pair.parent === null && pair.closed);
  let from = 0;
  for (const pair of pairs) {
    appendMarkdown(container, source.slice(from,pair.from),offset+from,renderMarkdown);
    appendPair(container,pair,source,offset,depth,renderMarkdown); from = pair.to;
  }
  appendMarkdown(container,source.slice(from),offset+from,renderMarkdown);
}
function appendPair(container: HTMLElement, pair: Pair, source: string, offset: number, depth: number,renderMarkdown:boolean) {
  const card = document.createElement('section');
  card.className = `pair pair-${pair.key === 'ENV' ? 'env' : pair.key === 'IDEA' ? 'idea' : pair.key === 'SCRIPT' ? 'script' : 'generic'}`;
  card.dataset.pairKey = pair.key; card.dataset.sourceOffset = String(offset+pair.from); card.dataset.sourceEnd=String(offset+pair.to);
  const header = document.createElement('div'); header.className = 'pair-header';
  const label = document.createElement('strong'); label.className = 'pair-label'; label.textContent = pair.key;
  header.append(label);
  const value = document.createElement('div'); value.className = 'pair-value';
  value.dataset.sourceOffset = String(offset+pair.valueFrom); value.dataset.sourceEnd=String(offset+pair.valueTo);
  const text = source.slice(pair.valueFrom,pair.valueTo);
  setCopyPayload(card,{markdown:pair.key === 'ENV' ? `ENV: ${ENV_MASK}` : maskedContent(text),text:pair.key === 'ENV' ? `ENV: ${ENV_MASK}` : undefined,direct:pair.key === 'ENV' ? text : undefined});
  if (pair.key === 'ENV') {
    let revealed = false;
    value.textContent = ENV_MASK; value.classList.add('pair-secret');
    const eye = document.createElement('button'); eye.className = 'pair-eye'; eye.type = 'button';
    function refresh() {
      eye.setAttribute('aria-label',`${revealed ? 'Hide' : 'Reveal'} ENV value`);
      eye.setAttribute('aria-pressed',String(revealed));
      eye.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>${revealed ? '' : '<path d="m3 3 18 18"/>'}</svg>`;
      value.textContent = revealed ? text : ENV_MASK;
    }
    refresh();
    eye.addEventListener('mousedown',event => event.stopPropagation());
    eye.addEventListener('click',event => {event.stopPropagation(); revealed = !revealed; refresh(); card.dispatchEvent(new Event('pair-resize',{bubbles:true}));});
    label.textContent = 'ENV:';
    const copy=document.createElement('button'); copy.type='button';copy.className='pair-copy';copy.innerHTML=copyIcon;
    copy.setAttribute('aria-label','Copy ENV value');copy.title='Copy value';
    copy.addEventListener('mousedown',event=>{event.preventDefault();event.stopPropagation();});
    copy.addEventListener('click',event=>{
      event.preventDefault();event.stopPropagation();
      const editor=EditorView.findFromDOM(card.closest('.cm-editor')!);
      if(editor)void copyController(editor)?.copy(text);
    });
    card.append(label,value,eye,copy); container.append(card);
    return;
  } else if (pair.block || pair.key === 'IDEA' || pair.key === 'SCRIPT') appendContent(value,text,offset+pair.valueFrom,depth+1,renderMarkdown);
  else value.textContent = text;
  const edit = document.createElement('button'); edit.className = 'pair-edit'; edit.type = 'button';
  edit.textContent = 'Edit'; edit.setAttribute('aria-label',`Edit ${pair.key} pair`); edit.dataset.editOffset = String(offset+pair.from);
  header.append(edit); card.append(header,value); container.append(card);
}
