import {invoke} from '@tauri-apps/api/core';
import {desktop} from '../platform/environment';
export type OpenedFile={name:string;content:string;encoding:string;unsupported:boolean;truncated:boolean};
export const MAX_FILE_BYTES=16*1024*1024;
const PREVIEW_BYTES=64*1024;
export function decodeFile(name:string,bytes:Uint8Array):OpenedFile {
  if(bytes.length>MAX_FILE_BYTES)throw new Error('File is too large to open (maximum 16 MiB).');
  let content:string|undefined,encoding='UTF-8',invalid=false;
  const control=(text:string)=>/[\x00-\x08\x0b\x0e-\x1f\x7f-\x9f]/.test(text);
  const bom=bytes.length>=2 && ((bytes[0]===255 && bytes[1]===254) || (bytes[0]===254 && bytes[1]===255));
  const pairs=Math.floor(Math.min(bytes.length,4096)/2);let even=0,odd=0;
  for(let i=0;i<pairs*2;i++)if(bytes[i]===0){if(i%2)odd++;else even++;}
  const le=pairs>=2 && odd*10>=pairs*3 && even*20<=pairs,be=pairs>=2 && even*10>=pairs*3 && odd*20<=pairs;
  if(bom || le || be) {
    const little=bom ? bytes[0]===255 : le;encoding=little ? 'UTF-16 LE' : 'UTF-16 BE';
    const body=bom ? bytes.subarray(2) : bytes;
    let text:string;
    try{text=new TextDecoder(little ? 'utf-16le' : 'utf-16be',{fatal:true,ignoreBOM:true}).decode(body);}catch{text=new TextDecoder(little ? 'utf-16le' : 'utf-16be',{ignoreBOM:true}).decode(body);invalid=true;}
    if(!control(text))content=text;
  } else {
    const body=bytes[0]===239 && bytes[1]===187 && bytes[2]===191 ? bytes.subarray(3) : bytes;
    try{const text=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(body);if(!control(text))content=text;}
    catch{if(!body.some(byte=>(byte<32 && ![9,10,12,13].includes(byte)) || byte===127)){encoding='Windows-1252';content=new TextDecoder('windows-1252').decode(body);}}
  }
  const binary=content===undefined;
  if(binary){encoding='ASCII preview';content=Array.from(bytes.subarray(0,PREVIEW_BYTES),byte=>[9,10,13].includes(byte) || (byte>=32 && byte<=126) ? String.fromCharCode(byte) : '·').join('');}
  return {name,content:content!,encoding,unsupported:binary || invalid,truncated:binary && bytes.length>PREVIEW_BYTES};
}
export async function openDesktopFile(){return invoke<OpenedFile|null>('open_text_file');}
export async function saveTextFile(content:string,name:string):Promise<string|null> {
  if(desktop)return invoke('save_text_file',{content,suggestedName:name});
  const url=URL.createObjectURL(new Blob([content],{type:'text/plain;charset=utf-8'}));
  const anchor=document.createElement('a');anchor.href=url;anchor.download=name;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return name;
}
export function fileName(value:string){return value.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/,'').trim().slice(0,100) || 'note.txt';}
