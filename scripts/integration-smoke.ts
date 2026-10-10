import {_electron,type ElectronApplication,type Page} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileHash,exists} from '../src/main/files';
import type {AppState} from '../src/shared/types';

const project=process.cwd(),packaged=process.argv.includes('--packaged');
const root=path.join(project,'output/integration',`run-${randomUUID().slice(0,8)}`),source=path.join(root,'assets/截图副本');
const runFile=promisify(execFile),requireModule=createRequire(__filename);
const report:{[key:string]:unknown;checks:{name:string;passed:boolean}[]}={root,packaged,sampleScope:'project synthetic copies; actual local model',checks:[]};
const errors:string[]=[],requests:string[]=[],ownedPids=new Set<number>();
let desktop:ElectronApplication|undefined,page:Page;
const check=(name:string)=>{report.checks.push({name,passed:true});console.log(`PASS ${name}`);};
const state=()=>page.evaluate(()=>window.screenshots.getState());
async function waitState(predicate:(state:AppState)=>boolean){const end=Date.now()+180000;while(Date.now()<end){if(predicate(await state()))return;await page.waitForTimeout(250);}throw new Error('等待实际应用状态超时');}
async function idle(){await page.waitForFunction(()=>!document.querySelector('.progress-banner')&&[...document.querySelectorAll<HTMLButtonElement>('.header-actions button')].every(button=>!button.disabled),null,{timeout:180000});}

