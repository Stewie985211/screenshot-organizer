import {_electron,type ElectronApplication} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {AppState} from '../src/shared/types';

const project=process.cwd(),baseline=process.argv.includes('--baseline');
const root=path.join(project,'output/audit-2026-10-14',`${baseline?'baseline':'desktop'}-${randomUUID().slice(0,8)}`);
const source=path.join(root,'assets/input');
const modelSource=path.resolve(process.argv.find(arg=>arg.startsWith('--models='))?.slice(9)??path.join(project,'data/models'));
const report={root,baseline,scope:'synthetic copies; real Electron IPC and local model; one injected HTTP error',checks:[] as {name:string;passed:boolean;error?:string}[],rendererErrors:[] as string[],stderr:[] as string[],exit:null as unknown};
let desktop:ElectronApplication|undefined;
async function main(){
  await fs.mkdir(source,{recursive:true});await fs.mkdir(path.join(root,'data/temp'),{recursive:true});
  await fs.symlink(path.join(project,'tools'),path.join(root,'tools'),'junction');
  await fs.mkdir(path.join(root,'data/models/blobs'),{recursive:true});await fs.cp(path.join(modelSource,'manifests'),path.join(root,'data/models/manifests'),{recursive:true});
  for(const name of await fs.readdir(path.join(modelSource,'blobs')))await fs.link(path.join(modelSource,'blobs',name),path.join(root,'data/models/blobs',name));
  const file=path.join(source,'可变预览.png');
  await sharp({create:{width:160,height:120,channels:3,background:'#f00000'}}).png().toFile(file);
  const manifest=JSON.parse(await fs.readFile(path.join(project,'data/supervision/manifest.json'),'utf8'));
  const modelFile=path.join(source,'真实模型测试.png');await fs.copyFile(path.join(project,manifest.clearCases[0].file),modelFile);
  desktop=await _electron.launch({executablePath:path.join(project,'output/desktop/win-unpacked/ScreenshotOrganizer.exe'),env:{...process.env,SCREENSHOT_PROJECT_ROOT:root,TEMP:path.join(root,'data/temp'),TMP:path.join(root,'data/temp')},timeout:60000});
  desktop.process().stderr?.on('data',data=>report.stderr.push(String(data)));
  desktop.process().on('exit',(code,signal)=>{report.exit={code,signal};});
  const page=await desktop.firstWindow();page.on('pageerror',error=>report.rendererErrors.push(error.message));
  page.setDefaultTimeout(180000);
  await desktop.evaluate(({app,BrowserWindow})=>{
    app.on('before-quit',()=>process.stderr.write('AUDIT before-quit '+new Error().stack+'\n'));
    app.on('window-all-closed',()=>process.stderr.write('AUDIT window-all-closed\n'));
    const window=BrowserWindow.getAllWindows()[0];window.on('close',()=>process.stderr.write('AUDIT window-close\n'));
    window.webContents.on('render-process-gone',(_event,details)=>process.stderr.write('AUDIT renderer-gone '+JSON.stringify(details)+'\n'));
  });
  await page.emulateMedia({reducedMotion:'reduce'});await page.locator('.desktop-shell').waitFor();
  const state=()=>page.evaluate(()=>window.screenshots.getState());
  const idle=()=>page.waitForFunction(()=>!document.querySelector('.progress-banner')&&[...document.querySelectorAll<HTMLButtonElement>('.header-actions button')].every(b=>!b.disabled),null,{timeout:180000});
  const check=async(name:string,task:()=>Promise<void>)=>{try{await task();report.checks.push({name,passed:true});console.log(`PASS ${name}`);}catch(error){report.checks.push({name,passed:false,error:String(error)});console.log(`FAIL ${name}: ${error}`);if(!baseline)throw error;}};
  await page.evaluate(async folder=>{const s=await window.screenshots.getState();await window.screenshots.saveSettings({...s.settings,sourceFolders:[folder]});await window.screenshots.scan();},source);
  await page.reload();await page.locator('.shot-card').first().waitFor();
  await check('原图变更后重新扫描刷新已有缩略图',async()=>{
    const img=page.getByRole('button',{name:'查看 可变预览.png',exact:true}).locator('img');
    await img.waitFor();await page.waitForFunction(()=>[...document.querySelectorAll<HTMLImageElement>('.shot-open img')].every(i=>i.complete&&i.naturalWidth>0));
    const before=await img.screenshot();await fs.writeFile(path.join(root,'preview-before.png'),before);
    await sharp({create:{width:160,height:120,channels:3,background:'#0000f0'}}).png().toFile(file);
    await page.getByRole('button',{name:'重新扫描',exact:true}).click();await idle();
    await page.waitForFunction(()=>[...document.querySelectorAll<HTMLImageElement>('.shot-open img')].every(i=>i.complete&&i.naturalWidth>0));
    const after=await img.screenshot();await fs.writeFile(path.join(root,'preview-after.png'),after);
    const colors=(await sharp(after).stats()).channels;
    assert.ok(colors[2].mean>colors[0].mean+80,'缩略图必须从红色刷新为蓝色');
  });
  await desktop.evaluate(()=>{
    const original=globalThis.fetch;
    let once=true;globalThis.fetch=async(input,init)=>{
      if(String(input).endsWith('/api/chat')&&once){once=false;return new Response('桌面回归模拟 HTTP 500',{status:500});}
      return original(input,init);
    };
  });
  const modelImage=(await state()).images.find(i=>i.path===modelFile)!;
  await page.evaluate(id=>window.screenshots.analyze([id],true),modelImage.id);
  await page.reload();await page.locator('.desktop-shell').waitFor();
  await page.getByRole('button',{name:'查看 真实模型测试.png',exact:true}).click();
  await check('识别失败项有可用的重试入口并能用真实模型恢复',async()=>{
    assert.equal((await state()).images.find(i=>i.id===modelImage.id)?.status,'error');
    assert.equal(await page.getByRole('heading',{name:'本地识别未完成'}).count(),1);
    const retry=page.getByRole('button',{name:'重新识别这张截图',exact:true});
    assert.equal(await retry.count(),1);assert.equal(await retry.isEnabled(),true);
    await retry.click();await idle();
    assert.equal((await state()).images.find(i=>i.id===modelImage.id)?.status,'ready');
  });
  await check('识别失败说明与读取失败说明分开显示',async()=>{
    const current=(await state()).images.find(i=>i.id===modelImage.id)!;
    if(baseline)assert.equal(await page.getByRole('heading',{name:'本地识别未完成'}).count(),1);
    else assert.ok(current.analysis?.title&&current.analysis.categoryId==='study');
  });
  if(!baseline)await check('停止整理后历史显示部分完成及未执行数量',async()=>{
    for(let i=0;i<20;i++)await fs.copyFile(modelFile,path.join(source,`停止副本-${i}.png`));
    const batch=await page.evaluate(async()=>{
      const api=window.screenshots,images=await api.scan();
      const choices=images.filter(i=>i.originalName.startsWith('停止副本-')).map(i=>({imageId:i.id,categoryId:'study',title:i.originalName}));
      const plan=await api.buildPlan(choices);
      const off=api.onProgress(event=>{if(event.phase==='apply'&&event.done===1)void api.stop();});
      try{return await api.applyPlan(plan.id);}finally{off();}
    });
    assert.equal(batch.totalItems,20);assert.ok(batch.records.length>0&&batch.records.length<20);
    assert.ok(batch.records.every(record=>record.stage==='committed'));
    await page.reload();await page.locator('.desktop-shell').waitFor();
    await page.locator('nav[aria-label="主导航"]').getByRole('button',{name:'整理记录',exact:true}).click();
    assert.equal(await page.getByText('部分完成',{exact:true}).count(),1);
    assert.ok((await page.locator('.batch-result').innerText()).includes(`${20-batch.records.length} 张未执行`));
    assert.equal((await fs.readdir(source)).filter(name=>name.startsWith('停止副本-')).length,20-batch.records.length);
  });
  await page.screenshot({path:path.join(root,'desktop.png')});
  assert.deepEqual(report.rendererErrors,[]);
}
void main().catch(error=>{report.checks.push({name:'desktop run',passed:false,error:String(error)});process.exitCode=1;}).finally(async()=>{
  await desktop?.close().catch(error=>{report.stderr.push(String(error));});await fs.writeFile(path.join(root,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify({report:path.join(root,'report.json'),passed:report.checks.filter(c=>c.passed).length,total:report.checks.length}));
});
