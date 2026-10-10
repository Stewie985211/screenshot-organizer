import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { openImage } from '../src/main/images.js';
const project=path.resolve(import.meta.dirname,'..');
const oracle=JSON.parse(await fs.readFile(path.join(project,'data/supervision/bmp-oracles/oracle.json'),'utf8'));
const results:any[]=[];
for(const item of oracle){
  try{
    const result=await(await openImage(path.join(project,item.file))).raw().toBuffer({resolveWithObject:true});
    assert.equal(result.info.width,item.width);assert.equal(result.info.height,item.height);assert.equal(result.info.channels,3);
    assert.equal(result.data.length,item.rgb.length);
    const delta=Math.max(...result.data.map((value,index)=>Math.abs(value-item.rgb[index])));assert.ok(delta<=1,'像素解码与Pillow不一致');
    results.push({file:item.file,status:'pass',maxPixelDelta:delta});console.log('PASS '+path.basename(item.file));
  }catch(error){results.push({file:item.file,status:'fail',error:String(error)});console.log('FAIL '+path.basename(item.file)+': '+error);}
}
const report={timestamp:new Date().toISOString(),oracle:'Pillow independent RGB decode',summary:{pass:results.filter(i=>i.status==='pass').length,fail:results.filter(i=>i.status==='fail').length},results};
await fs.writeFile(path.join(project,'output/监督验收/最新BMP像素结果.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.summary));process.exitCode=report.summary.fail?1:0;
