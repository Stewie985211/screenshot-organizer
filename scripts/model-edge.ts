import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { LocalRuntime } from '../src/main/runtime.js';
import { analyzeImage } from '../src/main/analyzer.js';
import { openImage } from '../src/main/images.js';
import { fileHash } from '../src/main/files.js';
import { DEFAULT_CATEGORIES, DEFAULT_MODEL, type ImageEntry } from '../src/shared/types.js';
async function main(){
  const root=process.cwd();const runtime=new LocalRuntime(root);await runtime.start();const results:unknown[]=[];
  try{
    for(const name of ['edge_blank.png','edge_uniform.png']){
      const file=path.join(root,'assets/监督测试截图',name);const stat=await fs.stat(file);const metadata=await(await openImage(file)).metadata();
      const image:ImageEntry={id:randomUUID(),path:file,originalName:name,hash:await fileHash(file),bytes:stat.size,mtimeMs:stat.mtimeMs,width:metadata.width!,height:metadata.height!,status:'pending'};
      const started=Date.now();const diagnostics:unknown[]=[];const analysis=await analyzeImage(image,DEFAULT_CATEGORIES,180000,new AbortController().signal,response=>diagnostics.push(response));
      const result={file:name,analysis,elapsedMs:Date.now()-started,unchanged:await fileHash(file)===image.hash,diagnostics};results.push(result);console.log(JSON.stringify(result));
      assert.equal(analysis.needsReview,true,`${name} 必须待确认`);assert.equal(result.unchanged,true);
    }
  }finally{await fs.writeFile(path.join(root,'output/validation/model-edge.json'),JSON.stringify({model:DEFAULT_MODEL,digest:runtime.digest(),results},null,2));await runtime.stop();}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
