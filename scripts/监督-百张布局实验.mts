import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {_electron} from 'playwright';
const project=path.resolve(import.meta.dirname,'..');
const previous=JSON.parse(await fs.readFile(path.join(project,'output/监督验收/最新桌面结果.json'),'utf8'));
const run=path.join(project,'output/监督验收',`layout-${new Date().toISOString().replace(/[:.]/g,'-')}`);await fs.mkdir(run,{recursive:true});
const env={...process.env,SCREENSHOT_PROJECT_ROOT:path.join(previous.runDirectory,'隔离应用'),TEMP:path.join(project,'data/temp'),TMP:path.join(project,'data/temp')};delete env.ELECTRON_RUN_AS_NODE;
const desktop=await _electron.launch({executablePath:path.join(project,'output/desktop/win-unpacked/ScreenshotOrganizer.exe'),args:[],cwd:project,env,timeout:60000});
const report:any={timestamp:new Date().toISOString(),runDirectory:run,sourceDesktopRun:previous.runDirectory};
try{
 const page=await desktop.firstWindow();await page.waitForSelector('.image-card');
 async function visibleThumbnailsReady(){await page.waitForFunction(()=>{
  const grid=document.querySelector('.image-grid')!;const g=grid.getBoundingClientRect();
  const visible=[...grid.querySelectorAll('img')].filter(img=>{const r=img.getBoundingClientRect();return r.bottom>g.top&&r.top<g.bottom;});
  return visible.length>0&&visible.every(img=>img.complete&&img.naturalWidth>0);
 },undefined,{timeout:20000});}
 await visibleThumbnailsReady();
 report.layout=await page.locator('.image-grid').evaluate(grid=>{
  const cards=[...grid.querySelectorAll('.image-card')];
  return {count:cards.length,gridHeight:grid.getBoundingClientRect().height,gridTemplateRows:getComputedStyle(grid).gridTemplateRows,cards:cards.slice(0,8).map(card=>{
   const thumb=card.querySelector('.thumbnail')!;const image=thumb.querySelector('img')!;
   return {cardHeight:card.getBoundingClientRect().height,thumbnailHeight:thumb.getBoundingClientRect().height,title:card.querySelector('strong')?.textContent,imageWidth:image.naturalWidth,imageComplete:image.complete};
  })};
 });
 await page.screenshot({path:path.join(run,'百张截图布局.png')});
 assert.equal(report.layout.count,100);assert.ok(report.layout.cards.every((c:any)=>c.cardHeight>=180),'百张列表中卡片高度必须容纳缩略图与标题，不能被压成线条');console.log('PASS 百张列表卡片完整显示');
 await desktop.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setSize(1024,700));
 await page.locator('.image-grid').evaluate(grid=>{grid.scrollTop=grid.scrollHeight/2;});await visibleThumbnailsReady();
 report.minimumWindow=await page.locator('.image-grid').evaluate(grid=>{
  const g=grid.getBoundingClientRect();return {visibleCards:[...grid.querySelectorAll('.image-card')].filter(card=>{const r=card.getBoundingClientRect();return r.bottom>g.top&&r.top<g.bottom;}).map(card=>({height:card.getBoundingClientRect().height,title:card.querySelector('strong')?.textContent,imageWidth:card.querySelector('img')?.naturalWidth}))};
 });
 assert.ok(report.minimumWindow.visibleCards.every((c:any)=>c.height>=180&&c.imageWidth>0),'最小窗口滚动后卡片与懒加载缩略图仍应正确显示');
 await page.screenshot({path:path.join(run,'百张截图-最小窗口滚动.png')});report.success=true;console.log('PASS 最小窗口滚动后缩略图加载且标题完整');
}catch(error){report.success=false;report.error=String(error);console.log('FAIL '+report.error);process.exitCode=1;}
finally{await desktop.close();await fs.writeFile(path.join(run,'结果.json'),JSON.stringify(report,null,2)+'\n');await fs.writeFile(path.join(project,'output/监督验收/最新布局结果.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
