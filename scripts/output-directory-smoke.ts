import {_electron,type ElectronApplication,type Page} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import sharp from 'sharp';
import {fileHash,exists} from '../src/main/files';

const project=process.cwd(),base=path.join(project,'output/validation/output-ui',randomUUID().slice(0,8));
const root=path.join(base,'app'),source=path.join(base,'Screenshot'),target=path.join(base,'The Photos');
const executable=path.resolve(process.argv[2]??'output/desktop/win-unpacked/ScreenshotOrganizer.exe');
const checks:string[]=[],errors:string[]=[];
let app:ElectronApplication|undefined,page:Page;
const check=(name:string)=>{checks.push(name);console.log(`PASS ${name}`);};
const state=()=>page.evaluate(()=>window.screenshots.getState());
async function idle(){await page.waitForFunction(()=>!document.querySelector('.progress-banner')&&[...document.querySelectorAll<HTMLButtonElement>('.header-actions button')].every(button=>!button.disabled));}
async function choose(folder:string){await app!.evaluate(({dialog},value)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[value]});},folder);}

async function main(){try{
  await fs.mkdir(source,{recursive:true});await fs.mkdir(target);await fs.mkdir(path.join(root,'data/temp'),{recursive:true});
  const original=path.join(source,'合成截图.png');
  await sharp({create:{width:640,height:480,channels:3,background:'#a8bcef'}}).png().toFile(original);
  const hash=await fileHash(original);
  app=await _electron.launch({executablePath:executable,args:[],env:{...process.env,SCREENSHOT_PROJECT_ROOT:root,TEMP:path.join(root,'data/temp'),TMP:path.join(root,'data/temp')},timeout:60000});
  page=await app.firstWindow();page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
  await page.locator('.desktop-shell').waitFor();
  assert.equal(await app.evaluate(({app})=>app.getVersion()),'0.2.1');
  await choose(source);await page.getByRole('button',{name:'选择文件夹',exact:true}).click();
  await page.getByRole('button',{name:'添加来源文件夹',exact:true}).click();await page.getByRole('button',{name:'保存来源并扫描'}).click();await idle();
  await page.locator('.sidebar-bottom').getByRole('button',{name:'设置',exact:true}).click();
  await choose(target);await page.getByRole('button',{name:'选择整理目录'}).click();await idle();
  await page.getByRole('button',{name:'保存设置',exact:true}).click();await idle();assert.equal((await state()).settings.outputFolder,target);
  await page.reload();await page.locator('.desktop-shell').waitFor();await page.locator('.sidebar-bottom').getByRole('button',{name:'设置',exact:true}).click();
  await page.getByLabel('整理到',{exact:true}).waitFor();assert.equal(await page.getByLabel('整理到',{exact:true}).inputValue(),target);
  assert.ok((await page.locator('.field-hint').first().innerText()).includes('D 盘'));check('桌面设置接受项目外目录并在刷新后保留');
  await page.locator('nav[aria-label="主导航"]').getByRole('button',{name:/全部截图/}).click();
  await page.getByRole('button',{name:'查看 合成截图.png',exact:true}).click();await page.getByLabel('内容标题',{exact:true}).fill('保存路径测试');
  await page.getByLabel('截图分类').selectOption('work');await page.getByRole('checkbox',{name:'我已核对截图内容',exact:true}).check();
  await page.getByRole('button',{name:'确认并加入整理',exact:true}).click();await page.getByRole('button',{name:/整理预览/}).click();
  const destination=await page.locator('.complete-target').innerText();assert.equal(path.dirname(destination),path.join(target,'工作文档'));
  await app.evaluate(({BrowserWindow})=>{const window=BrowserWindow.getAllWindows()[0];window.show();window.focus();});
  await page.screenshot({path:path.join(base,'项目外目录预览.png')});check('完整整理预览指向新目录的分类子文件夹');
  await page.getByRole('button',{name:'确认整理 1 张',exact:true}).click();await idle();
  assert.equal(await exists(original),false);assert.equal(await fileHash(destination),hash);check('新目录实际移动成功且内容哈希不变');
  await page.locator('nav[aria-label="主导航"]').getByRole('button',{name:'整理记录',exact:true}).click();
  await page.getByRole('button',{name:'撤销本次整理'}).click();await page.getByRole('button',{name:'确认撤销',exact:true}).click();await idle();
  assert.equal(await fileHash(original),hash);assert.equal(await exists(destination),false);check('新目录文件可从整理记录恢复原位置');
  await page.locator('.sidebar-bottom').getByRole('button',{name:'设置',exact:true}).click();
  await choose(source);await page.getByRole('button',{name:'选择整理目录'}).click();await idle();await page.getByRole('button',{name:'保存设置',exact:true}).click();await idle();
  assert.ok((await page.locator('.operation-notice').innerText()).includes('来源'));assert.equal((await state()).settings.outputFolder,target);check('来源自身不能作为整理目录，错误在界面显示');
  await choose('C:\\临时整理测试');await page.getByRole('button',{name:'选择整理目录'}).click();await idle();await page.getByRole('button',{name:'保存设置',exact:true}).click();await idle();
  assert.ok((await page.locator('.operation-notice').innerText()).includes('D 盘'));assert.equal((await state()).settings.outputFolder,target);check('C 盘目标被拒绝，原设置保留');
  assert.deepEqual(errors,[]);check('桌面页面无运行错误');
  await fs.writeFile(path.join(base,'result.json'),JSON.stringify({success:true,version:'0.2.1',executable,base,checks,errors,appAsarSHA256:createHash('sha256').update(await fs.readFile(path.join(path.dirname(executable),'resources/app.asar'))).digest('hex')},null,2));
  console.log(`REPORT ${path.join(base,'result.json')}`);
}catch(error){
  await fs.mkdir(base,{recursive:true});await fs.writeFile(path.join(base,'result.json'),JSON.stringify({success:false,base,checks,errors,error:String(error)},null,2));throw error;
}finally{await app?.close();}}
void main().catch(error=>{console.error(error);process.exitCode=1;});
