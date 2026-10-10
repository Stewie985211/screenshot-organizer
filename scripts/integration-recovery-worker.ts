// Deliberately exit a separate process after copying, preserving the real journal.
import fs from 'node:fs/promises';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import {Store} from '../src/main/store';
import {MoveEngine} from '../src/main/moves';
import {buildPlan,scanImages} from '../src/main/files';
async function main(){
  const [root,sample]=process.argv.slice(2),folder=path.join(root,'assets',`恢复副本-${randomUUID()}`);
  await fs.mkdir(folder,{recursive:true});await fs.copyFile(sample,path.join(folder,'恢复实验.png'));
  const store=new Store(root),settings={...store.settings(),sourceFolders:[...store.settings().sourceFolders,folder]};store.setSettings(settings);
  const entries=await scanImages(settings,store,root,()=>{},()=>false),image=entries.find(i=>i.path===path.join(folder,'恢复实验.png'))!;
  const plan=await buildPlan([{imageId:image.id,title:'真实进程中断恢复',categoryId:'work'}],settings,store);
  await new MoveEngine(store,()=>{},point=>{if(point==='copied')process.exit(88);}).apply(plan,()=>false);
  throw new Error('预期的进程中断未发生');
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
