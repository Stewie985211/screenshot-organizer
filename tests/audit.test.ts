import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {OrganizerService} from '../src/main/service.js';
import {MoveEngine} from '../src/main/moves.js';
import {buildPlan,exists,fileHash,scanImages} from '../src/main/files.js';
import {analyzeImage} from '../src/main/analyzer.js';
import {LocalRuntime} from '../src/main/runtime.js';

async function setup(){
  const root=path.join(process.cwd(),'output/audit-2026-10-14/cases',randomUUID());
  const source=path.join(root,'assets/input');await fs.mkdir(source,{recursive:true});
  const file=path.join(source,'截图.png');
  await sharp(Buffer.from('<svg width="64" height="64"><rect width="64" height="64" fill="white"/><rect width="32" height="32" fill="black"/></svg>')).png().toFile(file);
  const service=new OrganizerService(root);
  await service.saveSettings({...service.store.settings(),sourceFolders:[source]});
  const [image]=await service.scan();
  const plan=await service.plan([{imageId:image.id,categoryId:'study',title:'核对后的截图'}]);
  return {root,source,file,service,image,plan};
}
async function interrupt(s:Awaited<ReturnType<typeof setup>>,point='copied'){
  return new MoveEngine(s.service.store,()=>{},stage=>{if(stage===point)throw new Error('实验中断');}).apply(s.plan,()=>false);
}

