import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { MoveEngine, type FaultPoint } from '../src/main/moves.js';
import { scanImages, buildPlan, fileHash, exists } from '../src/main/files.js';
import { Store } from '../src/main/store.js';
import { ensureProjectDirectories } from '../src/main/paths.js';

const project=path.resolve(import.meta.dirname,'..');
const mode=process.argv[2];
if(mode==='worker') {
  const [root,point,direction]=process.argv.slice(3);
  const store=new Store(root);
  const plan=store.plan((await fs.readFile(path.join(root,'plan-id.txt'),'utf8')).trim())!;
  const fault=(at:FaultPoint)=>{if(at===point) process.exit(88);};
  if(direction==='forward') await new MoveEngine(store,()=>{},fault).apply(plan,()=>false);
  else {
    const batch=await new MoveEngine(store).apply(plan,()=>false);
    await new MoveEngine(store,()=>{},fault).undo(batch.id,()=>false);
  }
  store.close(); process.exit(0);
}

const run=path.join(project,'output/监督验收',`moves-${new Date().toISOString().replace(/[:.]/g,'-')}`);
const manifest=JSON.parse(await fs.readFile(path.join(project,'data/supervision/manifest.json'),'utf8'));
const fixture=path.join(project,manifest.clearCases[0].file);
const originalHash=await fileHash(fixture);
const results:{name:string;status:string;detail:string}[]=[];
const evidence:unknown[]=[];
let index=0;
async function test(name:string,task:()=>Promise<void>) {
  try {await task();results.push({name,status:'pass',detail:''});console.log(`PASS ${name}`);}
  catch(error){const detail=error instanceof Error?`${error.name}: ${error.message}`:String(error);results.push({name,status:'fail',detail});console.log(`FAIL ${name}: ${detail}`);}
}
async function setup(count=1) {
  const dir=path.join(run,`${String(++index).padStart(2,'0')}-实验`);
  const root=path.join(dir,'隔离应用'); ensureProjectDirectories(root);
  const input=path.join(dir,'输入截图');await fs.mkdir(input,{recursive:true});
  for(let n=0;n<count;n++)await fs.copyFile(fixture,path.join(input,`原始截图${n+1}.png`));
  const store=new Store(root);
  const settings={...store.settings(),sourceFolders:[input],outputFolder:path.join(dir,'整理输出')};
  store.setSettings(settings);
  const images=await scanImages(settings,store,root,()=>{},()=>false);
  const plan=await buildPlan(images.map((i,n)=>({imageId:i.id,categoryId:'study',title:`数学笔记${n+1}`})),settings,store);
  await fs.writeFile(path.join(root,'plan-id.txt'),plan.id);
  return {dir,root,store,plan,images};
}
async function crash(root:string,point:FaultPoint,direction:string) {
  return new Promise<number|null>((resolve,reject)=>{
    const child=spawn(process.execPath,[path.join(project,'node_modules/tsx/dist/cli.mjs'),import.meta.filename,'worker',root,point,direction],
      {cwd:project,windowsHide:true,stdio:['ignore','pipe','pipe']});
    let output='';child.stdout.on('data',c=>output+=c);child.stderr.on('data',c=>output+=c);
    const timer=setTimeout(()=>{child.kill();reject(new Error('中断实验子进程超时：'+output));},30000);
    child.on('error',error=>{clearTimeout(timer);reject(error);});
    child.on('exit',code=>{clearTimeout(timer);evidence.push({root,point,direction,exitCode:code,output});resolve(code);});
  });
}

