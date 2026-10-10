// .mts keeps this independent runner in ESM without changing the application's package mode.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cleanName, fileDate, fileHash, scanImages, buildPlan } from '../src/main/files.js';
import { ensureProjectDirectories } from '../src/main/paths.js';
import { Store } from '../src/main/store.js';
import type { ImageEntry } from '../src/shared/types.js';

const project = path.resolve(import.meta.dirname, '..');
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const run = path.join(project, 'output', '监督验收', `core-${stamp}`);
const manifest = JSON.parse(await fs.readFile(path.join(project, 'data/supervision/manifest.json'), 'utf8'));
const cases: {name: string; status: string; detail: string}[] = [];
const evidence: Record<string, unknown> = {};

async function test(name: string, task: () => Promise<void> | void) {
  try { await task(); cases.push({name, status:'pass', detail:''}); console.log(`PASS ${name}`); }
  catch (error) { const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error); cases.push({name,status:'fail',detail}); console.log(`FAIL ${name}: ${detail}`); }
}

await fs.mkdir(run, {recursive:true});
const isolatedRoot = path.join(run, '隔离应用');
ensureProjectDirectories(isolatedRoot);
const store = new Store(isolatedRoot);
const source = path.join(run, '输入截图');
const nested = path.join(source, '中文子目录');
const output = path.join(run, '整理输出');
await fs.mkdir(nested, {recursive:true});
for (let i = 0; i < manifest.clearCases.length; i++) {
  const item = manifest.clearCases[i];
  await fs.copyFile(path.join(project, item.file), path.join(i < 20 ? source : nested, path.basename(item.file)));
}
await fs.copyFile(path.join(project, manifest.edgeCases[2].file), path.join(source, '损坏图片.png'));
await fs.writeFile(path.join(source, '不是图片.txt'), 'text');
await fs.mkdir(output, {recursive:true});
await fs.copyFile(path.join(project, manifest.clearCases[0].file), path.join(output, '不得扫描.png'));
const settings = {...store.settings(), sourceFolders:[source],outputFolder:output};
store.setSettings(settings);
let images: ImageEntry[] = [];