test('未完成的文件操作必须恢复后才能生成或执行另一份预览',async()=>{
  const s=await setup();try{
    const other=await s.service.plan([{imageId:s.image.id,categoryId:'work',title:'另一份预览'}]);
    await interrupt(s);
    await assert.rejects(()=>s.service.plan([{imageId:s.image.id,categoryId:'work',title:'重复整理'}]),/未完成|恢复/);
    await assert.rejects(()=>s.service.apply(other.id),/未完成|恢复/);
    assert.equal(await fileHash(s.file),s.image.hash);
  }finally{await s.service.shutdown();}
});
test('重扫保留未完成操作的图片状态和确认结果',async()=>{
  const s=await setup();try{
    const batch=await interrupt(s,'source-deleted');
    const before=s.service.store.image(s.image.id)!;
    await s.service.saveSettings({...s.service.store.settings(),outputFolder:path.join(s.root,'output/new')});
    await s.service.scan();
    assert.deepEqual(s.service.store.image(s.image.id),before);
    assert.equal(s.service.store.images().length,1);
    await s.service.recover(batch.records[0].id,'rollback');
    assert.equal(await fileHash(s.file),s.image.hash);
  }finally{await s.service.shutdown();}
});
test('撤销恢复路径时合并已失效的同路径图库记录',async()=>{
  const s=await setup();try{
    const batch=await s.service.apply(s.plan.id);
    await fs.copyFile(s.plan.items[0].target,s.file);await s.service.scan();
    const duplicate=s.service.store.imageAt(s.file)!;assert.notEqual(duplicate.id,s.image.id);
    await fs.unlink(s.file);
    const undone=await s.service.undo(batch.id);
    assert.equal(undone.records[0].stage,'undone');assert.equal(undone.records[0].error,undefined);
    assert.equal(s.service.store.imageAt(s.file)?.id,s.image.id);
    assert.equal(s.service.store.image(duplicate.id),undefined);
    assert.equal(s.service.store.recovery().length,0);assert.equal(await fileHash(s.file),s.image.hash);
  }finally{await s.service.shutdown();}
});
for(const action of ['continue','rollback'] as const)test(`恢复 ${action} 拒绝外部替换的同内容目标文件`,async()=>{
  const s=await setup();try{
    const batch=await interrupt(s,'verified'),target=s.plan.items[0].target;
    const bytes=await fs.readFile(target);await fs.unlink(target);await fs.writeFile(target,bytes);
    await assert.rejects(()=>s.service.recover(batch.records[0].id,action),/替换|属于|其他文件/);
    assert.equal(await fileHash(target),s.image.hash);assert.equal(await fileHash(s.file),s.image.hash);
    assert.ok(s.service.store.move(batch.records[0].id)?.error);
  }finally{await s.service.shutdown();}
});
test('正常整理后撤销拒绝被同内容替换的目标文件',async()=>{
  const s=await setup();try{
    const batch=await s.service.apply(s.plan.id),target=s.plan.items[0].target;
    // Keep the original inode alive while replacing the pathname.
    await fs.link(target,path.join(s.source,'original-inode.bin'));
    const bytes=await fs.readFile(target);await fs.unlink(target);await fs.writeFile(target,bytes);
    const undone=await s.service.undo(batch.id);
    assert.equal(undone.records[0].stage,'committed');assert.match(undone.records[0].error!,/替换|属于|其他文件/);
    assert.equal(await exists(s.file),false);assert.equal(await fileHash(target),s.image.hash);
  }finally{await s.service.shutdown();}
});
test('回滚拒绝链接来源目录，保留两侧图片',async()=>{
  const s=await setup();try{
    const batch=await interrupt(s,'verified'),other=path.join(s.root,'assets/other');
    await fs.rename(s.source,other);await fs.symlink(other,s.source,'junction');
    await assert.rejects(()=>s.service.recover(batch.records[0].id,'rollback'),/链接/);
    assert.equal(await fileHash(path.join(other,path.basename(s.file))),s.image.hash);
    assert.equal(await fileHash(s.plan.items[0].target),s.image.hash);
  }finally{await s.service.shutdown();}
});
test('恢复失败原因必须写回操作记录',async()=>{
  const s=await setup();try{
    const batch=await interrupt(s);await fs.appendFile(s.file,'external-change');
    await assert.rejects(()=>s.service.recover(batch.records[0].id,'continue'),/修改/);
    assert.match(s.service.store.move(batch.records[0].id)!.error!,/修改/);
  }finally{await s.service.shutdown();}
});
test('来源链接不能通过 realpath 规范化绕过校验',async()=>{
  const s=await setup();try{
    const link=path.join(s.root,'assets/source-link');await fs.symlink(s.source,link,'junction');
    await assert.rejects(()=>s.service.saveSettings({...s.service.store.settings(),sourceFolders:[link]}),/链接/);
    assert.deepEqual(s.service.store.settings().sourceFolders,[s.source]);
  }finally{await s.service.shutdown();}
});
test('创建预览期间设置保存被任务锁拦截',async()=>{
  const s=await setup();try{
    const pending=s.service.plan([{imageId:s.image.id,categoryId:'study',title:'锁测试'}]);
    await assert.rejects(()=>s.service.saveSettings({...s.service.store.settings(),outputFolder:path.join(s.root,'output/new')}),/任务|等待/);
    await pending;
  }finally{await s.service.shutdown();}
});
test('输出目录不能包含程序运行目录以防分类名绕过保护',async()=>{
  const s=await setup();try{
    const source=path.join(path.dirname(s.root),`${randomUUID()}-external`);await fs.mkdir(source);
    await fs.copyFile(s.file,path.join(source,'截图.png'));
    await assert.rejects(()=>s.service.saveSettings({...s.service.store.settings(),sourceFolders:[source],outputFolder:s.root,categories:s.service.store.settings().categories.map(c=>c.id==='study'?{...c,name:'data'}:c)}),/运行数据目录/);
  }finally{await s.service.shutdown();}
});
test('本地服务重复启动复用一个启动任务，已停止的请求不启动服务',async()=>{
  const runtime=new LocalRuntime(process.cwd());let calls=0;
  runtime.status=async()=>{calls++;await new Promise(resolve=>setTimeout(resolve,10));return {runtimeReady:true,serverReady:true,modelReady:true,model:'qwen3-vl:4b-instruct',detail:'模拟服务'};};
  await Promise.all([runtime.start(),runtime.start()]);assert.equal(calls,1);
  const controller=new AbortController();controller.abort();await assert.rejects(()=>runtime.start(controller.signal));assert.equal(calls,1);
});
test('本地服务父进程提前退出后仍清理自有推理子进程',{skip:process.platform!=='win32'},async()=>{
  const s=await setup();let pid:number|undefined;
  try{
    const tools=path.join(s.root,'tools/ollama');await fs.mkdir(tools,{recursive:true});
    for(const name of ['ollama.exe','llama-server.exe'])await fs.copyFile(process.execPath,path.join(tools,name));
    const pidFile=path.join(s.root,'data/fake-runner.pid');
    await fs.writeFile(path.join(tools,'runner.js'),'setInterval(()=>{},1000);');
    await fs.writeFile(path.join(tools,'serve'),`const {spawn}=require('node:child_process');const fs=require('node:fs');const child=spawn(${JSON.stringify(path.join(tools,'llama-server.exe'))},[${JSON.stringify(path.join(tools,'runner.js'))}],{detached:true,stdio:'ignore',windowsHide:true});fs.writeFileSync(${JSON.stringify(pidFile)},String(child.pid));child.unref();setTimeout(()=>process.exit(0),200);`);
    const runtime=new LocalRuntime(s.root);
    runtime.status=async()=>({runtimeReady:true,serverReady:false,modelReady:false,model:'qwen3-vl:4b-instruct',detail:'模拟离线服务'});
    await assert.rejects(()=>runtime.start(),/启动失败/);
    pid=Number(await fs.readFile(pidFile,'utf8'));assert.ok(pid);process.kill(pid,0);
    await runtime.stop();
    assert.throws(()=>process.kill(pid!,0),'推理子进程必须实际结束');
  }finally{if(pid)try{process.kill(pid);}catch{}await s.service.shutdown();}
});
test('识别期间原图变化时不缓存错误关联的建议',async()=>{
  const s=await setup(),originalFetch=globalThis.fetch;try{
    s.service.runtime.start=async()=>{};
    s.service.runtime.status=async()=>({runtimeReady:true,serverReady:true,modelReady:true,model:'qwen3-vl:4b-instruct',detail:'模拟服务'});
    globalThis.fetch=async()=>{await fs.appendFile(s.file,'changed-during-analysis');return new Response(JSON.stringify({message:{content:JSON.stringify({categoryId:'study',title:'模拟建议',summary:'模拟响应',needsReview:false})}}));};
    const [entry]=await s.service.analyze([s.image.id],true);
    assert.equal(entry.status,'error');assert.match(entry.error!,/识别过程中发生变化/);
    const {analysisCacheKey}=await import('../src/main/analyzer.js');
    assert.equal(s.service.store.cached(analysisCacheKey(s.image,s.service.store.settings().categories,s.service.runtime.digest())),undefined);
  }finally{globalThis.fetch=originalFetch;await s.service.shutdown();}
});
test('来源存在像素数据截断的图片时不能人工整理',async()=>{
  const s=await setup();try{
    const corrupt=path.join(s.source,'truncated.jpg'),bytes=await sharp({create:{width:200,height:200,channels:3,background:'red'}}).jpeg().toBuffer();
    await fs.writeFile(corrupt,bytes.subarray(0,Math.floor(bytes.length*.8)));
    const images=await s.service.scan(),entry=images.find(i=>i.path===corrupt)!;
    assert.equal(entry.status,'error');
    await assert.rejects(()=>s.service.plan([{imageId:entry.id,categoryId:'study',title:'坏图'}]),/读取失败/);
  }finally{await s.service.shutdown();}
});
test('扫描和长图识别使用 JPEG EXIF 旋转后的方向与尺寸',async()=>{
  const s=await setup();try{
    const file=path.join(s.source,'oriented.jpg');
    await sharp({create:{width:2700,height:800,channels:3,background:'white'}}).jpeg().withMetadata({orientation:6}).toFile(file);
    const entry=(await s.service.scan()).find(i=>i.path===file)!;
    assert.equal(entry.width,800);assert.equal(entry.height,2700);
    const {recognitionImages}=await import('../src/main/files.js');
    const images=await recognitionImages(file);assert.equal(images.length,4);
    const first=await sharp(Buffer.from(images[0],'base64')).metadata();assert.ok(first.height!>first.width!);
  }finally{await s.service.shutdown();}
});
for(const point of ['prepared','copied','published','verified','source-deleted','committed'] as const){
  for(const action of ['continue','rollback'] as const)test(`撤销中断于 ${point} 后重启并 ${action}`,async()=>{
    const s=await setup();try{
      const batch=await s.service.apply(s.plan.id);
      await new MoveEngine(s.service.store,()=>{},stage=>{if(stage===point)throw new Error('撤销实验中断');}).undo(batch.id,()=>false);
      const record=s.service.store.batch(batch.id)!.records[0];
      await s.service.shutdown();
      const restarted=new OrganizerService(s.root);try{
        await restarted.recover(record.id,action);
        assert.equal(restarted.store.move(record.id)?.stage,action==='continue'?'undone':'committed');
        assert.equal(await fileHash(action==='continue'?s.file:s.plan.items[0].target),s.image.hash);
        assert.equal(await exists(action==='continue'?s.plan.items[0].target:s.file),false);
        assert.equal(restarted.store.recovery().length,0);
      }finally{await restarted.shutdown();}
    }finally{/* The original service was closed before the restart. */}
  });
}
test('分类停用后重扫让旧结果待确认',async()=>{
  const s=await setup();try{
    s.service.store.putImage({...s.image,status:'ready',analysis:{categoryId:'study',title:'旧分类建议',summary:'摘要',needsReview:false},confirmed:{categoryId:'study',title:'旧分类建议'}});
    await s.service.saveSettings({...s.service.store.settings(),categories:s.service.store.settings().categories.map(c=>({...c,enabled:c.id!=='study'}))});
    const [entry]=await s.service.scan();assert.equal(entry.status,'review');assert.equal(entry.confirmed,undefined);
    assert.ok(s.service.store.settings().categories.some(c=>c.id===entry.analysis?.categoryId&&c.enabled));
  }finally{await s.service.shutdown();}
});
test('强制识别失败后旧人工确认不会再次生效',async()=>{
  const s=await setup(),originalFetch=globalThis.fetch;try{
    s.service.store.putImage({...s.image,status:'ready',analysis:{categoryId:'study',title:'人工标题',summary:'摘要',needsReview:false},confirmed:{categoryId:'study',title:'人工标题'}});
    s.service.runtime.start=async()=>{};
    s.service.runtime.status=async()=>({runtimeReady:true,serverReady:true,modelReady:true,model:'qwen3-vl:4b-instruct',detail:'模拟状态'});
    globalThis.fetch=async()=>new Response('模拟识别服务失败',{status:500});
    await s.service.analyze([s.image.id],true);
    assert.equal(s.service.store.image(s.image.id)?.confirmed,undefined);
    assert.equal(s.service.store.image(s.image.id)?.analysis,undefined);
  }finally{globalThis.fetch=originalFetch;await s.service.shutdown();}
});
test('识别重试共用单张超时预算',async()=>{
  const s=await setup(),originalFetch=globalThis.fetch;try{
    let calls=0;
    globalThis.fetch=async(_url,init)=>{
      calls++;
      await new Promise<void>((resolve,reject)=>{
        const signal=init!.signal!;const timer=setTimeout(resolve,90);
        signal.addEventListener('abort',()=>{clearTimeout(timer);reject(signal.reason);},{once:true});
        if(signal.aborted){clearTimeout(timer);reject(signal.reason);}
      });
      return new Response(JSON.stringify({message:{content:'incomplete'}}),{headers:{'Content-Type':'application/json'}});
    };
    const start=performance.now();
    await assert.rejects(()=>analyzeImage(s.image,s.service.store.settings().categories,150,new AbortController().signal));
    assert.equal(calls,2);assert.ok(performance.now()-start<210,'两次请求不能各自消耗完整超时预算');
  }finally{globalThis.fetch=originalFetch;await s.service.shutdown();}
});
