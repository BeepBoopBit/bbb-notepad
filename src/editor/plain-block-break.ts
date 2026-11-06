export function plainBlockBreak(_source:string,from:number,_to:number,_soft:boolean) {
  return {insert:'\n',head:from+1};
}
