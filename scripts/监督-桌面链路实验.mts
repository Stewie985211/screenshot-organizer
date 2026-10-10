import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { performance } from 'node:perf_hooks';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import { _electron } from 'playwright';
import { LocalRuntime } from '../src/main/runtime.js';
import { fileHash, exists } from '../src/main/files.js';

const project=path.resolve(import.meta.dirname,'..');
const packaged=process.argv.includes('--packaged');
const run=path.join(project,'output/监督验收',`desktop-${new Date().toISOString().replace(/[:.]/g,'-')}`);
const appRoot=path.join(run,'隔离应用');const input=path.join(run,'百张测试截图');
await fs.mkdir(input,{recursive:true});await fs.mkdir(appRoot,{recursive:true});
const manifest=JSON.parse(await fs.readFile(path.join(project,'data/supervision/manifest.json'),'utf8'));
const fixture=path.join(project,manifest.clearCases[0].file);const expectedHash=await fileHash(fixture);
const sourceHashes:Record<string,string>={};
for(let i=1;i<=100;i++){
  const name=`${String(i).padStart(3,'0')}_数学截图.png`;const file=path.join(input,name);await fs.copyFile(fixture,file);
  // PNG permits trailing bytes. Unique hashes prevent one cached result from finishing the stress queue before Stop can be clicked.
  if(i>1)await fs.appendFile(file,`supervision-case-${i}`);
  sourceHashes[name]=await fileHash(file);
}
const runtime=new LocalRuntime(project);await runtime.start();assert.ok((await runtime.status()).modelReady,'本地模型必须已就绪');
const ownedRuntimePid=Reflect.get(runtime,'child')?.pid as number|undefined;
await fs.mkdir(path.join(project,'data/temp'),{recursive:true});
const env={...process.env,SCREENSHOT_PROJECT_ROOT:appRoot,TEMP:path.join(project,'data/temp'),TMP:path.join(project,'data/temp')};delete env.ELECTRON_RUN_AS_NODE;
const executable=path.join(project,packaged?'output/desktop/win-unpacked/ScreenshotOrganizer.exe':'node_modules/electron/dist/electron.exe');
const desktop=await _electron.launch({executablePath:executable,args:packaged?[]:[project],cwd:project,env,timeout:60000});
const results:any[]=[];const errors:string[]=[];const evidence:Record<string,unknown>={applicationKind:packaged?'packaged-windows-exe':'development-electron',executable,
  nativeFolderDialog:'用测试目录代替原生文件夹选择框；按钮、IPC、识别、移动和撤销使用真实应用代码',stressDataset:'100张同一合成截图的副本，附加不同PNG尾部字节避免缓存瞬间完成；用于扫描与界面响应，不计作100张识别质量样本'};
