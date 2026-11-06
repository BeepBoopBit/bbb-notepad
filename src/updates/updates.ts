import {version} from '../../package.json';
import {invoke} from '@tauri-apps/api/core';
import {desktop} from '../platform/environment';
import type {Update} from '@tauri-apps/plugin-updater';
export type UpdateStatus={version:string;configured:boolean;desktop:boolean};
export const updates={
  async status():Promise<UpdateStatus>{if(!desktop)return {version,configured:false,desktop:false};return {...await invoke<Omit<UpdateStatus,'desktop'>>('update_status'),desktop:true};},
  async check():Promise<Update|null>{const {check}=await import('@tauri-apps/plugin-updater');return check({timeout:30_000});},
  async backup(){if(desktop)await invoke('prepare_update');},
  async restart(){if(desktop)await invoke('relaunch_after_update');},
};
