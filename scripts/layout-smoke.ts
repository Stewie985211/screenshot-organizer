import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { _electron } from 'playwright';
async function main(){
  const project=process.cwd();const root=path.join(project,'output/validation',`layout-${randomUUID()}`);const source=path.join(root,'assets/百张副本');await fs.mkdir(source,{recursive:true});
  const manifest=JSON.parse(await fs.readFile(path.join(project,'data/supervision/manifest.json'),'utf8'));
  for(let index=1;index<=100;index++)await fs.copyFile(path.join(project,manifest.clearCases[0].file),path.join(source,`${String(index).padStart(3,'0')}_数学截图.png`));
  const desktop=await _electron.launch({executablePath:path.join(project,'output/desktop/win-unpacked/ScreenshotOrganizer.exe'),args:[],env:{...process.env,SCREENSHOT_PROJECT_ROOT:root,TEMP:path.join(project,'data/temp'),TMP:path.join(project,'data/temp')},timeout:60000});
  const report:Record<string,unknown>={isolatedRoot:root,packaged:true,sizes:[]};
  try{
    const page=await desktop.firstWindow();await page.locator('.desktop-shell').waitFor();await page.emulateMedia({reducedMotion:'reduce'});
    await page.evaluate(async folder=>{const state=await window.screenshots.getState();await window.screenshots.saveSettings({...state.settings,sourceFolders:[folder]});await window.screenshots.scan();},source);await page.reload();await page.locator('.shot-card').first().waitFor();
    for(const [width,height] of [[1440,960],[1024,700]]){
      await desktop.evaluate(({BrowserWindow},size)=>{const window=BrowserWindow.getAllWindows()[0];window.setSize(size[0],size[1]);window.show();if(window.isMinimized())window.restore();window.focus();},[width,height]);
      if(width===1024)await page.waitForFunction(()=>window.innerWidth<1200);
      const layout=await page.locator('.gallery-scroll').evaluate(grid=>({count:grid.querySelectorAll('.shot-card').length,height:grid.clientHeight,scrollHeight:grid.scrollHeight,rows:getComputedStyle(grid).gridTemplateRows,cards:[...grid.querySelectorAll('.shot-card')].map(card=>({height:card.getBoundingClientRect().height,captionBottom:card.querySelector('.shot-info')!.getBoundingClientRect().bottom,cardBottom:card.getBoundingClientRect().bottom}))}));
      assert.equal(layout.count,100);assert.ok(layout.cards.every(card=>card.height>=150&&card.captionBottom<=card.cardBottom+1));assert.ok(layout.scrollHeight>layout.height);
      assert.ok(await page.getByRole('button',{name:/^(开始识别|识别所选)$/}).isVisible());assert.ok(await page.getByRole('button',{name:/整理预览/}).isVisible());
      await page.screenshot({path:path.join(root,`${width}x${height}.png`),timeout:60000});
      await page.locator('.gallery-scroll').evaluate(grid=>{grid.scrollTop=grid.scrollHeight;});await page.locator('.shot-card').last().getByRole('button').first().click();await page.getByLabel('内容标题',{exact:true}).fill(`百张列表末项-${width}`);await page.getByLabel('我已核对截图内容').check();await page.getByRole('button',{name:'确认并加入整理'}).click();assert.ok(await page.locator('.shot-card').last().getByRole('checkbox').isChecked());await page.locator('.gallery-scroll').evaluate(grid=>{grid.scrollTop=0;});
      (report.sizes as unknown[]).push({width,height,count:layout.count,cardHeight:layout.cards[0].height,scrollHeight:layout.scrollHeight,viewportHeight:layout.height,lastCardSelectable:true});
    }
    report.success=true;console.log(JSON.stringify(report));
  }catch(error){report.success=false;report.error=(error as Error).stack;console.error(error);process.exitCode=1;}
  finally{await desktop.close();await fs.writeFile(path.join(root,'layout-result.json'),JSON.stringify(report,null,2));}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
