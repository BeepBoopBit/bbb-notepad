import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView, keymap, placeholder, drawSelection } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { bracketMatching, syntaxHighlighting } from '@codemirror/language';
import { markdown } from '@codemirror/lang-markdown';
import { languages } from '@codemirror/language-data';
import { classHighlighter } from '@lezer/highlight';
import { GFM } from '@lezer/markdown';
import { livePreview,previewTheme,setPreviewTheme,markdownRendering,setMarkdownRendering } from './markdown/markdown-preview';
import { markdownNavigation } from './markdown/markdown-navigation';
import { pairMarkdown } from './pairs/pair-markdown';
import { pairSuggestionEditing } from './pairs/pair-suggestions';
import { pairEditing } from './pairs/pair-editing';
import type { EditorPosition, NoteEditorHandle } from './editor-types';
import { CopyController, type CopySummary } from './copy/copy-controller';
import { heldPreviewSelection } from './copy/copy-state';
import { blockEditing } from './block-editing';
import { outlineItems,outlineState,toggleOutline,setAllOutline } from './outline';
import { slashCommands } from './slash-commands';
import './markdown.css';

const collapsedNotes=new Map<string,Set<number>>();
type Props = {
  noteId:string;
  theme:'light'|'dark';
  zoom:number;
  initialCommand?:'collapse'|'expand';
  onRenderRequested():void;
  content: string;
  render: boolean;
  onChange(content: string): void;
  initialPosition?: EditorPosition;
  initialMatch?: string;
};
const theme = EditorView.theme({
  '&': { height: '100%', backgroundColor: 'transparent', color: 'var(--text)', fontSize: 'var(--editor-font-size)' },
  '.cm-scroller': { overflow: 'auto', fontFamily: 'ui-monospace, SFMono-Regular, Consolas, monospace', lineHeight: 'var(--editor-line-height)' },
  '.cm-content': { padding: '4px 4px 40px', caretColor: 'var(--caret)' },
  '.cm-line': { padding: '0' },
  '&.cm-focused': { outline: 'none' },
  '.cm-cursor, .cm-dropCursor': { borderLeftColor: 'var(--caret)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--selection)' },
  '.cm-selectionMatch': { backgroundColor: 'var(--hover)' },
  '.cm-placeholder': { color: 'var(--muted)' },
}, {dark:true});

