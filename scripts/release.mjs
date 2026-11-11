import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {releaseVersion,setVersion,configureRepository,createManifest} from './release-utils.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
try{
  const [command,...args]=process.argv.slice(2);
  if(command==='configure'){const repo=configureRepository(root,args[0] || '');console.log(`Update source configured for ${repo}.`);}
  else if(command==='version')console.log(`Version set to ${setVersion(root,args[0] || '')}`);
  else if(command==='verify'){
    const version=releaseVersion(root),tag=args[0];if(tag && tag!==`v${version}`)throw new Error(`Release tag must be v${version}.`);console.log(`bbb-notepad ${version}: versions match.`);
  } else if(command==='manifest'){
    const [repository,artifacts,notesFile,output='latest.json']=args;if(!artifacts)throw new Error('Usage: npm run release:manifest -- owner/repo installer-directory [release-notes-file] [output-file]');
    const manifest=createManifest(root,repository,path.resolve(artifacts),notesFile ? fs.readFileSync(notesFile,'utf8') : '');fs.writeFileSync(output,JSON.stringify(manifest,null,2)+'\n');console.log(`Wrote ${output}`);
  } else if(command==='build'){
    releaseVersion(root);if(!process.env.TAURI_SIGNING_PRIVATE_KEY)throw new Error('Set TAURI_SIGNING_PRIVATE_KEY to your updater key file before building. See RELEASING.md.');
    const config=JSON.parse(fs.readFileSync(path.join(root,'src-tauri/tauri.conf.json'),'utf8'));if(!config.plugins.updater.endpoints.length)console.log('Building an installer without a release feed. Configure the repository before your first public release.');
    const result=spawnSync(process.execPath,[path.join(root,'node_modules/@tauri-apps/cli/tauri.js'),'build',...args],{cwd:root,stdio:'inherit',env:process.env});if(result.error)throw result.error;process.exitCode=result.status ?? 1;
  }else throw new Error('Choose configure, version, verify, manifest, or build.');
}catch(error){console.error(error.message);process.exitCode=1;}
