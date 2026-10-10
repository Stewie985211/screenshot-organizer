import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const root=fileURLToPath(new URL('../',import.meta.url));
const out=path.join(root,'output','预览');
const temp=path.join(root,'.cache');
await fs.mkdir(out,{recursive:true});await fs.mkdir(temp,{recursive:true});
process.env.TEMP=temp;process.env.TMP=temp;process.env.TMPDIR=temp;
const errors=[],requests=[],checks=[];
const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH ? {executablePath:process.env.BROWSER_PATH} : {}),args:['--disable-background-networking']});
const context=await browser.newContext({viewport:{width:1440,height:980},deviceScaleFactor:1,locale:'zh-CN',timezoneId:'Asia/Shanghai',reducedMotion:'reduce'});
const page=await context.newPage();
page.on('pageerror',error=>errors.push(error.message));
page.on('request',req=>{if(/^https?:/.test(req.url()))requests.push(req.url());});
const file=pathToFileURL(path.join(root,'output','拾图-交互原型.html')).href;
async function check(name,fn){await fn();checks.push({name,result:'passed'});console.log(`通过：${name}`);}
async function screenshot(name){if(await page.locator('.toast .quiet-icon').count())await page.locator('.toast .quiet-icon').click();await page.screenshot({path:path.join(out,name),fullPage:true});}
const nav=name=>page.locator('.sidebar').getByRole('button',{name:new RegExp('^'+name.replace(/(\d+)$/,'\\s*$1')+'$')});
const closeModal=()=>page.getByRole('button',{name:'关闭弹窗',exact:true}).click();

