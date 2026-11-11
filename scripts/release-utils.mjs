import fs from 'node:fs';
import path from 'node:path';
export function repositoryName(input){
  let value=input;
  if(value.startsWith('https://')){const url=new URL(value);if(url.host!=='github.com' || url.username || url.password || url.search || url.hash)throw new Error('Use a GitHub owner/repository or HTTPS repository URL.');value=url.pathname.replace(/^\//,'').replace(/\/$/,'');}
  value=value.replace(/\.git$/,'');
  if(!/^[A-Za-z0-9][A-Za-z0-9-]*\/[A-Za-z0-9_.-]+$/.test(value) || value.split('/').some(part=>part==='.' || part==='..'))throw new Error('Use a GitHub owner/repository, such as your-name/bbb-notepad.');
  return value;
}
export function validVersion(value){if(!/^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?(?:\+[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/.test(value))throw new Error('Use a semantic version such as 0.1.1.');return value;}
const read=(root,file)=>JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
const write=(root,file,value)=>fs.writeFileSync(path.join(root,file),JSON.stringify(value,null,2)+'\n');
export function releaseVersion(root){
  const version=validVersion(read(root,'package.json').version),config=read(root,'src-tauri/tauri.conf.json');
  const cargo=fs.readFileSync(path.join(root,'src-tauri/Cargo.toml'),'utf8').split('[lib]')[0].match(/^version\s*=\s*"([^"]+)"/m)?.[1];
  if(config.version!==version || cargo!==version)throw new Error('Version mismatch. Run npm run release:version -- <version>.');
  return version;
}
export function setVersion(root,input){
  const version=validVersion(input);
  for(const file of ['package.json','package-lock.json','src-tauri/tauri.conf.json']){const data=read(root,file);data.version=version;if(file==='package-lock.json')data.packages[''].version=version;write(root,file,data);}
  const cargo=path.join(root,'src-tauri/Cargo.toml');fs.writeFileSync(cargo,fs.readFileSync(cargo,'utf8').replace(/^(version\s*=\s*")[^"]+(".*)$/m,`$1${version}$2`));
  const lock=path.join(root,'src-tauri/Cargo.lock');if(fs.existsSync(lock))fs.writeFileSync(lock,fs.readFileSync(lock,'utf8').replace(/(\[\[package\]\]\r?\nname = "bbb-notepad"\r?\nversion = ")[^"]+/,`$1${version}`));
  return version;
}
export function configureRepository(root,input){
  const repository=repositoryName(input),config=read(root,'src-tauri/tauri.conf.json');
  const route=releaseVersion(root).split('+')[0].includes('-') ? 'download/beta-channel' : 'latest/download';
  config.plugins.updater.endpoints=[`https://github.com/${repository}/releases/${route}/latest.json`];write(root,'src-tauri/tauri.conf.json',config);return repository;
}
export function createManifest(root,repository,artifacts,notes=''){
  const version=releaseVersion(root),repo=repositoryName(repository);
  const matches=fs.readdirSync(artifacts).filter(name=>name.startsWith(`bbb-notepad_${version}_`) && name.endsWith('_x64-setup.exe'));
  if(matches.length!==1)throw new Error(`Expected exactly one bbb-notepad ${version} x64 installer in ${artifacts}.`);
  const name=matches[0],signature=fs.readFileSync(path.join(artifacts,name+'.sig'),'utf8').trim();if(!signature)throw new Error('Installer signature is empty.');
  return {version,notes,pub_date:new Date().toISOString(),platforms:{'windows-x86_64':{signature,url:`https://github.com/${repo}/releases/download/${encodeURIComponent('v'+version)}/${encodeURIComponent(name)}`}}};
}
