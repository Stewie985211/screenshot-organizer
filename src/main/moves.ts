import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { exists, fileHash, copyExclusive, validateDirectoryChain } from './files.js';
import { isInside } from './paths.js';
import type { Store } from './store.js';
import type { MoveRecord, OrganizePlan, BatchView, Progress } from '../shared/types.js';
export type FaultPoint = 'prepared' | 'copied' | 'published' | 'verified' | 'source-deleted' | 'committed';
export class MoveEngine {
  constructor(private store: Store, private progress: (event: Progress) => void = () => {}, private fault?: (point: FaultPoint, record: MoveRecord) => void) {}
  private save(record: MoveRecord, stage = record.stage): void { record.stage=stage;record.updatedAt=new Date().toISOString();this.store.putMove(record); }
  private async sameFile(a: string, b: string): Promise<boolean> {
    try { const [one,two]=await Promise.all([fs.stat(a,{bigint:true}),fs.stat(b,{bigint:true})]);return one.dev===two.dev && one.ino===two.ino; } catch { return false; }
  }
  private updateImage(record: MoveRecord, restored: boolean): void {
    const entry=this.store.image(record.item.imageId); if (!entry) return;
    const nextPath=restored ? record.item.source : record.item.target;
    const confirmed={categoryId:record.item.categoryId,title:record.item.title};
    const analysis={...confirmed,summary:entry.analysis?.summary??'已人工确认标题和分类。',needsReview:false};
    this.store.putImage({...entry,path:nextPath,originalName:path.basename(nextPath),analysis,confirmed,status:restored?'ready':'moved',error:undefined});
  }
  private async removeStaging(record: MoveRecord): Promise<void> {
    if (record.stagingPath && await exists(record.stagingPath)) {
      if (!path.basename(record.stagingPath).startsWith(`.organizer-${record.id}-`)) throw new Error('临时文件记录不匹配');
      await validateDirectoryChain(path.dirname(record.stagingPath)); await fs.unlink(record.stagingPath);
    }
  }
  async transfer(record: MoveRecord): Promise<void> {
    const undo=record.direction==='undo';
    const source=undo ? record.item.target : record.item.source;
    const target=undo ? record.item.source : record.item.target;
    const owned=() => undo ? record.restoreOwned : record.targetOwned;
    if (path.resolve(source).toLowerCase()===path.resolve(target).toLowerCase()) throw new Error('原路径与目标路径相同');
    await validateDirectoryChain(path.dirname(source)); await validateDirectoryChain(path.dirname(target));
    const sourceExists=await exists(source);
    if (sourceExists) {
      const stat=await fs.lstat(source); if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('原文件不再是普通图片文件');
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
      const proven=owned() || await this.sameFile(staging,target);
      if (!proven) throw new Error('目标文件已存在，未覆盖，请重新生成整理预览');
      if (await fileHash(target)!==record.item.hash) throw new Error('目标文件已被修改，保留两侧文件等待核对');
    } else {
      if (!sourceExists) throw new Error('原文件和已验证的目标文件均不存在，无法自动恢复');
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
    if (undo) record.restoreOwned=true; else record.targetOwned=true;
    this.save(record,'verified');this.fault?.('verified',record);
    if (published && sourceExists) {
      if (await fileHash(source)!==record.item.hash) throw new Error('原文件在整理过程中发生变化，保留两侧文件等待核对');
      if (await fileHash(target)!==record.item.hash) throw new Error('目标文件在整理过程中发生变化，原文件已保留');
      await fs.unlink(source);
    }
    this.fault?.('source-deleted',record);
    record.error=undefined;this.save(record,undo?'undone':'committed');this.updateImage(record,undo);this.fault?.('committed',record);
    await this.removeStaging(record);
  }
  async apply(plan: OrganizePlan, shouldStop: () => boolean): Promise<BatchView> {
    if (this.store.history().some(batch => batch.planId===plan.id)) throw new Error('此预览已经执行，不能重复整理');
    const batch={id:randomUUID(),createdAt:new Date().toISOString(),kind:'organize' as const,planId:plan.id};
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
    const batch=this.store.batch(batchId);if (!batch) throw new Error('整理记录不存在');
    const records=batch.records.filter(r => r.stage==='committed').reverse();let done=0;
    for (const record of records) {
      if (shouldStop()) break;
      try {
        if (await exists(record.item.source)) throw new Error('原位置已有文件，不能覆盖；请处理冲突后再撤销');
        if (!(await exists(record.item.target)) || await fileHash(record.item.target)!==record.item.hash) throw new Error('整理后的文件不存在或已经被修改，不能自动撤销');
        record.direction='undo';record.restoreOwned=false;record.stagingPath=undefined;record.error=undefined;this.save(record,'prepared');
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
    if (action==='continue') { await this.transfer(record);return; }
    const undo=record.direction==='undo';
    const source=undo?record.item.target:record.item.source;
    const target=undo?record.item.source:record.item.target;
    let owned=undo?record.restoreOwned:record.targetOwned;
    if (!owned && record.stagingPath && await this.sameFile(record.stagingPath,target)) owned=true;
    if (await exists(source)) {
      if (await fileHash(source)!==record.item.hash) throw new Error('原文件内容发生变化，不能自动回滚，请保留两侧文件手动核对');
      if (owned && await exists(target)) {
        await validateDirectoryChain(path.dirname(target));
        if (await fileHash(target)!==record.item.hash) throw new Error('目标内容发生变化，不能自动删除');
        await fs.unlink(target);
      }
      await this.removeStaging(record);record.error=undefined;
      record.direction='forward';this.save(record,undo?'committed':'undone');this.updateImage(record,!undo);
    } else {
      if (!owned || !(await exists(target)) || await fileHash(target)!==record.item.hash) throw new Error('无法证明目标文件完整且属于此次操作，已保留所有文件');
      await this.removeStaging(record);record.stagingPath=undefined;record.direction=undo?'forward':'undo';
      if (undo) record.targetOwned=false;else record.restoreOwned=false;
      record.error=undefined;this.save(record,'prepared');await this.transfer(record);
    }
  }
}
