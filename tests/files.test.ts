import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { ensureProjectDirectories } from '../src/main/paths.js';
import { Store } from '../src/main/store.js';
import { fileHash,scanImages,buildPlan,exists,cleanName,fileDate,recognitionImages } from '../src/main/files.js';
import { MoveEngine,type FaultPoint } from '../src/main/moves.js';
import { OrganizerService } from '../src/main/service.js';
import { analyzeImage } from '../src/main/analyzer.js';
const parent=path.join(process.cwd(),'output/validation/unit');
async function setup(){
  const root=path.join(parent,randomUUID());ensureProjectDirectories(root);
  const source=path.join(root,'assets/input');await fs.mkdir(source,{recursive:true});
  const file=path.join(source,'原始截图.png');await sharp({create:{width:20,height:20,channels:3,background:'#a8bcef'}}).png().toFile(file);
  const store=new Store(root);const settings={...store.settings(),sourceFolders:[source]};store.setSettings(settings);
  const [image]=await scanImages(settings,store,root,()=>{},()=>false);
  const plan=await buildPlan([{imageId:image.id,categoryId:'study',title:'数学课程笔记'}],settings,store);
  return{root,source,file,store,settings,image,plan};
}
test('移动及撤销保持内容哈希和原路径',async()=>{const s=await setup();try{
  const batch=await new MoveEngine(s.store).apply(s.plan,()=>false);assert.equal(batch.records[0].stage,'committed');assert.equal(await exists(s.file),false);assert.equal(await fileHash(s.plan.items[0].target),s.image.hash);
  const undone=await new MoveEngine(s.store).undo(batch.id,()=>false);assert.equal(undone.records[0].stage,'undone');assert.equal(await fileHash(s.file),s.image.hash);assert.equal(await exists(s.plan.items[0].target),false);
}finally{s.store.close();}});
test('执行前源文件变更时保留源文件并单独失败',async()=>{const s=await setup();try{
  await fs.appendFile(s.file,'changed');const hash=await fileHash(s.file);const batch=await new MoveEngine(s.store).apply(s.plan,()=>false);assert.equal(batch.records[0].stage,'failed');assert.equal(await fileHash(s.file),hash);assert.equal(await exists(s.plan.items[0].target),false);
}finally{s.store.close();}});
test('预览后目标位置被占用时不覆盖且可清理临时副本',async()=>{const s=await setup();try{
  const target=s.plan.items[0].target;await fs.mkdir(path.dirname(target),{recursive:true});await fs.writeFile(target,'已有文件');const batch=await new MoveEngine(s.store).apply(s.plan,()=>false);const record=batch.records[0];assert.equal(record.stage,'failed');assert.equal(await fs.readFile(target,'utf8'),'已有文件');assert.equal(await fileHash(s.file),s.image.hash);await new MoveEngine(s.store).recover(record.id,'rollback');assert.equal(await fs.readFile(target,'utf8'),'已有文件');
}finally{s.store.close();}});
test('撤销遇到原位置冲突或目标修改时保留两边',async()=>{const s=await setup();try{
  const batch=await new MoveEngine(s.store).apply(s.plan,()=>false);await fs.writeFile(s.file,'后来生成的文件');const undone=await new MoveEngine(s.store).undo(batch.id,()=>false);assert.equal(undone.records[0].stage,'committed');assert.match(undone.records[0].error!,/已有文件/);assert.equal(await fs.readFile(s.file,'utf8'),'后来生成的文件');assert.equal(await fileHash(s.plan.items[0].target),s.image.hash);
  await fs.unlink(s.file);await fs.appendFile(s.plan.items[0].target,'changed');const changed=await new MoveEngine(s.store).undo(batch.id,()=>false);assert.equal(changed.records[0].stage,'committed');assert.match(changed.records[0].error!,/被修改/);
}finally{s.store.close();}});
for(const point of ['prepared','copied','published','verified','source-deleted','committed'] as FaultPoint[]){
  for(const action of ['continue','rollback'] as const)test(`中断于 ${point} 后重启并 ${action}`,async()=>{
    const s=await setup();let fired=false;let batch;
    try{batch=await new MoveEngine(s.store,()=>{},stage=>{if(!fired&&stage===point){fired=true;throw new Error('注入中断');}}).apply(s.plan,()=>false);}finally{s.store.close();}
    const store=new Store(s.root);try{const record=store.batch(batch!.id)!.records[0];assert.ok(store.recovery().some(r=>r.id===record.id));await new MoveEngine(store).recover(record.id,action);
      const result=store.move(record.id)!;assert.equal(result.stage,action==='continue'?'committed':'undone');const file=action==='continue'?s.plan.items[0].target:s.file;assert.equal(await fileHash(file),s.image.hash);assert.equal(await exists(action==='continue'?s.file:s.plan.items[0].target),false);assert.equal(store.recovery().length,0);
    }finally{store.close();}
  });
}
test('停止整理仅完成当前项，不执行剩余项目',async()=>{const s=await setup();try{
  const extra=path.join(s.source,'第二张.png');await fs.copyFile(s.file,extra);const images=await scanImages(s.settings,s.store,s.root,()=>{},()=>false);const plan=await buildPlan(images.map(i=>({imageId:i.id,categoryId:'study',title:'同一内容'})),s.settings,s.store);let stop=false;
  const batch=await new MoveEngine(s.store,()=>{stop=true;}).apply(plan,()=>stop);assert.equal(batch.totalItems,plan.items.length);assert.equal(batch.records.length,1);assert.equal(batch.records[0].stage,'committed');assert.equal((await fs.readdir(s.source)).length,1);
}finally{s.store.close();}});
test('待恢复目标经过外部修改时拒绝删除',async()=>{const s=await setup();try{
  let fired=false;const batch=await new MoveEngine(s.store,()=>{},point=>{if(!fired&&point==='verified'){fired=true;throw new Error('中断');}}).apply(s.plan,()=>false);await fs.appendFile(s.plan.items[0].target,'外部修改');await assert.rejects(()=>new MoveEngine(s.store).recover(batch.records[0].id,'rollback'));assert.equal(await exists(s.file),true);assert.equal(await exists(s.plan.items[0].target),true);
}finally{s.store.close();}});
test('目录链接不能绕过输出目录检查',async()=>{const s=await setup();try{
  const other=path.join(s.root,'assets/外部目录');await fs.mkdir(other);await fs.symlink(other,path.join(s.settings.outputFolder,'学习资料'),'junction');const batch=await new MoveEngine(s.store).apply(s.plan,()=>false);assert.equal(batch.records[0].stage,'failed');assert.match(batch.records[0].error!,/链接/);assert.equal(await exists(s.file),true);assert.equal((await fs.readdir(other)).length,0);
}finally{s.store.close();}});
test('命名规则处理非法字符、保留名与北京时间跨日',()=>{assert.equal(fileDate(Date.parse('2026-10-08T16:30:00Z')),'2026-10-09');assert.equal(cleanName('CON'),'_CON');assert.equal(Array.from(cleanName('字'.repeat(60))).length,40);assert.throws(()=>cleanName('...'));assert.equal(cleanName('标题/内容'),'标题_内容');});
test('完整重新扫描移除已删除项，停止扫描保留尚未扫描的项',async()=>{const s=await setup();try{
  await fs.unlink(s.file);await scanImages(s.settings,s.store,s.root,()=>{},()=>true);assert.ok(s.store.image(s.image.id));
  await scanImages(s.settings,s.store,s.root,()=>{},()=>false);assert.equal(s.store.image(s.image.id),undefined);
}finally{s.store.close();}});
test('纯色图片直接待确认且不会调用模型或修改原图',async()=>{const s=await setup();try{
  let calls=0;const result=await analyzeImage(s.image,s.settings.categories,30000,new AbortController().signal,()=>calls++);
  assert.equal(result.needsReview,true);assert.equal(result.title,'内容待确认');assert.equal(calls,0);assert.equal(await fileHash(s.file),s.image.hash);
}finally{s.store.close();}});
for(const changed of ['source','output','category'] as const)test(`修改 ${changed} 设置后旧预览不能执行`,async()=>{
  const s=await setup();s.store.close();const service=new OrganizerService(s.root);
  try{
    const settings=service.store.settings();
    if(changed==='source')settings.sourceFolders=[];
    if(changed==='output')settings.outputFolder=path.join(s.root,'output/新目录');
    if(changed==='category')settings.categories=settings.categories.map(category=>category.id==='study'?{...category,enabled:false}:category);
    await service.saveSettings(settings);await assert.rejects(()=>service.apply(s.plan.id),/重新预览/);
    assert.equal(await fileHash(s.file),s.image.hash);assert.equal(await exists(s.plan.items[0].target),false);assert.equal(service.store.history().length,0);
  }finally{service.close();}
});
for(const hasModelSuggestion of [true,false])test(`人工确认持久化、撤销及再扫后仍可再次整理（原有模型建议=${hasModelSuggestion}）`,async()=>{
  const s=await setup();let store=s.store;
  try{
    const raw={categoryId:'study',title:'原模型标题',summary:'原截图内容摘要',needsReview:true};
    if(hasModelSuggestion)store.putImage({...s.image,analysis:raw,status:'review'});
    store.cache('raw-model-test',raw);
    const plan=await buildPlan([{imageId:s.image.id,categoryId:'work',title:'人工确认文档标题'}],s.settings,store);
    const batch=await new MoveEngine(store).apply(plan,()=>false);assert.equal(batch.records[0].stage,'committed');
    store.close();store=new Store(s.root);let entry=store.image(s.image.id)!;
    assert.equal(entry.analysis?.title,'人工确认文档标题');assert.equal(entry.analysis?.categoryId,'work');assert.equal(entry.analysis?.needsReview,false);assert.equal(entry.confirmed?.title,'人工确认文档标题');assert.deepEqual(store.cached('raw-model-test'),raw);
    await new MoveEngine(store).undo(batch.id,()=>false);await scanImages(s.settings,store,s.root,()=>{},()=>false);entry=store.image(s.image.id)!;
    assert.equal(entry.status,'ready');assert.equal(entry.analysis?.title,'人工确认文档标题');assert.equal(entry.analysis?.categoryId,'work');assert.equal(await fileHash(s.file),s.image.hash);
    const next=await buildPlan([{imageId:entry.id,title:entry.analysis!.title,categoryId:entry.analysis!.categoryId}],s.settings,store);
    assert.equal(path.basename(path.dirname(next.items[0].target)),'工作文档');assert.equal((await new MoveEngine(store).apply(next,()=>false)).records[0].stage,'committed');
  }finally{store.close();}
});
test('确认结果在原图发生变化后的重新扫描中失效',async()=>{const s=await setup();try{
  const batch=await new MoveEngine(s.store).apply(s.plan,()=>false);await new MoveEngine(s.store).undo(batch.id,()=>false);assert.ok(s.store.image(s.image.id)?.confirmed);
  await fs.appendFile(s.file,'新内容');await scanImages(s.settings,s.store,s.root,()=>{},()=>false);
  const entry=s.store.image(s.image.id)!;assert.equal(entry.confirmed,undefined);assert.equal(entry.analysis,undefined);assert.equal(entry.status,'pending');
}finally{s.store.close();}});
