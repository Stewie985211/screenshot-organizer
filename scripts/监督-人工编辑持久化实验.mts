import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { Store } from '../src/main/store.js';
import { MoveEngine } from '../src/main/moves.js';
import { ensureProjectDirectories } from '../src/main/paths.js';
import { scanImages,buildPlan,fileHash } from '../src/main/files.js';

const project=path.resolve(import.meta.dirname,'..');
const run=path.join(project,'output/监督验收',`manual-${new Date().toISOString().replace(/[:.]/g,'-')}`);
const root=path.join(run,'隔离应用');const input=path.join(run,'测试来源');
ensureProjectDirectories(root);await fs.mkdir(input,{recursive:true});
const quality=JSON.parse(await fs.readFile(path.join(project,'output/监督验收/最新识别结果.json'),'utf8'));
const sample=quality.results.find((item:any)=>item.id==='study_math');
assert.ok(sample.analysis,'使用独立实际模型已产生的分析结果');
const source=path.join(input,'原始数学截图.png');await fs.copyFile(path.join(project,sample.file),source);
const hash=await fileHash(source);let store=new Store(root);const results:any[]=[];
const settings={...store.settings(),sourceFolders:[input]};store.setSettings(settings);
const entry=(await scanImages(settings,store,root,()=>{},()=>false))[0];
store.putImage({...entry,analysis:sample.analysis,status:'ready'});
const plan=await buildPlan([{imageId:entry.id,categoryId:'work',title:'监督桌面整理实验'}],settings,store);
const batch=await new MoveEngine(store).apply(plan,()=>false);
assert.equal(batch.records[0].stage,'committed');assert.equal(await fileHash(plan.items[0].target),hash);
async function test(name:string,task:()=>Promise<void>){try{await task();results.push({name,status:'pass'});console.log('PASS '+name);}catch(error){const detail=String(error);results.push({name,status:'fail',detail});console.log('FAIL '+name+': '+detail);}}
store.close();store=new Store(root);
await test('关闭并重新打开数据库后，人工标题和分类保持最终确认值',async()=>{
 const saved=store.image(entry.id)!;assert.equal(saved.analysis?.title,'监督桌面整理实验');assert.equal(saved.analysis?.categoryId,'work');assert.equal(saved.analysis?.needsReview,false);
});
await new MoveEngine(store).undo(batch.id,()=>false);assert.equal(await fileHash(source),hash);
store.close();store=new Store(root);
await test('撤销恢复原文件并保留人工确认结果，能够再次预览',async()=>{
 const saved=store.image(entry.id)!;assert.equal(saved.path,source);assert.equal(saved.analysis?.title,'监督桌面整理实验');assert.equal(saved.analysis?.categoryId,'work');assert.equal(saved.status,'ready');
 const next=await buildPlan([{imageId:entry.id,title:saved.analysis!.title,categoryId:saved.analysis!.categoryId}],store.settings(),store);assert.ok(next.items[0].target.includes('工作文档'));assert.ok(next.items[0].target.includes('监督桌面整理实验'));
});
store.close();
const report={timestamp:new Date().toISOString(),runDirectory:run,evidence:{actualModelAnalysis:sample.analysis,manualChoice:{title:'监督桌面整理实验',categoryId:'work'},sourceHash:hash},summary:{pass:results.filter(r=>r.status==='pass').length,fail:results.filter(r=>r.status==='fail').length},results};
await fs.writeFile(path.join(run,'结果.json'),JSON.stringify(report,null,2)+'\n');await fs.writeFile(path.join(project,'output/监督验收/最新人工编辑结果.json'),JSON.stringify(report,null,2)+'\n');
console.log('SUMMARY '+JSON.stringify(report.summary));process.exitCode=report.summary.fail?1:0;
