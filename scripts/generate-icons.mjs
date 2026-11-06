import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const root=fileURLToPath(new URL('..',import.meta.url));
const work=fs.mkdtempSync(path.join(os.tmpdir(),'bbb-notepad-icons-'));
const cli=path.join(root,'node_modules/@tauri-apps/cli/tauri.js');
function generate(input,output,extra=[]){
  const result=spawnSync(process.execPath,[cli,'icon',input,'--output',output,...extra],{cwd:root,encoding:'utf8'});
  if(result.error)throw result.error;
  if(result.status!==0)throw new Error((result.stderr || result.stdout || 'Icon generation failed.').trim());
}
try{
  const desktop=path.join(work,'desktop');
  // Resize the clean high-resolution master instead of rendering tiny details directly.
  const master=path.join(root,'assets/bbb-notepad-1024.png');
  generate(master,desktop);
  for(const name of fs.readdirSync(desktop)){
    if(/\.(png|ico|icns)$/.test(name))fs.copyFileSync(path.join(desktop,name),path.join(root,'src-tauri/icons',name));
  }
  fs.copyFileSync(path.join(desktop,'icon.png'),path.join(root,'assets/bbb-notepad.png'));
  fs.copyFileSync(path.join(desktop,'32x32.png'),path.join(root,'public/favicon.png'));
  console.log('Generated desktop icons from the original artwork through a 1024px master with filtered downsampling.');
}catch(error){
  console.error(error.message);process.exitCode=1;
}finally{
  fs.rmSync(work,{recursive:true,force:true});
}