await test('北京时间日期跨日正确', () => {
  assert.equal(fileDate(Date.parse('2026-10-08T16:30:00Z')), '2026-10-09');
  assert.equal(fileDate(Date.parse('2026-10-08T15:59:00Z')), '2026-10-08');
});
await test('清理非法字符、保留名和40字标题', () => {
  const name=cleanName('  安装<>:"/\\|?*报错.  ');
  assert.ok(!/[<>:"/\\|?*\x00-\x1f]/.test(name));
  assert.ok(!/[. ]$/.test(name));
  assert.equal(Array.from(cleanName('测'.repeat(60))).length,40);
  assert.notEqual(cleanName('CON'),'CON');
  assert.throws(()=>cleanName('...'));
});
await test('PNG/JPEG/WebP/BMP均可读且损坏项单独报告', async () => {
  images = await scanImages(settings, store, isolatedRoot, ()=>{}, ()=>false);
  evidence.scan=images.map(i=>({name:i.originalName,status:i.status,width:i.width,height:i.height,error:i.error}));
  assert.equal(images.length,25,'应扫描24张正常图片和1张损坏图');
  const failures=images.filter(i=>i.status==='error');
  assert.deepEqual(failures.map(i=>i.originalName).sort(),['损坏图片.png']);
});
await test('非递归扫描不包含子目录', async () => {
  const results=await scanImages({...settings,recursive:false},store,isolatedRoot,()=>{},()=>false);
  assert.equal(results.length,21);
  assert.ok(results.every(i=>path.dirname(i.path)===source));
});
await test('重复来源目录不会重复统计，输出目录被排除', async () => {
  const results=await scanImages({...settings,sourceFolders:[source,nested,output]},store,isolatedRoot,()=>{},()=>false);
  assert.equal(results.length,25);
  assert.equal(new Set(results.map(i=>i.path)).size,25);
  assert.ok(!results.some(i=>i.originalName==='不得扫描.png'));
});
await test('扫描不跟随目录链接', async () => {
  const linked=path.join(source,'指向输出的链接');
  await fs.symlink(output,linked,'junction');
  const results=await scanImages(settings,store,isolatedRoot,()=>{},()=>false);
  assert.equal(results.length,25);
  assert.ok(!results.some(i=>i.path.includes('指向输出的链接')));
});
await test('停止扫描后不继续处理', async () => {
  let emitted=0;
  const results=await scanImages(settings,store,isolatedRoot,()=>emitted++,()=>emitted>=3);
  assert.equal(emitted,3); assert.equal(results.length,3);
});
await test('生成预览保持源文件内容、原名与位置', async () => {
  const image=images.find(i=>i.originalName==='01_study_math.png')!;
  const before=await fileHash(image.path);
  const plan=await buildPlan([{imageId:image.id,categoryId:'study',title:'导数复习笔记'}],settings,store);
  assert.equal(await fileHash(image.path),before);
  assert.equal(plan.items[0].source,image.path);
  assert.ok(plan.items[0].target.endsWith('导数复习笔记.png'));
  assert.equal(await fs.stat(plan.items[0].target).then(()=>true,()=>false),false);
  evidence.preview=plan;
});
await test('目标重名追加后缀，已有内容不变', async () => {
  const image=images.find(i=>i.originalName==='01_study_math.png')!;
  const choice={imageId:image.id,categoryId:'study',title:'碰撞测试'};
  const plan=await buildPlan([choice],settings,store);
  const occupied=plan.items[0].target;
  await fs.mkdir(path.dirname(occupied),{recursive:true});
  await fs.writeFile(occupied,'既有文件内容');
  const replanned=await buildPlan([choice],settings,store);
  assert.ok(replanned.items[0].target.endsWith('_02.png'));
  assert.equal(await fs.readFile(occupied,'utf8'),'既有文件内容');
});
await test('同一批次同名目标保持唯一', async () => {
  const pair=images.filter(i=>i.status!=='error'&&path.extname(i.path)==='.png').slice(0,2);
  const plan=await buildPlan(pair.map(i=>({imageId:i.id,categoryId:'life',title:'同名截图'})),settings,store);
  assert.equal(new Set(plan.items.map(i=>i.target.toLowerCase())).size,2);
  assert.ok(plan.items[1].target.endsWith('_02.png'));
});
await test('停用分类不能执行计划', async () => {
  const image=images.find(i=>i.status!=='error')!;
  await assert.rejects(()=>buildPlan([{imageId:image.id,categoryId:'study',title:'标题'}],{...settings,categories:settings.categories.map(c=>({...c,enabled:c.id!=='study'}))},store));
});
await test('损坏图片不允许进入整理计划', async () => {
  const image=images.find(i=>i.originalName==='损坏图片.png')!;
  await assert.rejects(()=>buildPlan([{imageId:image.id,categoryId:'life',title:'损坏图片'}],settings,store));
});

store.close();
const sourceHashes: Record<string,string>={};
for (const file of ['src/main/files.ts','src/main/store.ts','src/main/paths.ts','src/shared/types.ts'])
  sourceHashes[file]=createHash('sha256').update(await fs.readFile(path.join(project,file))).digest('hex');
const report={timestamp:new Date().toISOString(),datasetKind:'synthetic',runDirectory:run,sourceHashes,
  summary:{pass:cases.filter(c=>c.status==='pass').length,fail:cases.filter(c=>c.status==='fail').length},cases,evidence};
await fs.writeFile(path.join(run,'结果.json'),JSON.stringify(report,null,2)+'\n');
await fs.writeFile(path.join(project,'output/监督验收/最新核心结果.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({summary:report.summary,report:path.join(run,'结果.json')}));
process.exitCode=report.summary.fail ? 1 : 0;
