import {test,expect} from 'vitest';
import {prepareBetaManifest} from './publish-beta-feed.mjs';
const url='https://github.com/example/app/releases/download/v0.2.1-beta/setup.exe';
const release={tag_name:'v0.2.1-beta',draft:false,prerelease:true,assets:[{name:'setup.exe',url:'https://api.github.com/assets/123',browser_download_url:url}]};
const manifest=()=>({version:'0.2.1-beta',platforms:{'windows-x86_64':{signature:'signed',url:release.assets[0].url}}});
test('beta feed uses the published installer URL and preserves the signature',()=>{expect(prepareBetaManifest(release,manifest()).platforms['windows-x86_64']).toEqual({signature:'signed',url});});
test('older or repeated publications cannot roll the beta feed backwards',()=>{for(const version of ['0.2.1-beta','0.2.2-beta','0.10.0-beta'])expect(prepareBetaManifest(release,manifest(),{version})).toBeNull();expect(prepareBetaManifest(release,manifest(),{version:'0.2.0-beta'})).not.toBeNull();});
test('drafts, stable releases, mismatched versions and missing signatures are rejected',()=>{for(const changes of [{draft:true},{prerelease:false},{tag_name:'v0.2.2-beta'}])expect(()=>prepareBetaManifest({...release,...changes},manifest())).toThrow();const bad=manifest();bad.platforms['windows-x86_64'].signature='';expect(()=>prepareBetaManifest(release,bad)).toThrow();bad.platforms['windows-x86_64']={signature:'signed',url:'https://other.test/setup.exe'};expect(()=>prepareBetaManifest(release,bad)).toThrow();});
