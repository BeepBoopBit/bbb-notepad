import type { CopyTarget } from './copy-edit';
export type CopyUnit = {
  id:string; position:number; ordinal:number; parents:string[];
  anchorOnly?:boolean;
  kind:'sentence'|'block'|'code'|'pair'; group?:string; from?:number; to?:number;
  markdown:string; text:string;target?:CopyTarget;separator?:string;
};
export function orderedUnits(units:Iterable<CopyUnit>):CopyUnit[] {
  return [...units].sort((a,b)=>a.position-b.position || a.ordinal-b.ordinal || a.id.localeCompare(b.id));
}
export function toggleUnit(selected:Map<string,CopyUnit>,unit:CopyUnit) {
  const next = new Map(selected);
  if(unit.anchorOnly)return next;
  if (next.has(unit.id)) { next.delete(unit.id); return next; }
  for (const [id,item] of next) if (unit.parents.includes(id) || item.parents.includes(unit.id)) next.delete(id);
  next.set(unit.id,unit); return next;
}
export function joinUnits(units:Iterable<CopyUnit>,plain=false) {
  const ordered = orderedUnits(units);
  const ids = new Set(ordered.map(unit=>unit.id));
  let result=''; let previous:CopyUnit|undefined;
  for (const unit of ordered) {
    if (unit.parents.some(id=>ids.has(id))) continue;
    const value=plain ? unit.text : unit.markdown;
    let text=plain && unit.kind==='code' ? value.trimEnd() : value.trim();
    if (!text) continue;
    const sameParagraph = unit.kind==='sentence' && previous?.kind==='sentence' && unit.group===previous.group;
    if(sameParagraph && !plain) {
      const prefix=/^(?:> ?)+/.exec(text)?.[0];
      if(prefix && previous?.markdown.startsWith(prefix))text=text.slice(prefix.length);
    }
    result += (result ? sameParagraph ? plain ? (unit.separator?.includes('\n') ? '\n' : ' ') : unit.separator ?? ' ' : '\n\n' : '')+text;
    previous=unit;
  }
  return result;
}
