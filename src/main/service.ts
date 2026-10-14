import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { Store } from './store.js';
import { LocalRuntime } from './runtime.js';
import { MoveEngine } from './moves.js';
import { analyzeImage, analysisCacheKey } from './analyzer.js';
import { cleanName, scanImages, buildPlan, fileHash, exists, validateDirectoryChain } from './files.js';
import { ensureProjectDirectories, isInside, assertOutputLocation } from './paths.js';
import type { Settings, AppState, ImageEntry, AnalysisResult, PlanChoice, Progress, OrganizePlan, BatchView, RuntimeStatus } from '../shared/types.js';
import { DEFAULT_MODEL } from '../shared/types.js';
const settingsSchema=z.object({sourceFolders:z.array(z.string().min(1)).max(100),recursive:z.boolean(),outputFolder:z.string().min(1),categories:z.array(z.object({id:z.string().regex(/^[a-zA-Z0-9_-]+$/),name:z.string().trim().min(1).max(30),description:z.string().max(300),enabled:z.boolean()})).min(1).max(40),model:z.literal(DEFAULT_MODEL),recognitionTimeoutMs:z.number().int().min(30000).max(600000)});
const choicesSchema=z.array(z.object({imageId:z.string().uuid(),categoryId:z.string().min(1),title:z.string().trim().min(1).max(200)})).min(1).max(20000);
export class OrganizerService {
  readonly store: Store;readonly runtime: LocalRuntime;readonly moves: MoveEngine;
  private busy=false;private stopped=false;private controller?:AbortController;
  constructor(readonly root: string, private progress: (event: Progress)=>void=()=>{}) {
    ensureProjectDirectories(root);this.store=new Store(root);this.runtime=new LocalRuntime(root,progress);this.moves=new MoveEngine(this.store,progress);
  }
  async state(): Promise<AppState> {
    const settings=this.store.settings();
    const images=this.store.images().filter(image=>(settings.sourceFolders.some(folder=>isInside(folder,image.path))&&!isInside(settings.outputFolder,image.path)) || image.status==='moved');
    return {settings,images,history:this.store.history(),recovery:this.store.recovery(),runtime:await this.runtime.status(settings.model),projectRoot:this.root};
  }
  async saveSettings(input: Settings): Promise<Settings> {
    if(this.busy) throw new Error('任务运行中，请先停止后再修改设置');
    return this.exclusive(async()=>{
    const settings=settingsSchema.parse(input);
    for(const folder of settings.sourceFolders)await validateDirectoryChain(folder);
    const folders=await Promise.all(settings.sourceFolders.map(p=>fs.realpath(p)));
    settings.sourceFolders=[...new Map(folders.map(folder=>[folder.toLowerCase(),folder])).values()];
    settings.outputFolder=path.resolve(settings.outputFolder);
    assertOutputLocation(this.root,settings.outputFolder,settings.sourceFolders);
    if (!settings.categories.some(c=>c.enabled)) throw new Error('请至少启用一个分类');
    const ids=new Set<string>();const names=new Set<string>();
    for(const category of settings.categories) {category.name=cleanName(category.name,30);if(ids.has(category.id)||names.has(category.name.toLowerCase())) throw new Error('分类编号或名称不能重复');ids.add(category.id);names.add(category.name.toLowerCase());}
    for(const folder of settings.sourceFolders) await validateDirectoryChain(folder);
    await validateDirectoryChain(settings.outputFolder);this.store.setSettings(settings);return settings;
    });
  }
  private async exclusive<T>(task:()=>Promise<T>):Promise<T>{
    if(this.busy)throw new Error('已有任务正在运行，请等待完成或点击停止');
    this.busy=true;try{return await task();}finally{this.busy=false;}
  }
  private async job<T>(phase: Progress['phase'], task: ()=>Promise<T>): Promise<T> {
    return this.exclusive(async()=>{
    this.stopped=false;this.controller=new AbortController();
    this.progress({phase,done:0,total:0,message:'开始处理',running:true});
    try {return await task();}
    finally {this.controller=undefined;this.progress({phase,done:0,total:0,message:this.stopped?'任务已停止':'任务处理结束',running:false});}
    });
  }
  async scan(): Promise<ImageEntry[]> {return this.job('scan',async()=>{
    const settings=this.store.settings();if(!settings.sourceFolders.length) throw new Error('请先选择截图文件夹');
    return scanImages(settings,this.store,this.root,(image,count)=>this.progress({phase:'scan',done:count,total:0,message:image.originalName,running:true,image}),()=>this.stopped);
  });}
  async analyze(ids: string[],force=false): Promise<ImageEntry[]> {return this.job('analyze',async()=>{
    force=z.boolean().parse(force);
    ids=[...new Set(z.array(z.string().uuid()).max(20000).parse(ids))];const settings=this.store.settings();
    if(this.store.recovery().length)throw new Error('有未完成的文件操作，请先恢复或回滚后再识别');
    await this.runtime.start(this.controller!.signal);this.controller!.signal.throwIfAborted();
    const status=await this.runtime.status();if(!status.modelReady) throw new Error('本地模型尚未准备，请点击“准备本地模型”');
    let done=0;const entries:ImageEntry[]=[];
    for(const id of new Set(ids)) {
      if(this.stopped) break;
      const entry=this.store.image(id);if(!entry||entry.status==='moved') continue;
      if(!settings.sourceFolders.some(folder=>isInside(folder,entry.path))) throw new Error('图片不在当前来源目录中');
      if(!entry.width||!entry.height) {entries.push(entry);continue;}
      if(force){entry.confirmed=undefined;entry.analysis=undefined;entry.error=undefined;entry.status='pending';this.store.putImage(entry);this.progress({phase:'analyze',done,total:ids.length,message:entry.originalName,running:true,image:entry});}
      try {
        await validateDirectoryChain(path.dirname(entry.path));
        const info=await fs.lstat(entry.path);if(!info.isFile()||info.isSymbolicLink())throw new Error('原文件不再是普通图片文件，请重新扫描');
        if(await fileHash(entry.path)!==entry.hash) throw new Error('原文件已修改，请重新扫描');
        const key=analysisCacheKey(entry,settings.categories,this.runtime.digest());
        let result:AnalysisResult;
        if(!force&&entry.confirmed&&settings.categories.some(category=>category.id===entry.confirmed!.categoryId&&category.enabled)){
          result={...entry.confirmed,summary:entry.analysis?.summary??'已人工确认标题和分类。',needsReview:false};
        }else{
          const cached=force?undefined:this.store.cached(key);
          result=cached??await analyzeImage(entry,settings.categories,settings.recognitionTimeoutMs,this.controller!.signal);
          if(await fileHash(entry.path)!==entry.hash)throw new Error('原文件在识别过程中发生变化，请重新扫描');
          this.controller!.signal.throwIfAborted();
          if(!cached)this.store.cache(key,result);
          entry.confirmed=undefined;
        }
        entry.analysis=result;entry.error=undefined;entry.status=result.needsReview?'review':'ready';this.store.putImage(entry);
      }catch(error){
        if(this.stopped) break;
        entry.error=(error as Error).name==='TimeoutError'?'识别超时，可稍后重试':(error as Error).message;entry.status='error';this.store.putImage(entry);
      }
      entries.push(entry);this.progress({phase:'analyze',done:++done,total:ids.length,message:entry.error??entry.analysis?.title??entry.originalName,running:true,image:entry});
    }
    return entries;
  });}
  async plan(choices: PlanChoice[]): Promise<OrganizePlan> {return this.exclusive(()=>buildPlan(choicesSchema.parse(choices),this.store.settings(),this.store));}
  async apply(planId: string):Promise<BatchView>{return this.job('apply',async()=>{
    const plan=this.store.plan(z.string().uuid().parse(planId));if(!plan)throw new Error('预览不存在或已执行，请重新预览');
    if(this.store.recovery().length)throw new Error('有未完成的文件操作，请先恢复或回滚后再整理');
    const settings=this.store.settings();
    assertOutputLocation(this.root,settings.outputFolder,settings.sourceFolders);
    if(path.resolve(plan.outputFolder)!==path.resolve(settings.outputFolder))throw new Error('整理目录已修改，请重新预览');
    for(const item of plan.items){
      if(!settings.sourceFolders.some(folder=>isInside(folder,item.source)))throw new Error('截图来源已修改，请重新预览');
      const category=settings.categories.find(category=>category.id===item.categoryId&&category.enabled);
      if(!category||path.dirname(item.target)!==path.join(settings.outputFolder,cleanName(category.name,30)))throw new Error('分类设置已修改，请重新预览');
    }
    return this.moves.apply(plan,()=>this.stopped);
  });}
  async undo(batchId:string):Promise<BatchView>{return this.job('undo',()=>this.moves.undo(z.string().uuid().parse(batchId),()=>this.stopped));}
  async recover(recordId:string,action:'continue'|'rollback'):Promise<void>{return this.job('apply',()=>this.moves.recover(z.string().uuid().parse(recordId),z.enum(['continue','rollback']).parse(action)));}
  stop():void{this.stopped=true;this.controller?.abort();}
  async prepareModel():Promise<RuntimeStatus>{return this.job('setup',()=>this.runtime.prepare(this.store.settings().model,this.controller!.signal));}
  async status():Promise<RuntimeStatus>{return this.runtime.status(this.store.settings().model);}
  async previewPath(id:string):Promise<string>{const entry=this.store.image(z.string().uuid().parse(id));if(!entry||!(await exists(entry.path)))throw new Error('图片不存在');return entry.path;}
  async shutdown():Promise<void>{this.stop();while(this.busy)await new Promise(resolve=>setTimeout(resolve,100));await this.runtime.stop();this.store.close();}
  close():void{this.stop();void this.runtime.stop();this.store.close();}
}
