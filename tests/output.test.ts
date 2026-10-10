import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {OrganizerService} from '../src/main/service.js';
import {fileHash,exists,scanImages} from '../src/main/files.js';

async function setup(){
  const base=path.join(process.cwd(),'output/validation/output-directory',randomUUID().slice(0,8));
  const root=path.join(base,'app'),source=path.join(base,'Screenshot'),external=path.join(base,'The Photos');
  await fs.mkdir(source,{recursive:true});
  const file=path.join(source,'截图.png');
  await sharp({create:{width:24,height:24,channels:3,background:'#a8bcef'}}).png().toFile(file);
  const service=new OrganizerService(root);
  await service.saveSettings({...service.store.settings(),sourceFolders:[source]});
  const [image]=await service.scan();
  return {base,root,source,external,file,image,service};
}

test('项目外 D 盘目标可保存，真实移动和撤销保持原图哈希',async()=>{
  const s=await setup();try{
    const hash=await fileHash(s.file);
    await s.service.saveSettings({...s.service.store.settings(),outputFolder:s.external});
    const plan=await s.service.plan([{imageId:s.image.id,categoryId:'study',title:'核对后的笔记'}]);
    assert.equal(path.dirname(plan.items[0].target),path.join(s.external,'学习资料'));
    const batch=await s.service.apply(plan.id);assert.equal(batch.records[0].stage,'committed');
    assert.equal(await exists(s.file),false);assert.equal(await fileHash(plan.items[0].target),hash);
    const undo=await s.service.undo(batch.id);assert.equal(undo.records[0].stage,'undone');
    assert.equal(await fileHash(s.file),hash);assert.equal(await exists(plan.items[0].target),false);
  }finally{await s.service.shutdown();}
});

test('Screenshot 内的输出子文件夹从图库和扫描排除，不能再次整理',async()=>{
  const s=await setup();try{
    const output=path.join(s.source,'the photos');await fs.mkdir(output);
    const existing=path.join(output,'已整理.png');await fs.copyFile(s.file,existing);
    const prior=await s.service.scan();assert.equal(prior.length,2);
    const excluded=prior.find(image=>image.path===existing)!;
    await s.service.saveSettings({...s.service.store.settings(),outputFolder:output});
    assert.equal((await s.service.state()).images.some(image=>image.id===excluded.id),false);
    await assert.rejects(()=>s.service.plan([{imageId:excluded.id,categoryId:'study',title:'再次整理'}]),/已位于整理目录/);
    const scanned=await scanImages(s.service.store.settings(),s.service.store,s.root,()=>{},()=>false);
    assert.equal(scanned.length,1);assert.equal(scanned[0].path,s.file);
    assert.equal(await fileHash(existing),s.image.hash);
  }finally{await s.service.shutdown();}
});

test('拒绝 C 盘、来源自身及其上级和程序运行目录，不改动原设置或图片',async()=>{
  const s=await setup();try{
    const settings=s.service.store.settings();
    for(const [outputFolder,message] of [
      ['C:\\临时整理测试',/D 盘/],['D:\\',/盘符根目录/],
      [s.source,/来源/],[s.base,/来源/],[path.join(s.root,'data/models'),/运行数据目录/]
    ] as const){
      await assert.rejects(()=>s.service.saveSettings({...settings,outputFolder}),message);
      assert.deepEqual(s.service.store.settings(),settings);
    }
    assert.equal(await fileHash(s.file),s.image.hash);
  }finally{await s.service.shutdown();}
});

test('更换项目外保存路径后旧预览失效，必须重新预览',async()=>{
  const s=await setup();try{
    const plan=await s.service.plan([{imageId:s.image.id,categoryId:'study',title:'旧目标预览'}]);
    await s.service.saveSettings({...s.service.store.settings(),outputFolder:s.external});
    await assert.rejects(()=>s.service.apply(plan.id),/重新预览/);
    assert.equal(await fileHash(s.file),s.image.hash);assert.equal(await exists(plan.items[0].target),false);
    assert.equal(s.service.store.history().length,0);
  }finally{await s.service.shutdown();}
});
