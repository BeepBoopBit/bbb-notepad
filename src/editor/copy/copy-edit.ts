import type { CopyUnit } from './copy-model';
export type SentencePart={markdown:string;separator:string};
export type CopyTarget={from:number;to:number;part?:number;parts?:SentencePart[];continuation?:string;literalFrom?:number;literalTo?:number};
export type CopyChange={from:number;to:number;insert:string};

// Rebuild only an affected paragraph when its sentence formatting crosses a
// sentence boundary. Remaining Markdown stays balanced (for example **a. b.**).
export function replacementPlan(units:Iterable<CopyUnit>,insert:string,source:string) {
  const groups=new Map<string,{target:CopyTarget;whole:boolean;selected:Set<number>}>();
  for(const unit of units) {
    const target=unit.target ?? (unit.from!==undefined && unit.to!==undefined ? {from:unit.from,to:unit.to} : undefined);
    if(!target)continue;
    const key=`${target.from}:${target.to}`;
    let group=groups.get(key);if(!group){group={target,whole:false,selected:new Set()};groups.set(key,group);}
    if(target.part===undefined)group.whole=true;else group.selected.add(target.part);
  }
  const ordered=[...groups.values()].sort((a,b)=>a.target.from-b.target.from || b.target.to-a.target.to);
  const ranges=ordered.filter((item,i)=>!ordered.slice(0,i).some(parent=>parent.whole && parent.target.from<=item.target.from && parent.target.to>=item.target.to));
  const changes:CopyChange[]=[];let cursor=0;
  for(let index=0;index<ranges.length;index++) {
    const {target,whole,selected}=ranges[index];let value='';let marker=0;
    const replacement=index===0 ? insert : '';
    if(whole || !target.parts || selected.size===target.parts.length) {
      value=replacement;marker=value.length;
    } else {
      let placed=false;
      for(let part=0;part<target.parts.length;part++) {
        const item=target.parts[part];
        if(selected.has(part)) {
          if(index===0 && !placed){
            if(replacement){value+=(value ? item.separator : '')+replacement;marker=value.length;}
            else marker=value.length;
            placed=true;
          }
          continue;
        }
        value+=(value ? item.separator : '')+item.markdown;
      }
    }
    if(target.continuation) {
      marker+=target.continuation.length*(value.slice(0,marker).match(/\n/g)?.length || 0);
      value=value.replace(/\n/g,'\n'+target.continuation);
    }

    let to=target.to;
    // Remove the following empty paragraph boundary when deleting whole blocks.
    if(!value && source.slice(to,to+2)==='\n\n')to+=2;
    const previous=changes.at(-1);
    if(previous && previous.to>target.from)previous.to=target.from;
    changes.push({from:target.from,to,insert:value});
    if(index===0)cursor=target.from+marker;
  }
  return {changes,cursor};
}