await test('正常移动与撤销恢复原路径、原名和SHA256',async()=>{
  const c=await setup();try{
    const item=c.plan.items[0];const batch=await new MoveEngine(c.store).apply(c.plan,()=>false);
    assert.equal(batch.records[0].stage,'committed');assert.equal(await exists(item.source),false);
    assert.equal(await fileHash(item.target),originalHash);
    const undone=await new MoveEngine(c.store).undo(batch.id,()=>false);
    assert.equal(undone.records[0].stage,'undone');assert.equal(await exists(item.target),false);
    assert.equal(await fileHash(item.source),originalHash);
  }finally{c.store.close();}
});
await test('执行前目标被占用时保留双方内容，批次其他项继续',async()=>{
  const c=await setup(2);try{
    const occupied=c.plan.items[0].target;await fs.mkdir(path.dirname(occupied),{recursive:true});await fs.writeFile(occupied,'现有内容');
    const batch=await new MoveEngine(c.store).apply(c.plan,()=>false);
    assert.equal(batch.records[0].stage,'failed');assert.equal(batch.records[1].stage,'committed');
    assert.equal(await fs.readFile(occupied,'utf8'),'现有内容');assert.equal(await fileHash(c.plan.items[0].source),originalHash);
    assert.equal(await fileHash(c.plan.items[1].target),originalHash);
  }finally{c.store.close();}
});
await test('源文件在预览后被修改时跳过，其他项继续',async()=>{
  const c=await setup(2);try{
    await fs.appendFile(c.plan.items[0].source,'用户新增内容');const changed=await fileHash(c.plan.items[0].source);
    const batch=await new MoveEngine(c.store).apply(c.plan,()=>false);
    assert.equal(batch.records[0].stage,'failed');assert.equal(batch.records[1].stage,'committed');
    assert.equal(await fileHash(c.plan.items[0].source),changed);assert.equal(await exists(c.plan.items[0].target),false);
  }finally{c.store.close();}
});
await test('撤销原位置被占时不覆盖，移走冲突后可以重试',async()=>{
  const c=await setup();try{
    const engine=new MoveEngine(c.store);const item=c.plan.items[0];const batch=await engine.apply(c.plan,()=>false);
    await fs.writeFile(item.source,'新的原位置文件');const first=await engine.undo(batch.id,()=>false);
    assert.equal(first.records[0].stage,'committed');assert.ok(first.records[0].error);
    assert.equal(await fs.readFile(item.source,'utf8'),'新的原位置文件');assert.equal(await fileHash(item.target),originalHash);
    await fs.rename(item.source,path.join(c.dir,'冲突文件保留.txt'));
    const second=await engine.undo(batch.id,()=>false);assert.equal(second.records[0].stage,'undone');assert.equal(await fileHash(item.source),originalHash);
  }finally{c.store.close();}
});
await test('撤销时整理后的文件已修改，保留内容并报告冲突',async()=>{
  const c=await setup();try{
    const engine=new MoveEngine(c.store);const item=c.plan.items[0];const batch=await engine.apply(c.plan,()=>false);
    await fs.appendFile(item.target,'用户修改');const changed=await fileHash(item.target);
    const result=await engine.undo(batch.id,()=>false);assert.ok(result.records[0].error);assert.equal(await fileHash(item.target),changed);assert.equal(await exists(item.source),false);
  }finally{c.store.close();}
});
await test('同一个预览不能重复执行',async()=>{
  const c=await setup();try{const engine=new MoveEngine(c.store);await engine.apply(c.plan,()=>false);await assert.rejects(()=>engine.apply(c.plan,()=>false));}
  finally{c.store.close();}
});
await test('取消批次不会打断已开始的一项，后续源文件保持完整',async()=>{
  const c=await setup(3);try{
    let completed=0;const result=await new MoveEngine(c.store,()=>completed++).apply(c.plan,()=>completed>=1);
    assert.equal(result.records.length,1);assert.equal(result.records[0].stage,'committed');
    assert.equal(await fileHash(c.plan.items[1].source),originalHash);assert.equal(await fileHash(c.plan.items[2].source),originalHash);
  }finally{c.store.close();}
});

for(const direction of ['forward','undo'])for(const point of ['prepared','copied','published','verified','source-deleted'] as FaultPoint[])for(const action of ['continue','rollback'] as const) {
  await test(`${direction==='forward'?'整理':'撤销'}在${point}硬中断后重启${action==='continue'?'继续':'回滚'}`,async()=>{
    const c=await setup();c.store.close();assert.equal(await crash(c.root,point,direction),88,'必须实际中断子进程');
    const restarted=new Store(c.root);try{
      const record=restarted.recovery()[0];assert.ok(record,'重启后必须发现未完成操作');
      const originalPresent=await exists(record.item.source)&&await fileHash(record.item.source)===originalHash;
      const targetPresent=await exists(record.item.target)&&await fileHash(record.item.target)===originalHash;
      const stagingPresent=record.stagingPath&&await exists(record.stagingPath)&&await fileHash(record.stagingPath)===originalHash;
      assert.ok(originalPresent||targetPresent||stagingPresent,'中断时至少保留一个完整副本');
      await new MoveEngine(restarted).recover(record.id,action);
      const expectRestored=(direction==='forward'&&action==='rollback')||(direction==='undo'&&action==='continue');
      assert.equal(await exists(record.item.source),expectRestored);assert.equal(await exists(record.item.target),!expectRestored);
      assert.equal(await fileHash(expectRestored?record.item.source:record.item.target),originalHash);
      assert.equal(restarted.recovery().length,0);assert.equal(restarted.move(record.id)!.stage,expectRestored?'undone':'committed');
      if(record.stagingPath)assert.equal(await exists(record.stagingPath),false,'已恢复后不得留下未处理的暂存文件');
    }finally{restarted.close();}
  });
}

const sourceHashes:Record<string,string>={};
for(const file of ['src/main/moves.ts','src/main/files.ts','src/main/store.ts'])sourceHashes[file]=createHash('sha256').update(await fs.readFile(path.join(project,file))).digest('hex');
const report={timestamp:new Date().toISOString(),runDirectory:run,sourceHashes,summary:{pass:results.filter(x=>x.status==='pass').length,fail:results.filter(x=>x.status==='fail').length},results,evidence};
await fs.writeFile(path.join(run,'结果.json'),JSON.stringify(report,null,2)+'\n');
await fs.writeFile(path.join(project,'output/监督验收/最新移动结果.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({summary:report.summary,report:path.join(run,'结果.json')}));process.exitCode=report.summary.fail?1:0;
