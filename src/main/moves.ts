import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { exists, fileHash, copyExclusive, validateDirectoryChain } from './files.js';
import { isInside } from './paths.js';
import type { Store } from './store.js';
import type { MoveRecord, OrganizePlan, BatchView, Progress, FileIdentity, MoveStage } from '../shared/types.js';
export type FaultPoint = 'prepared' | 'copied' | 'published' | 'verified' | 'source-deleted' | 'committed';
export class MoveEngine {
  constructor(private store: Store, private progress: (event: Progress) => void = () => {}, private fault?: (point: FaultPoint, record: MoveRecord) => void) {}
  private save(record: MoveRecord, stage = record.stage): void { record.stage=stage;record.updatedAt=new Date().toISOString();this.store.putMove(record); }
  private async sameFile(a: string, b: string): Promise<boolean> {
    try { const [one,two]=await Promise.all([this.identity(a),this.identity(b)]);return one.dev===two.dev && one.ino===two.ino; } catch { return false; }
  }
  private async identity(file:string):Promise<FileIdentity>{
    const stat=await fs.lstat(file,{bigint:true});
    if(!stat.isFile()||stat.isSymbolicLink())throw new Error('文件不再是普通图片文件，可能已被替换为链接');
    return {dev:String(stat.dev),ino:String(stat.ino)};
  }
  private async matchesIdentity(file:string,expected?:FileIdentity):Promise<boolean>{
    const actual=await this.identity(file);return !expected||(actual.dev===expected.dev&&actual.ino===expected.ino);
  }
  private async destinationOwned(record:MoveRecord,target:string):Promise<boolean>{
    const undo=record.direction==='undo',expected=undo?record.restoreIdentity:record.targetIdentity;
    if(!await this.matchesIdentity(target,expected))return false;
    if(record.stagingPath&&await exists(record.stagingPath))return this.sameFile(record.stagingPath,target);
    // Older histories did not store inode identities. Preserve their hash-checked recovery.
    return expected?true:!!(undo?record.restoreOwned:record.targetOwned);
  }
  private complete(record:MoveRecord,stage:MoveStage,restored:boolean):void{
    record.stage=stage;record.updatedAt=new Date().toISOString();
    const entry=this.store.image(record.item.imageId);
    if(!entry){this.store.completeMove(record);return;}
    const nextPath=restored ? record.item.source : record.item.target;
    const confirmed={categoryId:record.item.categoryId,title:record.item.title};
    const analysis={...confirmed,summary:entry.analysis?.summary??'已人工确认标题和分类。',needsReview:false};
    this.store.completeMove(record,{...entry,path:nextPath,originalName:path.basename(nextPath),analysis,confirmed,status:restored?'ready':'moved',error:undefined});
  }
  private async removeStaging(record: MoveRecord): Promise<void> {
    if (record.stagingPath && await exists(record.stagingPath)) {
      if (!path.basename(record.stagingPath).startsWith(`.organizer-${record.id}-`)) throw new Error('临时文件记录不匹配');
      await validateDirectoryChain(path.dirname(record.stagingPath));await this.identity(record.stagingPath);await fs.unlink(record.stagingPath);
    }
  }
  async transfer(record: MoveRecord): Promise<void> {
    const undo=record.direction==='undo';
    const source=undo ? record.item.target : record.item.source;
    const target=undo ? record.item.source : record.item.target;
    if (path.resolve(source).toLowerCase()===path.resolve(target).toLowerCase()) throw new Error('原路径与目标路径相同');
    await validateDirectoryChain(path.dirname(source)); await validateDirectoryChain(path.dirname(target));
    const sourceExists=await exists(source);
    let sourceIdentity:FileIdentity|undefined;
    if (sourceExists) {
      sourceIdentity=await this.identity(source);
      if(undo&&!await this.matchesIdentity(source,record.targetIdentity))throw new Error('整理后的文件已被替换，无法证明属于此次操作');
      if (await fileHash(source)!==record.item.hash) throw new Error('原文件已被修改，已跳过，请重新扫描识别');
    }
    await fs.mkdir(path.dirname(target),{recursive:true});
    if (!record.stagingPath) {
      record.stagingPath=path.join(path.dirname(target),`.organizer-${record.id}-${randomUUID()}.part`);
      this.save(record,'prepared');this.fault?.('prepared',record);
    }
    const staging=record.stagingPath;
    let published=await exists(target);
    if (published) {
      const targetStat=await fs.lstat(target); if (!targetStat.isFile() || targetStat.isSymbolicLink()) throw new Error('目标位置已有其他文件或链接');
      const proven=await this.destinationOwned(record,target);
      if (!proven) throw new Error('目标文件已存在或被替换，无法证明属于此次操作；未覆盖，请重新生成整理预览');
      if (await fileHash(target)!==record.item.hash) throw new Error('目标文件已被修改，保留两侧文件等待核对');
    } else {
      if (!sourceExists) throw new Error('原文件和已验证的目标文件均不存在，无法自动恢复');
      if(await exists(staging))await this.identity(staging);
      if (await exists(staging) && await fileHash(staging)!==record.item.hash) await this.removeStaging(record);
      if (!(await exists(staging))) await copyExclusive(source,staging);
      this.save(record,'copied');this.fault?.('copied',record);
      if (await fileHash(staging)!==record.item.hash) throw new Error('复制后的图片校验失败，原文件已保留');
      await fs.utimes(staging,new Date(record.item.mtimeMs),new Date(record.item.mtimeMs));
      await validateDirectoryChain(path.dirname(target));
      // NTFS hard-link publication is atomic and cannot replace an existing file.
      // Both staging and final name are on the destination volume, even for C: -> D: moves.
      await fs.link(staging,target);published=true;this.fault?.('published',record);
    }
    if (undo) {record.restoreOwned=true;record.restoreIdentity=await this.identity(target);}
    else {record.targetOwned=true;record.targetIdentity=await this.identity(target);}
    this.save(record,'verified');this.fault?.('verified',record);
    if (published && sourceExists) {
      await validateDirectoryChain(path.dirname(source));await validateDirectoryChain(path.dirname(target));
      if(!await this.matchesIdentity(source,sourceIdentity)||!await this.destinationOwned(record,target))throw new Error('文件在整理过程中已被替换，保留两侧文件等待核对');
      if (await fileHash(source)!==record.item.hash) throw new Error('原文件在整理过程中发生变化，保留两侧文件等待核对');
      if (await fileHash(target)!==record.item.hash) throw new Error('目标文件在整理过程中发生变化，原文件已保留');
      await fs.unlink(source);
    }
    this.fault?.('source-deleted',record);
    record.error=undefined;this.complete(record,undo?'undone':'committed',undo);this.fault?.('committed',record);
    await this.removeStaging(record);
  }
  async apply(plan: OrganizePlan, shouldStop: () => boolean): Promise<BatchView> {
    if(this.store.recovery().length)throw new Error('有未完成的文件操作，请先恢复或回滚');
    if (this.store.history().some(batch => batch.planId===plan.id)) throw new Error('此预览已经执行，不能重复整理');
    const batch={id:randomUUID(),createdAt:new Date().toISOString(),kind:'organize' as const,planId:plan.id,totalItems:plan.items.length};
    this.store.addBatch(batch); this.store.consumePlan(plan.id);
    let done=0;
    for (const item of plan.items) {
      if (shouldStop()) break;
      if (!isInside(plan.outputFolder,item.target)) throw new Error('目标文件超出预览的整理目录');
      const record: MoveRecord={id:randomUUID(),batchId:batch.id,item,stage:'prepared',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),targetOwned:false,direction:'forward'};
      this.store.putMove(record);
      try { await this.transfer(record); }
      catch (error) { record.error=(error as Error).message;this.save(record,'failed'); }
      this.progress({phase:'apply',done:++done,total:plan.items.length,message:record.error ?? path.basename(item.target),running:true});
    }
    return this.store.batch(batch.id)!;
  }
  async undo(batchId: string, shouldStop: () => boolean): Promise<BatchView> {
    if(this.store.recovery().length)throw new Error('有未完成的文件操作，请先恢复或回滚');
    const batch=this.store.batch(batchId);if (!batch) throw new Error('整理记录不存在');
    const records=batch.records.filter(r => r.stage==='committed').reverse();let done=0;
    for (const record of records) {
      if (shouldStop()) break;
      try {
        if (await exists(record.item.source)) throw new Error('原位置已有文件，不能覆盖；请处理冲突后再撤销');
        if (!(await exists(record.item.target)) || await fileHash(record.item.target)!==record.item.hash) throw new Error('整理后的文件不存在或已经被修改，不能自动撤销');
        await validateDirectoryChain(path.dirname(record.item.target));
        if(!await this.matchesIdentity(record.item.target,record.targetIdentity))throw new Error('整理后的文件已被替换，无法证明属于此次操作');
        record.direction='undo';record.restoreOwned=false;record.restoreIdentity=undefined;record.stagingPath=undefined;record.error=undefined;this.save(record,'prepared');
        await this.transfer(record);
      } catch (error) {
        record.error=(error as Error).message;
        // A preflight conflict keeps the forward move committed so it can be retried.
        this.save(record,record.direction==='undo'?'failed':'committed');
      }
      this.progress({phase:'undo',done:++done,total:records.length,message:record.error ?? path.basename(record.item.source),running:true});
    }
    return this.store.batch(batchId)!;
  }
  async recover(recordId: string, action: 'continue' | 'rollback'): Promise<void> {
    const record=this.store.move(recordId);if (!record) throw new Error('恢复记录不存在');
    if (!['prepared','copied','verified','failed'].includes(record.stage)) throw new Error('此操作无需恢复');
    try{await this.recoverRecord(record,action);}
    catch(error){record.error=(error as Error).message;this.save(record,'failed');throw error;}
  }
  private async recoverRecord(record:MoveRecord,action:'continue'|'rollback'):Promise<void>{
    if (action==='continue') { await this.transfer(record);return; }
    const undo=record.direction==='undo';
    const source=undo?record.item.target:record.item.source;
    const target=undo?record.item.source:record.item.target;
    await validateDirectoryChain(path.dirname(source));await validateDirectoryChain(path.dirname(target));
    const targetExists=await exists(target),owned=targetExists&&await this.destinationOwned(record,target);
    if(targetExists&&!owned&&(undo?record.restoreOwned:record.targetOwned))throw new Error('目标文件已被替换，无法证明属于此次操作，已保留所有文件');
    if (await exists(source)) {
      await this.identity(source);
      if(undo&&!await this.matchesIdentity(source,record.targetIdentity))throw new Error('整理后的文件已被替换，无法证明属于此次操作');
      if (await fileHash(source)!==record.item.hash) throw new Error('原文件内容发生变化，不能自动回滚，请保留两侧文件手动核对');
      if (owned && await exists(target)) {
        await validateDirectoryChain(path.dirname(target));
        if (await fileHash(target)!==record.item.hash) throw new Error('目标内容发生变化，不能自动删除');
        await fs.unlink(target);
      }
      await this.removeStaging(record);record.error=undefined;
      record.direction='forward';this.complete(record,undo?'committed':'undone',!undo);
    } else {
      if (!owned || !(await exists(target)) || await fileHash(target)!==record.item.hash) throw new Error('无法证明目标文件完整且属于此次操作，已保留所有文件');
      await this.removeStaging(record);record.stagingPath=undefined;record.direction=undo?'forward':'undo';
      if (undo) {record.targetOwned=false;record.targetIdentity=undefined;}
      else {record.restoreOwned=false;record.restoreIdentity=undefined;}
      record.error=undefined;this.save(record,'prepared');await this.transfer(record);
    }
  }
}