evidence.ownedRuntimePid=ownedRuntimePid;
const artifact=path.join(project,'output/desktop/win-unpacked/resources/app.asar');
evidence.packagedAsarSha256=packaged?await fileHash(artifact):undefined;
const codeHashes:Record<string,string>={};for(const file of ['src/main/moves.ts','src/main/files.ts','src/main/service.ts','src/main/runtime.ts','src/renderer/main.tsx','src/renderer/styles.css'])codeHashes[file]=await fileHash(path.join(project,file));
evidence.workspaceSourceHashesAtLaunch=codeHashes;
const page=await desktop.firstWindow();page.on('pageerror',error=>errors.push(error.message));
page.setDefaultTimeout(20000);
async function test(name:string,task:()=>Promise<void>) {
  try{await task();results.push({name,status:'pass'});console.log('PASS '+name);}
  catch(error){const detail=error instanceof Error?`${error.name}: ${error.message}`:String(error);results.push({name,status:'fail',detail});console.log('FAIL '+name+': '+detail);}
}
let imageId='';let target='';let source='';let batchId='';
try {
  await page.waitForSelector('.app-shell',{timeout:60000});
  await test('原生桌面应用启动并显示基本功能',async()=>{
    assert.equal(await page.getByRole('heading',{name:'把截图放回合适的位置'}).count(),1);
    assert.equal(await page.evaluate(()=>typeof window.screenshots.scan),'function');
    assert.ok(await page.getByRole('button',{name:'目录与分类设置',exact:true}).isVisible());
  });
  await test('通过界面选择来源并扫描百张截图',async()=>{
    await desktop.evaluate(({dialog},folder)=>{dialog.showOpenDialog=(async()=>({canceled:false,filePaths:[folder]})) as typeof dialog.showOpenDialog;},input);
    const at=performance.now();await page.getByRole('button',{name:'选择截图文件夹',exact:true}).first().click();
    await page.waitForFunction(()=>document.querySelectorAll('.image-card').length===100,{},{timeout:30000});
    evidence.scan100ElapsedMs=Math.round(performance.now()-at);
    const state=await page.evaluate(()=>window.screenshots.getState());assert.equal(state.images.length,100);
    const item=state.images.find(i=>i.originalName==='001_数学截图.png')!;assert.ok(item);imageId=item.id;source=item.path;
    assert.equal(await fileHash(source),expectedHash);
  });
  await test('BMP缩略图与长截图识别副本可生成',async()=>{
    // Exercise the same production image functions used by the shot protocol and analyzer.
    const {previewImage}=await import('../src/main/images.js');const {recognitionImages}=await import('../src/main/files.js');
    const bmp=path.join(project,manifest.clearCases.find((c:any)=>c.id==='study_history').file);
    const preview=await previewImage(bmp);assert.ok(preview.length>100);await fs.writeFile(path.join(run,'长截图BMP缩略图.png'),preview);
    const crops=await recognitionImages(bmp);assert.equal(crops.length,4);evidence.longScreenshotSegments=crops.length;
  });
  await test('百张网格仍完整显示缩略图、标题与选择框',async()=>{
    const heights=await page.locator('.image-card').evaluateAll(cards=>cards.slice(0,8).map(card=>card.getBoundingClientRect().height));
    evidence.normalWindowCardHeights=heights;assert.ok(heights.every(height=>height>=180),'卡片不能被压缩到缩略图以下');
    const first=page.locator('.image-card').first();await first.scrollIntoViewIfNeeded();
    await page.waitForFunction(()=>{const image=document.querySelector('.image-card .thumbnail img') as HTMLImageElement;return image?.complete&&image.naturalWidth>0;});
  });
  await test('界面调用真实本地模型，识别过程中仍能响应',async()=>{
    await page.getByRole('checkbox',{name:'选择 001_数学截图.png',exact:true}).check();
    await page.getByRole('button',{name:'识别内容',exact:true}).click();
    const at=performance.now();const reply=await page.evaluate(()=>({title:document.title,cards:document.querySelectorAll('.image-card').length}));
    const elapsed=Math.round(performance.now()-at);evidence.inferenceUiRoundTripMs=elapsed;assert.equal(reply.cards,100);assert.ok(elapsed<2000,'识别期间界面响应超过2秒');
    await page.waitForFunction(async id=>{const s=await window.screenshots.getState();const i=s.images.find(i=>i.id===id);return i?.status==='ready'&&!!i.analysis;},imageId,{timeout:200000});
    await page.waitForFunction(()=>!(document.querySelector('.toolbar button:nth-last-child(2)') as HTMLButtonElement)?.disabled);
    const state=await page.evaluate(()=>window.screenshots.getState());const image=state.images.find(i=>i.id===imageId)!;
    evidence.desktopAnalysis=image.analysis;evidence.analysisImage=image;
    assert.equal(image.analysis?.categoryId,'study');assert.ok(/数学|导数|微分/.test(image.analysis?.title??''));
    await page.screenshot({path:path.join(run,'桌面-识别完成.png')});
  });
  await test('人工编辑标题、预览，确认前源文件保持完整',async()=>{
    await page.getByRole('checkbox',{name:'选择 001_数学截图.png',exact:true}).locator('..').locator('..').click({position:{x:90,y:60}}).catch(async()=>{
      await page.locator('.image-card').filter({has:page.getByRole('checkbox',{name:'选择 001_数学截图.png',exact:true})}).click();
    });
    await page.locator('.detail-panel .form-field input').fill('监督桌面整理实验');
    await page.locator('.detail-panel .form-field select').selectOption('work');
    await page.getByRole('button',{name:'预览整理方案',exact:true}).click();
    await page.getByRole('dialog',{name:'整理方案预览'}).waitFor();assert.equal(await fileHash(source),expectedHash);
    const plan=await page.locator('.plan-list strong').first().textContent();target=plan!.trim();assert.equal(await exists(target),false);
    assert.ok(target.includes('工作文档'),'人工修改的分类必须用于目标文件夹');
    await page.screenshot({path:path.join(run,'桌面-整理预览.png')});
  });
  await test('界面确认移动与重命名，目标内容一致',async()=>{
    await page.getByRole('button',{name:'确认移动并重命名',exact:true}).click();
    await page.waitForFunction(async()=>{const s=await window.screenshots.getState();return s.history.some(b=>b.records.some(r=>r.stage==='committed'));});
    const state=await page.evaluate(()=>window.screenshots.getState());batchId=state.history[0].id;
    const record=state.history[0].records[0];assert.equal(record.item.target,target);assert.equal(record.item.source,source);
    assert.equal(await exists(source),false);assert.equal(await fileHash(target),expectedHash);
  });
  await test('刷新后最终人工标题和分类仍保留',async()=>{
    await page.reload();await page.waitForSelector('.app-shell');
    const state=await page.evaluate(()=>window.screenshots.getState());const image=state.images.find(i=>i.id===imageId)!;
    assert.equal(image.analysis?.title,'监督桌面整理实验');assert.equal(image.analysis?.categoryId,'work');
  });
  await test('整理记录按钮可撤销批次并恢复原名原位置',async()=>{
    await page.getByRole('button',{name:'整理记录与撤销',exact:true}).click();
    await page.getByRole('button',{name:'撤销此批次',exact:true}).first().click();
    await page.waitForFunction(async id=>{const s=await window.screenshots.getState();return s.history.find(b=>b.id===id)?.records[0].stage==='undone';},batchId);
    assert.equal(await fileHash(source),expectedHash);assert.equal(await exists(target),false);
    await page.getByRole('dialog',{name:'整理记录'}).getByRole('button',{name:'关闭',exact:true}).click();
  });
  await test('撤销及普通识别保留人工确认，并能再次预览正确方案',async()=>{
    await page.evaluate(id=>window.screenshots.analyze([id],false),imageId);
    await page.reload();await page.waitForSelector('.app-shell');
    const state=await page.evaluate(()=>window.screenshots.getState());const image=state.images.find(i=>i.id===imageId)!;
    assert.equal(image.analysis?.title,'监督桌面整理实验');assert.equal(image.analysis?.categoryId,'work');assert.equal(image.status,'ready');
    await page.getByRole('checkbox',{name:'选择 001_数学截图.png',exact:true}).check();
    await page.getByRole('button',{name:'预览整理方案',exact:true}).click();await page.getByRole('dialog',{name:'整理方案预览'}).waitFor();
    const next=await page.locator('.plan-list strong').first().textContent();assert.ok(next?.includes('工作文档'));assert.ok(next?.includes('监督桌面整理实验'));assert.equal(await fileHash(source),expectedHash);
    await page.getByRole('dialog',{name:'整理方案预览'}).getByRole('button',{name:'关闭',exact:true}).click();
    await page.getByRole('checkbox',{name:'选择 001_数学截图.png',exact:true}).uncheck();
  });
  await test('百张队列识别期间可停止，来源文件不改变',async()=>{
    await page.getByRole('button',{name:'识别内容',exact:true}).click();
    const at=performance.now();await page.evaluate(()=>document.querySelector('h1')!.textContent);evidence.queueUiRoundTripMs=Math.round(performance.now()-at);
    await page.getByRole('button',{name:'停止',exact:true}).click();
    await page.waitForFunction(()=>!(document.querySelector('.notice button')?.textContent==='停止'),{},{timeout:20000});
    assert.equal((await fs.readdir(input)).length,100);
    for(const [name,hash] of Object.entries(sourceHashes))assert.equal(await fileHash(path.join(input,name)),hash);
  });
  await test('最小窗口尺寸仍保留主要操作',async()=>{
    await desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1024,700));
    await page.screenshot({path:path.join(run,'桌面-最小窗口.png')});
    const heights=await page.locator('.image-card').evaluateAll(cards=>cards.slice(0,8).map(card=>card.getBoundingClientRect().height));evidence.minimumWindowCardHeights=heights;
    assert.ok(heights.every(height=>height>=180),'最小窗口卡片仍应完整显示');
    assert.ok(await page.getByRole('button',{name:'识别内容',exact:true}).isVisible());
    assert.ok(await page.getByRole('button',{name:'目录与分类设置',exact:true}).isVisible());
  });
  await test('桌面链路没有未处理的JavaScript异常',async()=>{assert.deepEqual(errors,[]);});
} finally {
  let ownedChildren:number[]=[];
  if(ownedRuntimePid){const r=await promisify(execFile)('powershell.exe',['-NoProfile','-Command',`Get-CimInstance Win32_Process -Filter 'ParentProcessId = ${ownedRuntimePid}' | Select-Object -ExpandProperty ProcessId`],{windowsHide:true});ownedChildren=r.stdout.trim().split(/\s+/).filter(Boolean).map(Number);}
  await desktop.close();await runtime.stop();
  evidence.ownedRuntimeChildren=ownedChildren;
  if(ownedRuntimePid)await test('退出后自有模型服务与推理子进程全部结束',async()=>{
    const alive=(pid:number)=>{try{process.kill(pid,0);return true;}catch{return false;}};
    evidence.runtimeProcessesStopped=[ownedRuntimePid,...ownedChildren].every(pid=>!alive(pid));assert.equal(evidence.runtimeProcessesStopped,true);
  });
  if(packaged)await test('测试期间打包产物版本保持一致',async()=>{assert.equal(await fileHash(artifact),evidence.packagedAsarSha256);});
  const report={timestamp:new Date().toISOString(),runDirectory:run,summary:{pass:results.filter(x=>x.status==='pass').length,fail:results.filter(x=>x.status==='fail').length},results,evidence,errors};
  await fs.writeFile(path.join(run,'结果.json'),JSON.stringify(report,null,2)+'\n');
  await fs.writeFile(path.join(project,'output/监督验收/最新桌面结果.json'),JSON.stringify(report,null,2)+'\n');
  console.log('SUMMARY '+JSON.stringify(report.summary));process.exitCode=report.summary.fail?1:0;
}
