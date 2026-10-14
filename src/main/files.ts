import { createReadStream, constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { openImage } from './images.js';
import { isInside } from './paths.js';
import type { Store } from './store.js';
import type { ImageEntry, Settings, PlanChoice, OrganizePlan, PlanItem } from '../shared/types.js';
export const SUPPORTED_EXTENSIONS = new Set(['.png','.jpg','.jpeg','.webp','.bmp']);
export async function fileHash(file: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const part of createReadStream(file)) hash.update(part);
  return hash.digest('hex');
}
export async function exists(file: string): Promise<boolean> { try { await fs.lstat(file); return true; } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false; throw error; } }
export function cleanName(value: string, max = 40): string {
  let name = Array.from(value.normalize('NFC').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, ' ').trim()).slice(0, max).join('').replace(/[. ]+$/g, '');
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(name)) name = `_${name}`;
  if (!name || name === '.' || name === '..') throw new Error('名称不能为空或仅包含点号');
  return name;
}
export function fileDate(mtimeMs: number): string {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone:'Asia/Shanghai', year:'numeric', month:'2-digit', day:'2-digit' }).formatToParts(new Date(mtimeMs));
  const value = (type: string) => parts.find(p => p.type === type)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
export async function validateDirectoryChain(directory: string): Promise<void> {
  let current = path.resolve(directory);
  for (;;) {
    try { const stat = await fs.lstat(current); if (stat.isSymbolicLink()) throw new Error('目录包含链接，不能执行移动'); if (!stat.isDirectory()) throw new Error('目标路径中存在非文件夹项目'); }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    const parent = path.dirname(current); if (parent === current) break; current = parent;
  }
}
export async function scanImages(settings: Settings, store: Store, root: string, onItem: (entry: ImageEntry, count: number) => void, shouldStop: () => boolean): Promise<ImageEntry[]> {
  const recovering=store.recovery();
  const recoveryPaths=new Set(recovering.flatMap(record=>[record.item.source,record.item.target,record.stagingPath??'']).map(file=>path.resolve(file).toLowerCase()));
  const excluded = [settings.outputFolder, ...['data','tools','output','.cache','node_modules','dist','.git'].map(n => path.join(root,n))];
  const seen = new Set<string>(); const entries: ImageEntry[] = [];
  async function walk(directory: string): Promise<void> {
    if (shouldStop() || excluded.some(p => isInside(p, directory))) return;
    const canonical = await fs.realpath(directory); const key = canonical.toLowerCase(); if (seen.has(key)) return; seen.add(key);
    for (const item of (await fs.readdir(canonical, { withFileTypes: true })).sort((a,b) => a.name.localeCompare(b.name))) {
      if (shouldStop()) return;
      const file = path.join(canonical, item.name);
      if(recoveryPaths.has(path.resolve(file).toLowerCase()))continue;
      const info = await fs.lstat(file).catch(() => undefined);
      if (!info || info.isSymbolicLink() || excluded.some(p => isInside(p,file))) continue;
      if (info.isDirectory() && settings.recursive) { await walk(file); continue; }
      if (!info.isFile() || !SUPPORTED_EXTENSIONS.has(path.extname(file).toLowerCase())) continue;
      let hash = ''; let width = 0; let height = 0; let error: string | undefined;
      try {
        hash=await fileHash(file);const image=await openImage(file),metadata=await image.metadata();
        width=metadata.autoOrient.width; height=metadata.autoOrient.height;
        if(!width||!height)throw new Error('图片没有有效尺寸');
        // Header metadata alone can succeed even when JPEG pixel data is truncated.
        await image.clone().resize({width:32,height:32,fit:'inside',withoutEnlargement:true}).png().toBuffer();
      }
      catch (failure) { width=0;height=0;error = `读取图片失败：${(failure as Error).message}`; }
      const previous = store.imageAt(file);
      const unchanged = previous && previous.hash === hash && !error && (previous.confirmed||previous.width===width&&previous.height===height);
      let analysis=unchanged?previous.analysis:undefined,confirmed=unchanged?previous.confirmed:undefined;
      if(analysis&&!settings.categories.some(category=>category.id===analysis!.categoryId&&category.enabled)){
        analysis={...analysis,categoryId:settings.categories.find(category=>category.enabled)?.id??'',needsReview:true};confirmed=undefined;
      }
      const entry: ImageEntry = { id: previous?.id ?? randomUUID(), path:file, originalName:path.basename(file), hash, bytes:info.size, mtimeMs:info.mtimeMs, width,height,
        status: error ? 'error' : analysis ? analysis.needsReview ? 'review' : 'ready' : 'pending',analysis,confirmed,error };
      store.putImage(entry); entries.push(entry); onItem(entry,entries.length);
    }
  }
  for (const folder of settings.sourceFolders) { await validateDirectoryChain(folder); await walk(folder); }
  if (!shouldStop()) {
    const found = new Set(entries.map(entry => entry.id));
    const recovering = new Set(store.recovery().map(record => record.item.imageId));
    for (const previous of store.images()) {
      if (previous.status !== 'moved' && !found.has(previous.id) && !recovering.has(previous.id) && settings.sourceFolders.some(folder => isInside(folder, previous.path))) store.removeImage(previous.id);
    }
  }
  return entries;
}
export async function buildPlan(choices: PlanChoice[], settings: Settings, store: Store): Promise<OrganizePlan> {
  if (!choices.length) throw new Error('请至少选择一张图片');
  if(store.recovery().length)throw new Error('有未完成的文件操作，请先恢复或回滚后再整理');
  await validateDirectoryChain(settings.outputFolder);
  const ids = new Set<string>(); const reserved = new Set<string>(); const items: PlanItem[] = [];
  for (const choice of choices) {
    if (ids.has(choice.imageId)) throw new Error('整理列表存在重复图片'); ids.add(choice.imageId);
    const image = store.image(choice.imageId); if (!image || image.status === 'moved') throw new Error('图片不存在或已经整理，请重新扫描');
    if (isInside(settings.outputFolder, image.path)) throw new Error('截图已位于整理目录中，请重新扫描');
    if (!settings.sourceFolders.some(folder => isInside(folder, image.path))) throw new Error('图片不在当前来源目录中');
    const category = settings.categories.find(c => c.id === choice.categoryId && c.enabled); if (!category) throw new Error('分类不存在或已停用');
    if (!image.hash) throw new Error('图片读取失败，不能整理');
    if (image.status==='error' || !image.width || !image.height) throw new Error('图片读取失败，不能生成整理预览，请先重新扫描');
    const categoryName = cleanName(category.name, 30); const title = cleanName(choice.title); const extension = path.extname(image.path);
    const directory = path.join(settings.outputFolder, categoryName);
    let stem = `${fileDate(image.mtimeMs)}_${title}`;
    const budget = 240 - directory.length - extension.length - 6;
    if (budget < 14) throw new Error('目标目录过长，请选择较短的整理目录');
    stem = stem.slice(0, budget).replace(/[. ]+$/g,'');
    let index = 1; let target: string;
    do { target = path.join(directory, `${stem}${index > 1 ? `_${String(index).padStart(2,'0')}` : ''}${extension}`); index++; }
    while (reserved.has(target.toLowerCase()) || await exists(target));
    reserved.add(target.toLowerCase());
    items.push({ imageId:image.id, source:image.path,target,hash:image.hash,mtimeMs:image.mtimeMs,categoryId:category.id,title });
  }
  const plan: OrganizePlan = { id:randomUUID(), createdAt:new Date().toISOString(), outputFolder:settings.outputFolder,items };
  store.savePlan(plan); return plan;
}
export async function recognitionImages(file: string): Promise<string[]> {
  const image = (await openImage(file)).autoOrient(); const metadata = await image.metadata();
  const {width,height}=metadata.autoOrient;
  if (height > width * 3 && height > 2500) {
    const overview = await image.clone().resize({ width:500,height:800,fit:'inside',withoutEnlargement:true }).png().toBuffer();
    const images = [overview.toString('base64')];
    // Up to three readable segments keep VRAM bounded for very long screenshots.
    const segmentHeight = Math.min(1800,height);
    const positions = [...new Set([0, Math.floor((height-segmentHeight)/2), height-segmentHeight])];
    for (const top of positions) images.push((await image.clone().extract({left:0,top,width,height:segmentHeight}).resize({width:700,height:900,fit:'inside',withoutEnlargement:true}).png().toBuffer()).toString('base64'));
    return images;
  }
  return [(await image.resize({width:1200,height:1200,fit:'inside',withoutEnlargement:true}).png().toBuffer()).toString('base64')];
}
export async function copyExclusive(source: string, target: string): Promise<void> { await fs.copyFile(source,target,constants.COPYFILE_EXCL); }
