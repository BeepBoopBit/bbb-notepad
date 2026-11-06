import {test,expect,type Page} from '@playwright/test';
async function openUpdates(page:Page){await page.getByRole('button',{name:'Settings',exact:true}).click();await page.getByRole('menuitem',{name:'Check for updates'}).click();return page.getByRole('dialog',{name:'Check for updates'});}
async function mockDesktop(page:Page,options:{configured?:boolean;available?:boolean;checkError?:boolean;downloadError?:boolean;backupError?:boolean;saveError?:boolean;pauseInstall?:boolean}={}){
  await page.addInitScript(options=>{
    const win=window as unknown as Record<string,any>;
    win.isTauri=true;let id=0;const callbacks=new Map();
    const session={notes:[{id:'note',content:'Keep this note',updated:1}],tabs:['note'],active:'note'};
    win.updateMock={session,calls:[] as string[],options,installResolve:null};
    win.__TAURI_EVENT_PLUGIN_INTERNALS__={unregisterListener(){}};
    win.__TAURI_INTERNALS__={metadata:{currentWindow:{label:'main'},currentWebview:{label:'main',windowLabel:'main'}},transformCallback(callback:unknown){callbacks.set(++id,callback);return id;},unregisterCallback(value:number){callbacks.delete(value);},async invoke(command:string,args:any={}){
      win.updateMock.calls.push(command);
      if(command==='load_session')return structuredClone(session);
      if(command==='save_note'){if(win.updateMock.options.saveError)throw new Error('Save failed');session.notes=session.notes.map(note=>note.id===args.note.id ? args.note : note);return;}
      if(command==='save_session'){session.tabs=args.tabs;session.active=args.active;return;}
      if(command==='update_status')return {version:'0.1.0',configured:options.configured!==false};
      if(command==='prepare_update'){if(options.backupError)throw new Error('Backup failed');return;}
      if(command==='relaunch_after_update')return;
      if(command==='plugin:updater|check'){if(options.checkError)throw new Error('Connection unavailable');return options.available===false ? null : {rid:1,currentVersion:'0.1.0',version:'0.1.1',body:'New features\n<img src=x onerror=alert(1)>',rawJson:{}};}
      if(command==='plugin:updater|download'){if(options.downloadError)throw new Error('Invalid update signature');args.onEvent.onmessage({event:'Started',data:{contentLength:10}});args.onEvent.onmessage({event:'Progress',data:{chunkLength:10}});args.onEvent.onmessage({event:'Finished'});return 2;}
      if(command==='plugin:updater|install'){if(options.pauseInstall)await new Promise(resolve=>{win.updateMock.installResolve=resolve;});return;}
      if(command==='plugin:window|is_maximized')return false;
      if(command==='plugin:event|listen')return ++id;
      return null;
    }};
  },options);
}

test('browser preview explains desktop updates instead of claiming to be current',async({page})=>{
  await page.goto('/');const dialog=await openUpdates(page);await expect(dialog).toContainText('Updates are available in the desktop app');await expect(dialog).not.toContainText('You’re up to date');await page.keyboard.press('Escape');await expect(dialog).toHaveCount(0);
});
test('an unconfigured desktop build clearly reports no release source without a network check',async({page})=>{
  await mockDesktop(page,{configured:false});await page.goto('/');const dialog=await openUpdates(page);await expect(dialog).toContainText('Updates aren’t configured yet');await expect(dialog).toContainText('Current version 0.1.0');
  expect(await page.evaluate(()=>(window as any).updateMock.calls.includes('plugin:updater|check'))).toBe(false);
});
test('checking is manual and distinguishes latest-version and network-error states',async({page})=>{
  await mockDesktop(page,{available:false});await page.goto('/');await expect(page.getByRole('textbox',{name:'Note content'})).toBeVisible();expect(await page.evaluate(()=>(window as any).updateMock.calls.includes('plugin:updater|check'))).toBe(false);
  await expect(await openUpdates(page)).toContainText('You’re up to date');
});
test('check and signature failures are visible and never install anything',async({page})=>{
  await mockDesktop(page,{downloadError:true});await page.goto('/');const dialog=await openUpdates(page);await expect(dialog).toContainText('0.1.1 is available');await expect(dialog.locator('img')).toHaveCount(0);
  await dialog.getByRole('button',{name:'Download and install'}).click();await expect(dialog.getByRole('alert')).toContainText('Invalid update signature');expect(await page.evaluate(()=>(window as any).updateMock.calls.includes('plugin:updater|install'))).toBe(false);
  await dialog.getByRole('button',{name:'Close',exact:true}).click();await expect(page.getByRole('textbox',{name:'Note content'})).toHaveValue('Keep this note');
});
for(const failure of ['save','backup'])test(`${failure} failure prevents installation and leaves notes editable`,async({page})=>{
  await mockDesktop(page,failure==='backup' ? {backupError:true} : {});await page.goto('/');await page.getByRole('textbox',{name:'Note content'}).fill('Newest unsaved edit');
  if(failure==='save')await page.evaluate(()=>(window as any).updateMock.options.saveError=true);
  const dialog=await openUpdates(page);await expect(dialog).toContainText('0.1.1 is available');await dialog.getByRole('button',{name:'Download and install'}).click();await expect(dialog.getByRole('alert')).toContainText(failure==='save' ? 'Save failed' : 'Backup failed');
  expect(await page.evaluate(()=>(window as any).updateMock.calls.includes('plugin:updater|install'))).toBe(false);
  await dialog.getByRole('button',{name:'Close',exact:true}).click();await page.getByRole('textbox',{name:'Note content'}).fill('Still editable');await expect(page.getByRole('textbox',{name:'Note content'})).toHaveValue('Still editable');
});
test('download, flush, backup, install and restart happen in order; installation blocks edits and shortcuts',async({page})=>{
  await mockDesktop(page,{pauseInstall:true});await page.goto('/');await page.getByRole('textbox',{name:'Note content'}).fill('Newest note');const dialog=await openUpdates(page);await expect(dialog).toContainText('0.1.1 is available');await dialog.getByRole('button',{name:'Download and install'}).click();
  await expect.poll(()=>page.evaluate(()=>(window as any).updateMock.calls.includes('plugin:updater|install'))).toBe(true);
  await expect(page.locator('.editor')).toHaveAttribute('inert','');await page.keyboard.press('Control+t');await expect(page.locator('.tab')).toHaveCount(1);await expect(dialog.getByRole('button',{name:'Close updates'})).toBeDisabled();
  const calls=await page.evaluate(()=>(window as any).updateMock.calls as string[]),backup=calls.indexOf('prepare_update'),install=calls.indexOf('plugin:updater|install');
  expect(calls.lastIndexOf('save_note',backup)).toBeLessThan(backup);expect(calls.lastIndexOf('save_session',backup)).toBeLessThan(backup);expect(calls.indexOf('plugin:updater|download')).toBeLessThan(backup);expect(backup).toBeLessThan(install);
  expect(await page.evaluate(()=>(window as any).updateMock.session.notes[0].content)).toBe('Newest note');await page.evaluate(()=>(window as any).updateMock.installResolve());await expect.poll(()=>page.evaluate(()=>(window as any).updateMock.calls.includes('relaunch_after_update'))).toBe(true);
});
test('network check failure has a retry action and never says up to date',async({page})=>{
  await mockDesktop(page,{checkError:true});await page.goto('/');const dialog=await openUpdates(page);await expect(dialog.getByRole('alert')).toContainText('Connection unavailable');await expect(dialog.getByRole('button',{name:'Check again'})).toBeVisible();await expect(dialog).not.toContainText('You’re up to date');
});