async function reload(){await page.reload();await page.locator('.desktop-shell').waitFor();}
async function capture(name:string){await desktop!.evaluate(({BrowserWindow})=>{const window=BrowserWindow.getAllWindows()[0];window.show();if(window.isMinimized())window.restore();window.focus();});await page.screenshot({path:path.join(root,`${name}.png`),timeout:60000});}
async function launch(){
  desktop=await _electron.launch({executablePath:packaged?path.join(project,'output/desktop/win-unpacked/ScreenshotOrganizer.exe'):requireModule('electron') as string,args:packaged?[]:[project],env:{...process.env,SCREENSHOT_PROJECT_ROOT:root,TEMP:path.join(root,'data/temp'),TMP:path.join(root,'data/temp')},timeout:60000});
  page=await desktop.firstWindow();await page.emulateMedia({reducedMotion:'reduce'});page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));page.on('request',request=>{if(/^https?:/.test(request.url()))requests.push(request.url());});
  await page.locator('.desktop-shell').waitFor();
  report.appVersion=await desktop.evaluate(({app})=>app.getVersion());if(packaged)assert.equal(report.appVersion,JSON.parse(await fs.readFile(path.join(project,'package.json'),'utf8')).version);
  const pid=await fs.readFile(path.join(root,'data/runtime.pid'),'utf8').catch(()=>'');if(pid)ownedPids.add(Number(pid));
}
async function close(){
  if(!desktop)return;
  for(const pid of [...ownedPids]){
    const result=await runFile('powershell.exe',['-NoProfile','-Command',`Get-CimInstance Win32_Process -Filter 'ParentProcessId = ${pid}' | Select-Object -ExpandProperty ProcessId`],{windowsHide:true});
    for(const value of result.stdout.trim().split(/\s+/).filter(Boolean))ownedPids.add(Number(value));
  }
  await desktop.close();desktop=undefined;
}
async function main(){
  await fs.mkdir(source,{recursive:true});await fs.mkdir(path.join(root,'data/temp'),{recursive:true});
  await fs.symlink(path.join(project,'tools'),path.join(root,'tools'),'junction');
  await fs.mkdir(path.join(root,'data/models/blobs'),{recursive:true});
  await fs.cp(path.join(project,'data/models/manifests'),path.join(root,'data/models/manifests'),{recursive:true});
  for(const name of await fs.readdir(path.join(project,'data/models/blobs')))await fs.link(path.join(project,'data/models/blobs',name),path.join(root,'data/models/blobs',name));
  const manifest=JSON.parse(await fs.readFile(path.join(project,'data/supervision/manifest.json'),'utf8'));
  const samples=manifest.clearCases.slice(0,4);
  for(const sample of samples)await fs.copyFile(path.join(project,sample.file),path.join(source,path.basename(sample.file)));
  const blankName='空白测试.png',badName='损坏测试.png';
  const sharp=requireModule('sharp');await sharp({create:{width:640,height:480,channels:3,background:'#fff'}}).png().toFile(path.join(source,blankName));
  await fs.writeFile(path.join(source,badName),'broken PNG');
  const before=Object.fromEntries(await Promise.all((await fs.readdir(source)).map(async name=>[name,await fileHash(path.join(source,name))])));
  report.originalHashes=before;
  await launch();
  assert.equal((await state()).images.length,0);assert.equal(await page.locator('.shot-card').count(),0);
  assert.ok(await page.getByRole('button',{name:'选择截图文件夹',exact:true}).isVisible());check('真实空图库，无演示数据和默认选中');await capture('01-empty');
  await desktop!.evaluate(({dialog},folder)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder,folder]});},source);
  await page.getByRole('button',{name:'选择文件夹',exact:true}).click();await page.getByRole('button',{name:'添加来源文件夹',exact:true}).click();
  await page.getByRole('button',{name:'保存来源并扫描'}).click();await page.locator('.shot-card').first().waitFor();await idle();
  assert.equal((await state()).settings.sourceFolders.length,1);assert.equal(await page.locator('.shot-card').count(),6);check('原生来源接入、目录去重、六张副本扫描');
  let current=await state();const math=current.images.find(i=>i.originalName===path.basename(samples[0].file))!;
  const broken=current.images.find(i=>i.originalName===badName)!;
  assert.equal(broken.status,'error');assert.ok(await page.getByRole('checkbox',{name:`选择 ${badName}`,exact:true}).isDisabled());check('读取失败项不可勾选');
  await page.getByRole('checkbox',{name:`选择 ${math.originalName}`,exact:true}).isDisabled().then(assert.ok);
  await page.getByRole('button',{name:`查看 ${math.originalName}`,exact:true}).click();
  await page.getByLabel('内容标题',{exact:true}).fill('人工核对草稿');await page.getByLabel('截图分类').selectOption('work');
  assert.ok(await page.getByRole('button',{name:'确认并加入整理'}).isDisabled());
  await page.getByRole('checkbox',{name:'我已核对截图内容'}).check();await page.getByRole('button',{name:'确认并加入整理'}).click();
  assert.ok(await page.getByRole('checkbox',{name:`选择 ${math.originalName}`,exact:true}).isChecked());
  await page.getByLabel('内容标题',{exact:true}).fill('修改后需再确认');assert.ok(await page.getByRole('checkbox',{name:`选择 ${math.originalName}`,exact:true}).isDisabled());
  assert.ok(!(await page.getByRole('checkbox',{name:'我已核对截图内容'}).isChecked()));check('手动整理门槛及编辑后重新核对');
  await page.getByRole('button',{name:'重新扫描',exact:true}).click();await idle();
  await desktop!.evaluate(({dialog})=>{dialog.showOpenDialog=async()=>({canceled:true,filePaths:[]});});
  await page.getByRole('button',{name:'选择文件夹',exact:true}).click();await page.getByRole('button',{name:'添加来源文件夹',exact:true}).click();await idle();
  assert.equal(await page.locator('.import-folders .folder-field').count(),1);
  await page.keyboard.press('Escape');assert.equal((await state()).settings.sourceFolders[0],source);check('取消原生目录选择保留来源');
  await page.locator('.local-card').click();assert.equal(await page.locator('.model-steps .step-ready').count(),3);
  await page.getByRole('button',{name:'检查本地环境'}).click();await idle();await page.getByRole('button',{name:'关闭弹窗'}).click();check('模型三层状态和真实检查');
  await page.locator('.local-card').click();await page.getByRole('button',{name:'准备本地模型',exact:true}).click();await idle();assert.ok((await state()).runtime.modelReady);check('真实模型准备入口（已下载模型）');
  await page.getByRole('button',{name:'开始识别',exact:true}).click();
  await waitState(s=>s.images.filter(i=>i.status==='ready').length===4&&s.images.some(i=>i.status==='review'));
  await idle();current=await state();assert.ok(current.images.filter(i=>i.originalName!==blankName&&i.originalName!==badName).every(i=>i.analysis?.categoryId==='study'));
  assert.ok(!(await page.getByRole('checkbox',{name:`选择 ${blankName}`,exact:true}).isChecked()));
  report.analysis=current.images.map(i=>({name:i.originalName,status:i.status,analysis:i.analysis}));check('真实本地模型四种格式识别，空白待确认');await capture('02-library');
  await page.getByRole('button',{name:'待确认',exact:false}).first().click();await page.locator('.inspector .review-note').waitFor();
  await page.getByLabel('内容标题',{exact:true}).fill('空白样本人工备注');await page.getByLabel('截图分类').selectOption('life');
  assert.ok(await page.getByRole('button',{name:'确认并加入整理'}).isDisabled());
  await page.getByRole('checkbox',{name:'我已核对截图内容'}).check();await capture('03-review');await page.getByRole('button',{name:'确认并加入整理'}).click();
  check('待确认流程、固定确认控件');
  await page.locator('nav[aria-label="主导航"]').getByRole('button',{name:/全部截图/}).click();await page.getByRole('button',{name:'取消选择',exact:true}).click();
  await page.getByLabel('搜索截图').fill('导数');assert.equal(await page.locator('.shot-card').count(),1);await page.getByLabel('搜索截图').fill('');
  await page.getByRole('button',{name:'列表视图'}).click();assert.equal(await page.locator('.shot-row').count(),6);await page.getByRole('button',{name:'网格视图'}).click();check('内容搜索及列表切换');
  await page.getByRole('button',{name:`查看 ${current.images.find(i=>i.id===math.id)!.analysis!.title}`,exact:true}).click();
  await page.getByLabel('内容标题',{exact:true}).fill('整合版导数笔记');await page.getByLabel('截图分类').selectOption('work');
  await page.getByRole('checkbox',{name:`选择 ${math.originalName}`,exact:true}).check();
  await page.getByRole('button',{name:/整理预览/}).click();await page.getByRole('dialog',{name:'整理预览',exact:true}).waitFor();
  const target=await page.locator('.complete-target').innerText();assert.ok(target.includes('工作文档'));assert.ok(target.includes('整合版导数笔记'));
  assert.equal(await fileHash(path.join(source,math.originalName)),before[math.originalName]);await capture('04-plan');check('真实冻结预览、完整路径、原图保持不变');
  await page.getByRole('button',{name:'返回修改'}).click();await page.getByLabel('内容标题',{exact:true}).fill('整合版最终笔记');
  await page.getByRole('button',{name:/整理预览/}).click();assert.ok((await page.locator('.complete-target').innerText()).includes('整合版最终笔记'));check('修改后重新生成预览');
  await page.getByRole('button',{name:'确认整理 1 张'}).click();await page.getByText(/整理完成：1 张成功/).waitFor();await idle();
  let moved=(await state()).images.find(i=>i.id===math.id)!;assert.equal(moved.status,'moved');assert.equal(await exists(path.join(source,math.originalName)),false);assert.equal(await fileHash(moved.path),before[math.originalName]);
  await reload();moved=(await state()).images.find(i=>i.id===math.id)!;assert.equal(moved.confirmed?.title,'整合版最终笔记');assert.equal(moved.confirmed?.categoryId,'work');check('实际移动、内容哈希及刷新人工结果持久化');
  await page.locator('nav[aria-label="主导航"]').getByRole('button',{name:'整理记录',exact:true}).click();
  await page.getByRole('button',{name:/整理 1 张截图/}).click();await fs.writeFile(path.join(source,math.originalName),'用户后续创建的同名文件');
  await page.getByRole('button',{name:'撤销本次整理'}).click();await page.getByRole('button',{name:'确认撤销',exact:true}).click();
  await page.locator('.record-error').waitFor();assert.ok((await page.locator('.record-error').innerText()).includes('原位置已有文件'));assert.equal(await fs.readFile(path.join(source,math.originalName),'utf8'),'用户后续创建的同名文件');
  assert.equal(await fileHash(moved.path),before[math.originalName]);await capture('05-undo-conflict');check('撤销真实冲突逐项显示且不覆盖');
  await fs.unlink(path.join(source,math.originalName));await idle();await page.getByRole('button',{name:'撤销本次整理'}).click();await page.getByRole('button',{name:'确认撤销',exact:true}).click();
  await page.getByText('已恢复原名',{exact:true}).waitFor();await idle();assert.equal(await fileHash(path.join(source,math.originalName)),before[math.originalName]);check('冲突解决后重试撤销');
  await page.locator('nav[aria-label="主导航"]').getByRole('button',{name:/全部截图/}).click();
  await page.getByRole('button',{name:'查看 整合版最终笔记',exact:true}).click();await page.getByRole('checkbox',{name:`选择 ${math.originalName}`,exact:true}).check();
  await page.getByRole('button',{name:'识别所选'}).click();await idle();assert.equal((await state()).images.find(i=>i.id===math.id)?.analysis?.title,'整合版最终笔记');check('普通识别保留人工结果');
  await page.locator('.sidebar-bottom').getByRole('button',{name:'设置',exact:true}).click();await page.getByLabel('包含子文件夹').uncheck();await page.getByRole('button',{name:'添加分类',exact:true}).click();
  await page.getByRole('textbox',{name:'分类名称 新分类',exact:true}).fill('实验分类');await page.getByRole('textbox',{name:'分类描述 实验分类',exact:true}).fill('整合验证的自定义分类');
  await page.getByRole('button',{name:'保存设置',exact:true}).click();await idle();assert.equal((await state()).settings.recursive,false);assert.ok((await state()).settings.categories.some(c=>c.name==='实验分类'));
  await reload();await page.locator('.sidebar-bottom').getByRole('button',{name:'设置',exact:true}).click();assert.ok(!(await page.getByLabel('包含子文件夹').isChecked()));await capture('06-settings');check('递归开关、自定义分类和设置持久化');
  const invalid=source;await desktop!.evaluate(({dialog},folder)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});},invalid);
  await page.getByRole('button',{name:'选择整理目录'}).click();await idle();await page.getByRole('button',{name:'保存设置',exact:true}).click();await page.locator('.operation-notice').waitFor();assert.ok((await page.locator('.operation-notice').innerText()).includes('来源'));check('后端来源与输出分离校验及 IPC 错误展示');
  await page.locator('nav[aria-label="主导航"]').getByRole('button',{name:/全部截图/}).click();
  const many=path.join(root,'assets/百张副本');await fs.mkdir(many,{recursive:true});
  for(let i=0;i<100;i++){const buffer=await fs.readFile(path.join(project,samples[0].file));await fs.writeFile(path.join(many,`${String(i+1).padStart(3,'0')}_数学.png`),Buffer.concat([buffer,Buffer.from(`integration-${i}`)]));}
  await desktop!.evaluate(({dialog},folder)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[folder]});},many);
  await page.getByRole('button',{name:'选择文件夹',exact:true}).click();await page.getByRole('button',{name:'添加来源文件夹',exact:true}).click();await page.getByRole('button',{name:'保存来源并扫描'}).click();await idle();assert.equal(await page.locator('.shot-card').count(),106);
  const layouts:unknown[]=[];
  for(const [width,height] of [[1440,960],[1024,700]]){
    await desktop!.evaluate(({BrowserWindow},size)=>BrowserWindow.getAllWindows()[0].setSize(size[0],size[1]),[width,height]);
    await page.evaluate(()=>new Promise<void>(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve()))));
    await page.locator('.gallery-scroll').evaluate(node=>{node.scrollTop=node.scrollHeight/2;});
    const dimensions=await page.locator('.gallery-scroll').evaluate(node=>({height:node.clientHeight,scrollHeight:node.scrollHeight,cards:[...node.querySelectorAll<HTMLElement>('.shot-card')].map(card=>({height:card.getBoundingClientRect().height,infoBottom:card.querySelector('.shot-info')!.getBoundingClientRect().bottom,bottom:card.getBoundingClientRect().bottom})),overflow:document.documentElement.scrollWidth>window.innerWidth}));
    assert.ok(dimensions.height>100&&dimensions.scrollHeight>dimensions.height);assert.ok(dimensions.cards.every(c=>c.height>150&&c.infoBottom<=c.bottom+1));assert.equal(dimensions.overflow,false);
    const preview=await page.getByRole('button',{name:/整理预览/}).boundingBox();assert.ok(preview&&preview.y+preview.height<=await page.evaluate(()=>window.innerHeight));
    await page.waitForFunction(()=>{const area=document.querySelector('.gallery-scroll')!.getBoundingClientRect();return [...document.querySelectorAll<HTMLImageElement>('.shot-open img')].filter(img=>{const box=img.getBoundingClientRect();return box.bottom>area.top&&box.top<area.bottom;}).every(img=>img.complete&&img.naturalWidth>0);});
    await capture(`07-layout-${width}`);layouts.push({width,height,...dimensions,cards:dimensions.cards.slice(0,2)});
  }
  report.layouts=layouts;check('百张网格正常/最小窗口、滚动与操作按钮可见');
  await page.getByRole('button',{name:'开始识别',exact:true}).click();await page.getByRole('button',{name:'停止',exact:true}).waitFor();
  const start=performance.now();await page.getByLabel('搜索截图').fill('数学');assert.ok(performance.now()-start<3000);await page.getByRole('button',{name:'停止',exact:true}).click();await idle();await page.getByLabel('搜索截图').fill('');
  assert.equal((await fs.readdir(many)).length,100);check('百张识别时界面响应与真实停止');
  await close();
  // Start from the persisted database with a journal left by an actually exited process.
  for(const action of ['continue','rollback'] as const){
    let exited=false;try{await runFile(process.execPath,[path.join(project,'node_modules/tsx/dist/cli.mjs'),path.join(project,'scripts/integration-recovery-worker.ts'),root,path.join(project,samples[0].file)],{cwd:project,windowsHide:true});}catch(error){assert.equal((error as {code:number}).code,88);exited=true;}
    assert.ok(exited);await launch();await page.getByRole('dialog',{name:/发现 1 项未完成操作/}).waitFor();const unfinished=(await state()).recovery[0];assert.equal(unfinished.stage,'copied');await capture(`08-recovery-${action}`);
    await page.getByRole('button',{name:action==='continue'?'继续完成操作':'回滚到操作前',exact:true}).click();await waitState(s=>!s.recovery.length);await idle();
    assert.equal(await exists(unfinished.item.source),action==='rollback');assert.equal(await exists(unfinished.item.target),action==='continue');assert.equal(await fileHash(action==='continue'?unfinished.item.target:unfinished.item.source),unfinished.item.hash);
    check(`真实进程中断后启动提示及${action==='continue'?'继续':'回滚'}`);await close();
  }
  report.rendererErrors=errors;report.remoteRequests=requests;assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);check('无渲染脚本错误和远程网络请求');
  for(const pid of ownedPids){let alive=false;try{process.kill(pid,0);alive=true;}catch{}assert.equal(alive,false,`模型进程 ${pid} 应在退出后结束`);}
  report.ownedProcessIds=[...ownedPids];check('桌面退出清理自有模型进程树');
  report.success=true;
}
void main().catch(async error=>{report.success=false;report.error=(error as Error).stack;console.error(error);if(page)await capture('failure').catch(()=>{});process.exitCode=1;}).finally(async()=>{
  await close().catch(error=>{report.shutdownError=String(error);report.success=false;process.exitCode=1;});
  if(packaged)report.appAsarSHA256=createHash('sha256').update(await fs.readFile(path.join(project,'output/desktop/win-unpacked/resources/app.asar'))).digest('hex');
  await fs.writeFile(path.join(root,'integration-result.json'),JSON.stringify(report,null,2));console.log(JSON.stringify({report:path.join(root,'integration-result.json'),success:report.success,checks:report.checks.length}));
});
