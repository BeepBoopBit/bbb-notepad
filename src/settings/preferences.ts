export type Theme='dark'|'light';
function read(key:string){try{return localStorage.getItem(key);}catch{return null;}}
export function savedTheme():Theme{return read('bbb-notes-theme')==='light' ? 'light' : 'dark';}
export function clampZoom(value:number){return Math.max(50,Math.min(250,Number.isFinite(value) ? value : 100));}
export function savedZoom(){const raw=read('bbb-notes-zoom');return raw ? clampZoom(Number(raw)) : 100;}
export function persistPreference(key:string,value:string){try{localStorage.setItem('bbb-notes-'+key,value);}catch{ /* The preference still applies for this session. */ }}
