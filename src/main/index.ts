import { app, BrowserWindow, dialog, ipcMain, protocol, session, shell } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { OrganizerService } from './service.js';
import { resolveProjectRoot, ensureProjectDirectories } from './paths.js';
import { previewImage } from './images.js';
import { isVideoFile, previewVideo } from './videos.js';
import type { Progress } from '../shared/types.js';
const root=resolveProjectRoot(__dirname);ensureProjectDirectories(root);
for(const [key,folder] of [['appData','data/browser'],['userData','data/browser/user'],['sessionData','data/browser/session'],['logs','data/logs'],['temp','data/temp'],['crashDumps','data/browser/crashes']] as const){const directory=path.join(root,folder);fs.mkdirSync(directory,{recursive:true});app.setPath(key,directory);}
app.setName('截图整理助手');
protocol.registerSchemesAsPrivileged([{scheme:'shot',privileges:{standard:true,secure:true,supportFetchAPI:true}}]);
let window:BrowserWindow|undefined;let service:OrganizerService|undefined;let quitting=false;
function sendProgress(progress:Progress):void{if(window&&!window.isDestroyed())window.webContents.send('screenshots:progress',progress);}
const hasLock=app.requestSingleInstanceLock();if(!hasLock)app.exit();
app.on('second-instance',()=>{window?.show();window?.focus();});
function handle(name:string,task:(...args:any[])=>unknown):void{
  ipcMain.handle(`screenshots:${name}`,(event,...args)=>{if(!window||event.sender!==window.webContents||event.senderFrame!==window.webContents.mainFrame)throw new Error('调用来源无效');return task(...args);});
}
if(hasLock)app.whenReady().then(async()=>{
  service=new OrganizerService(root,sendProgress);
  protocol.handle('shot',async request=>{
    try{const url=new URL(request.url);if(url.hostname!=='image')return new Response('Not found',{status:404});const file=await service!.previewPath(decodeURIComponent(url.pathname.slice(1)));const full=url.searchParams.get('full')==='1';const data=await (isVideoFile(file)?previewVideo(root,file,full):previewImage(file,full));return new Response(new Uint8Array(data),{headers:{'Content-Type':'image/png','Cache-Control':'no-store'}});}
    catch{return new Response('Image unavailable',{status:404});}
  });
  handle('getState',()=>service!.state());
  handle('saveSettings',settings=>service!.saveSettings(settings));
  handle('chooseFolders',async kind=>{
    if(kind!=='source'&&kind!=='output')throw new Error('目录类型无效');
    const result=await dialog.showOpenDialog(window!,{title:kind==='source'?'选择截图文件夹':'选择整理目录',defaultPath:kind==='output'?service!.store.settings().outputFolder:undefined,properties:kind==='source'?['openDirectory','multiSelections']:['openDirectory','createDirectory']});return result.canceled?[]:result.filePaths;
  });
  handle('scan',()=>service!.scan());handle('analyze',(ids,force)=>service!.analyze(ids,force));
  handle('buildPlan',choices=>service!.plan(choices));handle('applyPlan',id=>service!.apply(id));
  handle('undoBatch',id=>service!.undo(id));handle('recover',(id,action)=>service!.recover(id,action));
  handle('stop',()=>service!.stop());handle('prepareModel',()=>service!.prepareModel());handle('runtimeStatus',()=>service!.status());
  handle('reveal',async id=>shell.showItemInFolder(await service!.previewPath(id)));
  try{await service.runtime.start();}catch(error){fs.appendFileSync(path.join(root,'data/logs/application.log'),`${new Date().toISOString()} ${(error as Error).message}\n`);}
  window=new BrowserWindow({width:1440,height:960,minWidth:1024,minHeight:700,title:'截图整理助手',backgroundColor:'#F3F6FA',autoHideMenuBar:true,webPreferences:{preload:path.join(__dirname,'../preload/index.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
  window.webContents.on('will-navigate',event=>event.preventDefault());
  session.defaultSession.webRequest.onBeforeRequest((details,callback)=>callback({cancel:!details.url.startsWith('file:')&&!details.url.startsWith('shot:')&&!details.url.startsWith('devtools:')}));
  window.webContents.on('console-message',details=>{if(details.level==='error')fs.appendFileSync(path.join(root,'data/logs/renderer.log'),`${details.message}\n`);});
  await window.loadFile(path.join(__dirname,'../../renderer/index.html'));
}).catch(error=>{dialog.showErrorBox('启动失败',(error as Error).message);app.exit(1);});
app.on('window-all-closed',()=>app.quit());
app.on('before-quit',event=>{if(quitting||!service)return;event.preventDefault();quitting=true;void service.shutdown().finally(()=>app.exit());});