try {
  await page.goto(file,{waitUntil:'load'});
  await page.getByRole('heading',{name:'全部截图14'}).waitFor();
  await page.locator('.shot-card').first().waitFor();
  await check('离线双击原型加载，无网络资源请求',async()=>{assert.equal(requests.length,0);assert.equal(await page.locator('.shot-card').count(),14);});
  await check('模糊与错误图片不在初始选择中',async()=>{assert.equal(await page.locator('.shot-card.chosen').count(),3);assert.equal(await page.locator('.shot-card:has(.status-review) input:checked').count(),0);assert.equal(await page.locator('.shot-card:has(.status-error) input:checked').count(),0);});
  await screenshot('01-截图库-桌面.png');
  await check('搜索快捷键可聚焦输入框',async()=>{await page.getByRole('button',{name:'网格视图',exact:true}).focus();await page.keyboard.press('/');assert.equal(await page.getByRole('searchbox').evaluate(el=>el===document.activeElement),true);});
  await check('搜索标题与空结果提示',async()=>{await page.getByRole('searchbox').fill('pandas');assert.equal(await page.locator('.shot-card').count(),1);await page.getByRole('searchbox').fill('不存在的截图关键词');await page.getByRole('heading',{name:'没有找到匹配的截图'}).waitFor();await page.getByRole('searchbox').fill('');});
  await check('分类筛选与列表切换',async()=>{await nav('代码与报错2').click();assert.equal(await page.locator('.shot-card').count(),2);await page.getByRole('button',{name:'列表视图',exact:true}).click();assert.equal(await page.locator('.shot-row').count(),2);await page.getByRole('button',{name:'网格视图',exact:true}).click();await nav('全部截图14').click();});
  await check('标题修改实时更新文件命名预览',async()=>{await page.getByRole('textbox',{name:'内容标题',exact:true}).fill('Python pandas 模块安装报错');assert.match(await page.locator('.new-filename').textContent(),/2026-10-09_Python pandas 模块安装报错.png/);});
  await page.getByRole('button',{name:/整理预览/}).click();
  await page.getByRole('dialog').waitFor();
  await check('移动预览包含原名、分类、目标名与完整路径',async()=>{assert.equal(await page.locator('.plan-row').count(),3);assert.match(await page.locator('.plan-table').textContent(),/Python pandas 模块安装报错/);assert.equal(await page.locator('.complete-target').count(),3);assert.match(await page.locator('.complete-target').first().textContent(),/^D:\\Projects\\ScreenshotOrganizer\\output/);});
  await screenshot('02-整理预览-桌面.png');await closeModal();
  await nav('待确认2').click();
  await check('待确认项必须核对后才能加入整理',async()=>{assert.equal(await page.locator('.shot-card').count(),2);assert.equal(await page.getByRole('button',{name:'确认并加入整理'}).isEnabled(),false);});
  await screenshot('03-待确认-桌面.png');
  await page.getByRole('textbox',{name:'内容标题',exact:true}).fill('中国近代史课堂阅读笔记');
  await page.getByRole('checkbox',{name:'我已核对截图内容',exact:true}).check();
  await page.getByRole('button',{name:'确认并加入整理',exact:true}).click();
  await check('人工确认仅加入本次选择，剩余项继续待确认',async()=>{assert.equal(await page.locator('.shot-card').count(),1);assert.match(await page.locator('.selection-bar').textContent(),/已选择 4 张截图/);});
  await nav('全部截图14').click();
  await check('来源路径连续输入保持焦点，支持多目录与重复校验',async()=>{
    await page.getByRole('button',{name:'选择文件夹',exact:true}).click();
    const field=page.getByRole('textbox',{name:'新增来源文件夹路径'});
    await field.pressSequentially('D:\\Pictures\\Wechat',{delay:15});assert.equal(await field.inputValue(),'D:\\Pictures\\Wechat');
    await page.getByRole('button',{name:'添加',exact:true}).click();assert.equal(await page.locator('.import-folders .folder-field').count(),2);
    await field.fill('D:\\Pictures\\Wechat');await page.getByRole('button',{name:'添加',exact:true}).click();await page.getByText('此文件夹已在列表中。').waitFor();
    await page.getByRole('button',{name:'使用这些文件夹'}).click();assert.match(await page.locator('.source-strip').textContent(),/\+1/);
  });
  await nav('设置').click();
  await screenshot('04-设置-桌面.png');
  await check('设置校验输出范围、分类重复与至少一个启用分类',async()=>{
    const output=page.getByRole('textbox',{name:'整理到',exact:true});
    await output.fill('D:\\Outside');await page.getByRole('button',{name:'保存设置'}).click();await page.getByRole('alert').filter({hasText:'整理目录必须'}).waitFor();
    await output.fill('D:\\Projects\\ScreenshotOrganizer\\output\\整理后的截图');
    await page.getByRole('textbox',{name:'分类名称 学习资料'}).fill('代码与报错');await page.getByRole('button',{name:'保存设置'}).click();await page.getByRole('alert').filter({hasText:'分类名称不能为空或重复'}).waitFor();
    await page.getByRole('textbox',{name:'分类名称 代码与报错',exact:true}).first().fill('学习资料');
    const switches=page.locator('.switch input');for(const el of await switches.all())await el.uncheck();
    await page.getByRole('button',{name:'保存设置'}).click();await page.getByRole('alert').filter({hasText:'请至少启用一个分类'}).waitFor();
    for(const el of await switches.all())await el.check();await page.getByRole('button',{name:'保存设置'}).click();assert.equal(await page.locator('.error-note').count(),0);
  });
  await nav('全部截图14').click();
  await check('识别进度和停止保留已完成项',async()=>{
    await page.getByRole('button',{name:'识别所选',exact:true}).click();await page.locator('.progress-banner').waitFor();await page.getByRole('button',{name:'停止',exact:true}).click();assert.equal(await page.locator('.progress-banner').count(),0);
  });
  await page.getByRole('button',{name:/整理预览/}).click();
  await page.getByRole('button',{name:'确认整理 4 张',exact:true}).click();
  await page.locator('.progress-banner').waitFor();
  await page.locator('.progress-banner').waitFor({state:'hidden'});
  await check('模拟整理创建历史并排除已整理截图',async()=>{assert.equal(await page.locator('.shot-card').count(),10);});
  await nav('整理记录').click();
  await page.locator('.toast .quiet-icon').click();
  await screenshot('05-整理记录-桌面.png');
  await check('模拟撤销恢复原名与图库状态',async()=>{
    await page.getByRole('button',{name:'撤销本次整理',exact:true}).first().click();await page.getByRole('button',{name:'确认撤销',exact:true}).click();await page.locator('.progress-banner').waitFor();await page.locator('.progress-banner').waitFor({state:'hidden'});
    assert.match(await page.locator('.batch-card').first().textContent(),/4 张已撤销/);await nav('全部截图14').click();assert.equal(await page.locator('.shot-card').count(),14);
  });
  await nav('整理记录').click();
  await page.getByRole('button',{name:'撤销冲突示例'}).click();
  await screenshot('10-撤销冲突-桌面.png');
  await check('撤销冲突说明保留文件并提供处理入口',async()=>{await page.getByRole('heading',{name:'这张截图暂时不能撤销'}).waitFor();assert.equal(await page.getByRole('button',{name:'查看原位置'}).isVisible(),true);await page.getByRole('button',{name:'稍后处理'}).click();});
  await page.getByRole('button',{name:'查看恢复示例'}).click();
  await screenshot('06-中断恢复-桌面.png');
  await check('中断恢复提供继续与回滚，且可关闭弹窗',async()=>{assert.equal(await page.getByRole('button',{name:'继续完成整理'}).isVisible(),true);assert.equal(await page.getByRole('button',{name:'回滚到原位置'}).isVisible(),true);await page.getByRole('button',{name:'回滚到原位置'}).click();assert.equal(await page.getByRole('dialog').count(),0);});
  await page.locator('.local-card').click();
  await screenshot('07-本地模型-桌面.png');
  await check('模型未准备状态与准备队列演示',async()=>{await page.getByRole('button',{name:'演示切换：模型未准备'}).click();await page.getByRole('button',{name:'准备本地模型',exact:true}).click();await page.locator('.progress-banner').waitFor();await page.locator('.progress-banner').waitFor({state:'hidden'});assert.match(await page.locator('.local-card').textContent(),/本地识别已就绪/);});
  await page.goto(file,{waitUntil:'load'});
  await check('读取失败项禁止整理并展示具体原因',async()=>{
    await page.locator('.status-tabs button').filter({hasText:/^失败\s*1$/}).click();
    assert.equal(await page.locator('.shot-card').count(),1);await page.locator('.shot-open').click();
    assert.equal(await page.locator('.shot-check input').isDisabled(),true);await page.getByRole('heading',{name:'这张截图暂时无法读取'}).waitFor();
  });
  await screenshot('11-读取失败-桌面.png');
  await check('未识别项提供单张识别入口，识别后更新状态',async()=>{
    await page.locator('.status-tabs button').filter({hasText:/^未识别\s*1$/}).click();await page.locator('.shot-open').click();
    await page.getByRole('button',{name:'识别这张截图',exact:true}).click();await page.locator('.progress-banner').waitFor();await screenshot('12-识别进度-桌面.png');await page.locator('.progress-banner').waitFor({state:'hidden'});
    assert.match(await page.locator('.inspector').textContent(),/已识别/);assert.equal(await page.locator('.shot-card').count(),0);
  });
  await page.goto(file,{waitUntil:'load'});
  await page.setViewportSize({width:1280,height:850});
  await screenshot('08-截图库-小窗口.png');
  await page.setViewportSize({width:390,height:844});
  await page.getByRole('button',{name:'关闭截图详情',exact:true}).click();
  await screenshot('09-截图库-窄屏.png');
  await check('窄屏无横向溢出，导航及详情可打开',async()=>{assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),true);await page.getByRole('button',{name:'展开导航'}).click();assert.equal(await nav('设置').isVisible(),true);await nav('全部截图14').click();await page.locator('.shot-open').first().click();assert.equal(await page.locator('.inspector.has-active').isVisible(),true);});
  await page.setViewportSize({width:1440,height:980});
  await page.getByRole('button',{name:'选择文件夹',exact:true}).click();
  await check('弹窗 Escape 与键盘焦点约束',async()=>{await page.keyboard.press('Shift+Tab');assert.equal(await page.getByRole('button',{name:'使用这些文件夹'}).evaluate(el=>el===document.activeElement),true);await page.keyboard.press('Tab');assert.equal(await page.getByRole('button',{name:'关闭弹窗',exact:true}).evaluate(el=>el===document.activeElement),true);await page.keyboard.press('Escape');assert.equal(await page.getByRole('dialog').count(),0);});
  await check('无页面脚本错误，仍无 HTTP 请求',async()=>{assert.deepEqual(errors,[]);assert.deepEqual(requests,[]);});
} finally {
  await fs.writeFile(path.join(root,'output','验证结果.json'),JSON.stringify({date:'2026-10-09',scope:'独立 UI 原型，模拟数据，不验证业务核心与模型质量',checks,pageErrors:errors,networkRequests:requests},null,2)+'\n');
  await browser.close();
}
console.log(`共 ${checks.length} 项界面验证通过；页面截图存于 output/预览。`);
