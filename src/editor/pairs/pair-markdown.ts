import type { MarkdownConfig } from '@lezer/markdown';
import { tags } from '@lezer/highlight';
import { pairHeader, nextFence, type Fence } from '../../notes/pairs';

let parsingDepth = 0;
export const pairMarkdown: MarkdownConfig = {
  defineNodes:[{name:'Pair',block:true},{name:'OpenPair',block:true},{name:'PairKey',style:tags.propertyName}],
  // In bbb-notes three or more hyphens always separate ideas, rather than
  // interpreting the preceding line as an underlined Markdown heading.
  remove:['SetextHeading'],
  parseBlock:[{
    name:'Pair',before:'FencedCode',
    endLeaf:(_cx,line) => !!pairHeader(line.text) || /^ {0,3}-{3,}[ \t]*$/.test(line.text),
    parse(cx,line) {
      if (line.basePos || line.indent >= 4) return false;
      const header = pairHeader(line.text); if (!header) return false;
      const from = cx.lineStart;
      const children = [cx.elt('PairKey',from+header.keyOffset,from+header.keyOffset+header.key.length)];
      if (header.value !== '{') {
        const to = from+line.text.length;
        cx.nextLine(); cx.addElement(cx.elt('Pair',from,to,children)); return true;
      }
      let depth = 1; let fence: Fence = null; let closed = false; let to = from+line.text.length;
      const bodyStart = to+1; const body: string[] = [];
      while (cx.nextLine()) {
        to = cx.lineStart+line.text.length;
        const oldFence = fence; fence = nextFence(line.text,fence);
        if (!oldFence && !fence) {
          if (/^ {0,3}}[ \t]*$/.test(line.text)) {
            depth--;
            if (depth === 0) { closed = true; break; }
          } else if (pairHeader(line.text)?.value === '{') depth++;
        }
        body.push(line.text);
      }
      if (body.length && parsingDepth < 32) {
        parsingDepth++;
        try { children.push(cx.elt(cx.parser.parse(body.join('\n')),bodyStart)); } finally { parsingDepth--; }
      }
      if (closed) cx.nextLine();
      cx.addElement(cx.elt(closed ? 'Pair' : 'OpenPair',from,to,children));
      return true;
    },
  }],
};
