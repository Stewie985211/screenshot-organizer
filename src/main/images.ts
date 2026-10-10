import fs from 'node:fs/promises';
import path from 'node:path';
import sharp, { type Sharp } from 'sharp';
import { decodeBmp } from './bmp.js';
export async function openImage(file: string): Promise<Sharp> {
  if (path.extname(file).toLowerCase()!=='.bmp') return sharp(file);
  const buffer=await fs.readFile(file);
  if (buffer.length<54 || buffer.toString('ascii',0,2)!=='BM') throw new Error('BMP 文件头无效');
  const width=buffer.readInt32LE(18);const height=Math.abs(buffer.readInt32LE(22));
  if (width<=0 || height<=0 || width*height>40_000_000) throw new Error('BMP 尺寸无效或过大');
  const decoded=decodeBmp(buffer);
  return sharp(decoded.data,{raw:{width:decoded.width,height:decoded.height,channels:3}});
}
export async function previewImage(file: string, full=false): Promise<Buffer> {
  return (await openImage(file)).rotate().resize({width:full?1800:420,height:full?2400:300,fit:'inside',withoutEnlargement:true}).png().toBuffer();
}
