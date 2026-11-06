import { parser, GFM } from '@lezer/markdown';
import type { SyntaxNode } from '@lezer/common';
import { pairMarkdown } from '../pairs/pair-markdown';
const sourceParser=parser.configure([GFM,pairMarkdown]);
export function sourceTargets(source:string,offset:number) {
  const tree=sourceParser.parse(source);const used=new Set<string>();
  return (tag:string):{from:number;to:number;continuation?:string;literalFrom?:number;literalTo?:number}|undefined=>{
    const types=tag==='P' ? ['Paragraph'] : tag==='LI' ? ['ListItem'] : tag==='PRE' || tag==='MERMAID' ? ['FencedCode','IndentedCode'] : tag==='TABLE' ? ['Table'] : tag==='PAIR' ? ['Pair'] : tag==='HR' ? ['HorizontalRule'] : [`ATXHeading${tag.slice(1)}`];
    let found:SyntaxNode|undefined;
    const visit=(node:SyntaxNode)=>{
      if(found)return;
      const key=`${node.name}:${node.from}:${node.to}`;
      if(types.includes(node.name)){if(!used.has(key)){found=node;used.add(key);}return;}
      for(let child=node.firstChild;child;child=child.nextSibling)visit(child);
    };
    visit(tree.topNode);if(!found)return undefined;
    const node=found as SyntaxNode;
    const lineStart=source.lastIndexOf('\n',node.from-1)+1;
    const prefix=source.slice(lineStart,node.from);
    const code=node.getChild('CodeText');
    return {literalFrom:code ? offset+code.from : undefined,literalTo:code ? offset+code.to : undefined,from:offset+node.from,to:offset+node.to,continuation:/^ *(?:> ?)+$/.test(prefix) ? prefix : undefined};
  };
}
