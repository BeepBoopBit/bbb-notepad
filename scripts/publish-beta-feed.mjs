import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import semver from 'semver';
import {pathToFileURL} from 'node:url';

export function prepareBetaManifest(release,manifest,current){
  const version=release.tag_name.replace(/^v/,'');
  if(release.draft || !release.prerelease || !semver.valid(version) || !semver.prerelease(version))throw new Error('Expected a published versioned prerelease.');
  if(manifest.version!==version)throw new Error('Manifest version does not match the release.');
  if(current){
    if(!semver.valid(current.version))throw new Error('Existing beta feed has an invalid version.');
    if(semver.lte(version,current.version))return null;
  }
  if(!manifest.platforms || !Object.keys(manifest.platforms).length)throw new Error('Manifest has no platforms.');
  for(const platform of Object.values(manifest.platforms)){
    if(!platform.signature?.trim())throw new Error('Missing updater signature.');
    const asset=release.assets.find(asset=>asset.browser_download_url===platform.url || asset.url===platform.url);
    if(!asset || !asset.name.endsWith('.exe'))throw new Error('Updater URL must reference this release’s installer.');
    platform.url=asset.browser_download_url;
  }
  return manifest;
}

function publish(){
  const repository=process.env.GITHUB_REPOSITORY;
  const event=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
  const release=event.release;
  const gh=(...args)=>execFileSync('gh',args,{encoding:'utf8',stdio:['ignore','pipe','inherit']});
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'bbb-beta-feed-'));
  try{
    gh('release','download',release.tag_name,'--repo',repository,'--pattern','latest.json','--dir',directory);
    const manifest=JSON.parse(fs.readFileSync(path.join(directory,'latest.json'),'utf8'));
    const releases=JSON.parse(gh('api',`repos/${repository}/releases`,'--paginate','--slurp')).flat();
    const channel=releases.find(item=>item.tag_name==='beta-channel');
    let current;
    if(channel?.assets.some(asset=>asset.name==='latest.json')){
      const previous=path.join(directory,'previous');fs.mkdirSync(previous);
      gh('release','download','beta-channel','--repo',repository,'--pattern','latest.json','--dir',previous);
      current=JSON.parse(fs.readFileSync(path.join(previous,'latest.json'),'utf8'));
    }
    const prepared=prepareBetaManifest(release,manifest,current);
    if(!prepared){console.log('Beta feed already has this version or a newer version.');return;}
    fs.writeFileSync(path.join(directory,'latest.json'),JSON.stringify(prepared,null,2)+'\n');
    if(!channel)gh('release','create','beta-channel','--repo',repository,'--target',release.target_commitish,'--title','Beta update channel','--notes','Update metadata only. Download installers from versioned releases.','--prerelease','--draft');
    gh('release','upload','beta-channel',path.join(directory,'latest.json'),'--repo',repository,'--clobber');
    if(!channel || channel.draft)gh('release','edit','beta-channel','--repo',repository,'--draft=false','--prerelease','--latest=false');
    console.log(`Beta feed now points to ${prepared.version}.`);
  }finally{fs.rmSync(directory,{recursive:true,force:true});}
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href)publish();
