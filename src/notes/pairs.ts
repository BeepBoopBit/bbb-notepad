export const ENV_MASK = '••••••••';
export type Pair = { key: string; from: number; to: number; valueFrom: number; valueTo: number; block: boolean; closed: boolean; parent: number | null };
export function pairHeader(line: string) {
  const match = /^( {0,3})!([A-Za-z_][A-Za-z0-9_-]*):[ \t]*(.*)$/.exec(line);
  return match ? {key:match[2].toUpperCase(), value:match[3], valueOffset:line.length-match[3].length, keyOffset:match[1].length+1} : null;
}
export type Fence = {char:string; size:number} | null;
export function nextFence(line: string, fence: Fence): Fence {
  const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
  if (!match) return fence;
  if (!fence) return {char:match[1][0],size:match[1].length};
  return match[1][0] === fence.char && match[1].length >= fence.size && !match[2].trim() ? null : fence;
}
export function parsePairs(source: string): Pair[] {
  const pairs: Pair[] = []; const stack: number[] = [];
  let offset = 0; let fence: Fence = null;
  for (const raw of source.split('\n')) {
    const line = raw.endsWith('\r') ? raw.slice(0,-1) : raw;
    const previousFence = fence; fence = nextFence(line,fence);
    if (previousFence || fence) { offset += raw.length+1; continue; }
    if (/^ {0,3}}[ \t]*$/.test(line) && stack.length) {
      const pair = pairs[stack.pop()!]; pair.to = offset+line.length; pair.valueTo = Math.max(pair.valueFrom,offset-(source[offset-2] === '\r' ? 2 : 1)); pair.closed = true;
    } else {
      const header = pairHeader(line);
      if (header) {
        const block = header.value === '{';
        const valueFrom = block ? Math.min(source.length,offset+raw.length+1) : offset+header.valueOffset;
        pairs.push({key:header.key,from:offset,to:block ? source.length : offset+line.length,valueFrom,valueTo:block ? source.length : offset+line.length,block,closed:!block,parent:stack.at(-1) ?? null});
        if (block) stack.push(pairs.length-1);
      }
    }
    offset += raw.length+1;
  }
  return pairs;
}
export function maskedContent(source: string) {
  const ranges = parsePairs(source).filter(pair => pair.key === 'ENV').sort((a,b) => a.valueFrom-b.valueFrom);
  let result = ''; let offset = 0;
  for (const pair of ranges) {
    if (pair.valueFrom < offset) continue;
    result += source.slice(offset,pair.valueFrom)+ENV_MASK; offset=pair.valueTo;
  }
  return result+source.slice(offset);
}
export function searchQuery(query: string) {
  const match = /^pair:([A-Za-z_][A-Za-z0-9_-]*)(?:\s+(.*))?$/is.exec(query.trim());
  return match ? {key:match[1].toUpperCase(),text:match[2] ?? ''} : {key:null,text:query};
}
export function matchesSearch(content: string, query: string) {
  const parsed = searchQuery(query); const needle = parsed.text.toLowerCase();
  return parsed.key ? parsePairs(content).some(pair => pair.key === parsed.key && content.slice(pair.valueFrom,pair.valueTo).toLowerCase().includes(needle)) : content.toLowerCase().includes(needle);
}
export function searchMatch(content: string, query: string) {
  const parsed = searchQuery(query);
  if (!parsed.key) return query;
  const pair = parsePairs(content).find(pair => pair.key === parsed.key && content.slice(pair.valueFrom,pair.valueTo).toLowerCase().includes(parsed.text.toLowerCase()));
  return pair ? content.slice(pair.from,pair.block ? pair.valueFrom : pair.to).trimEnd() : parsed.text;
}
export function pairCompletion(source: string, from: number, to: number, key: string) {
  if (from !== to) return null;
  const start = source.lastIndexOf('\n',from-1)+1;
  const end = source.indexOf('\n',from); const lineEnd = end < 0 ? source.length : end;
  const before = source.slice(start,from); const after = source.slice(from,lineEnd);
  if (key === '{' && /^ {0,3}![A-Za-z_][A-Za-z0-9_-]*:[ \t]*$/.test(before) && !after.trim()) return {insert:'{}',head:from+1};
  if (key === 'Enter' && /^ {0,3}![A-Za-z_][A-Za-z0-9_-]*:[ \t]*{$/.test(before) && after.trim() === '}') {
    const indent = /^ */.exec(before)![0]; const newline = source.includes('\r\n') ? '\r\n' : '\n';
    return {insert:newline+indent+newline+indent,head:from+newline.length+indent.length};
  }
  // Skip an existing auto-inserted closing brace rather than duplicating it.
  if (key === '}' && after.startsWith('}') && /^ {0,3}![A-Za-z_][A-Za-z0-9_-]*:[ \t]*{$/.test(before)) return {insert:'',head:from+1};
  return null;
}

export const supportedPairs=[
  {key:'ENV',block:false,description:'Hidden environment value'},
  {key:'IDEA',block:true,description:'An idea or grouped notes'},
  {key:'SCRIPT',block:true,description:'Presentation and speaking notes'},
] as const;
export function pairSuggestions(source:string,from:number,to=from) {
  if(from!==to)return null;
  const start=source.lastIndexOf('\n',from-1)+1,end=source.indexOf('\n',from);
  if((end<0 ? source.length : end)!==from)return null;
  const match=/^( {0,3})!([A-Za-z_]*)$/.exec(source.slice(start,from));if(!match)return null;
  let fence:Fence=null;for(const line of source.slice(0,start).split('\n'))fence=nextFence(line,fence);
  if(fence)return null;
  const options=supportedPairs.filter(pair=>pair.key.startsWith(match[2].toUpperCase()));
  return options.length ? {from:start+match[1].length,to:from,indent:match[1],query:match[2],options} : null;
}
export function completePair(key:string,block:boolean,indent='') {
  const insert=block ? `!${key}:{\n${indent}\n${indent}}` : `!${key}: `;
  return {insert,head:block ? insert.indexOf('\n')+1+indent.length : insert.length};
}

// Enter leaves the innermost styled IDEA/SCRIPT block without splitting its text.
export function pairExit(source:string,from:number,to=from,rawPairs:Iterable<number>=[]) {
  if(from!==to || !source.includes('!'))return null;
  const pairs=parsePairs(source),raw=new Set(rawPairs);
  if(pairs.some(pair=>raw.has(pair.from) && from>=pair.from && from<=pair.to))return null;
  const pair=pairs.filter(pair=>pair.closed && pair.block && ['IDEA','SCRIPT'].includes(pair.key) && from>=pair.valueFrom && from<=pair.valueTo).at(-1);
  if(!pair)return null;
  const newline=source.includes('\r\n') ? '\r\n' : '\n';
  if(pair.to===source.length)return {from:pair.to,insert:newline,head:pair.to+newline.length};
  const after=pair.to+(source.startsWith('\r\n',pair.to) ? 2 : 1);
  const end=source.indexOf('\n',after),next=source.slice(after,end<0 ? source.length : end);
  return {from:after,insert:next.trim() ? newline : '',head:after};
}