export default forwardRef<NoteEditorHandle, Props>(function MarkdownEditor(props, ref) {
  const host = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const copying=useRef<CopyController|null>(null);
  const [copySummary,setCopySummary]=useState<CopySummary>({count:0,message:'',error:false});
  const renderRequested=useRef(props.onRenderRequested);renderRequested.current=props.onRenderRequested;
  const rendering=useRef(props.render);rendering.current=props.render;
  const onChange = useRef(props.onChange); onChange.current = props.onChange;
  const handle: NoteEditorHandle = {
    getPosition() {
      const editor = view.current!;
      const selection=editor.state.field(heldPreviewSelection) || editor.state.selection;
      return { start:selection.main.from, end:selection.main.to, scroll:editor.scrollDOM.scrollTop };
    },
    focus(position, match) {
      const editor = view.current; if (!editor) return;
      const index = match ? editor.state.doc.toString().toLowerCase().indexOf(match.toLowerCase()) : -1;
      const max = editor.state.doc.length;
      let anchor = index >= 0 ? index : Math.min(position?.start ?? editor.state.selection.main.anchor, max);
      let head = index >= 0 ? index + match!.length : Math.min(position?.end ?? anchor, max);
      const items=outlineItems(editor.state);
      const pair=items.find(item=>item.kind==='pair' && item.block && anchor>=item.from && head<=item.bodyFrom);
      if(pair)anchor=head=pair.bodyFrom;
      const collapsed=editor.state.field(outlineState).collapsed;
      const effects=index>=0 ? items.filter(item=>collapsed.has(item.from) && anchor>=item.from && anchor<=(item.kind==='pair' ? item.to : item.bodyTo)).map(item=>toggleOutline.of(item.from)) : [];
      editor.dispatch({ selection:{anchor,head}, effects, scrollIntoView:index >= 0 });
      editor.focus();
      if (index < 0 && position) requestAnimationFrame(() => { if (view.current === editor) editor.scrollDOM.scrollTop = position.scroll; });
    },
  };
  useImperativeHandle(ref, () => handle);
  useLayoutEffect(() => {
    const state = EditorState.create({
      doc:props.content,
      selection: {anchor: Math.min(props.initialPosition?.start ?? 0, props.content.replace(/\r\n?/g, '\n').length), head: Math.min(props.initialPosition?.end ?? 0, props.content.replace(/\r\n?/g, '\n').length)},
      extensions: [
        EditorState.lineSeparator.of(props.content.includes('\r\n') ? '\r\n' : '\n'),
        heldPreviewSelection, previewTheme.init(()=>props.theme), slashCommands, outlineState.init(()=>({collapsed:new Set(collapsedNotes.get(props.noteId)),rawPairs:new Set()})), history(), drawSelection(), pairSuggestionEditing, pairEditing, blockEditing, markdownNavigation, keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        markdown({ codeLanguages: languages, extensions: [GFM,pairMarkdown], pasteURLAsLink: false }), bracketMatching(), syntaxHighlighting(classHighlighter),
        placeholder('Paste something. Catch a thought.'), EditorView.lineWrapping, theme,
        EditorView.contentAttributes.of({'aria-label':'Note content', spellcheck:'false'}),
        markdownRendering.init(()=>props.render), livePreview,
        EditorView.updateListener.of(update => {
          if(!rendering.current && update.transactions.some(tr=>tr.effects.some(effect=>effect.is(setAllOutline))))renderRequested.current();
          if(update.docChanged) { copying.current?.edited(); onChange.current(update.state.sliceDoc()); }
          copying.current?.refresh();
        }),
      ],
    });
    const editor = new EditorView({state, parent:host.current!}); view.current = editor;
    copying.current=new CopyController(editor,setCopySummary);
    handle.focus(props.initialPosition, props.initialMatch);
    if(props.initialCommand)editor.dispatch({effects:setAllOutline.of(props.initialCommand==='collapse')});
    return () => { collapsedNotes.set(props.noteId,new Set(editor.state.field(outlineState).collapsed));copying.current?.destroy(); copying.current=null; view.current = null; editor.destroy(); };
  }, []);
  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    copying.current?.clear();
    editor.dispatch({effects:setMarkdownRendering.of(props.render)});
    editor.focus();
  }, [props.render]);
  useEffect(()=>{view.current?.dispatch({effects:setPreviewTheme.of(props.theme)});},[props.theme]);
  useEffect(()=>{view.current?.requestMeasure();},[props.zoom]);
  return <div className={`markdown-editor ${props.render ? 'live-preview' : 'source-view'}`}>
    <div className="markdown-editor-host" ref={host}/>
    {copySummary.count>0 && <div className="copy-toolbar" role="toolbar" aria-label="Copy selected sentences and blocks" onMouseDown={event=>event.preventDefault()}>
      <span aria-live="polite">{copySummary.count} selected</span>
      <button onClick={()=>void copying.current?.copySelected()} aria-label="Copy selected Markdown">Copy Markdown</button>
      <button onClick={()=>void copying.current?.copySelected(true)} aria-label="Copy selected plain text">Plain text</button>
      <button onClick={()=>{copying.current?.clear();view.current?.focus();}} aria-label="Clear copied selection" title="Clear (Esc)">Clear</button>
    </div>}
    <div className={`copy-feedback ${copySummary.error ? 'error' : ''}`} role="status" aria-live="polite">{copySummary.message}</div>
  </div>;
});
