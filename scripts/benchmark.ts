import fs from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { ensureProjectDirectories,resolveProjectRoot } from '../src/main/paths.js';
import { LocalRuntime } from '../src/main/runtime.js';
import { analyzeImage, PROMPT_VERSION } from '../src/main/analyzer.js';
import { fileHash } from '../src/main/files.js';
import { openImage } from '../src/main/images.js';
import { DEFAULT_CATEGORIES,DEFAULT_MODEL,type ImageEntry } from '../src/shared/types.js';
import { randomUUID } from 'node:crypto';
async function main(){
  const root=resolveProjectRoot();ensureProjectDirectories(root);
  const manifest=JSON.parse(await fs.readFile(path.join(root,'data/supervision/manifest.json'),'utf8')) as {clearCases:{id:string;file:string;expectedCategoryName:string;acceptableTitleKeywords:string[];kind:string}[];edgeCases:{id:string;file:string;kind:string}[]};
  const runtime=new LocalRuntime(root);await runtime.start();
  const results:Record<string,unknown>[]=[];
  try{
    if(!(await runtime.status()).modelReady)throw new Error('请先准备本地模型');
    for(const sample of manifest.clearCases){
      const file=path.join(root,sample.file);const stat=await fs.stat(file);const meta=await(await openImage(file)).metadata();
      const image:ImageEntry={id:randomUUID(),path:file,originalName:path.basename(file),hash:await fileHash(file),bytes:stat.size,mtimeMs:stat.mtimeMs,width:meta.width!,height:meta.height!,status:'pending'};
      const start=performance.now();
      try{const diagnostics:unknown[]=[];const result=await analyzeImage(image,DEFAULT_CATEGORIES,180000,new AbortController().signal,response=>diagnostics.push(response));const category=DEFAULT_CATEGORIES.find(c=>c.id===result.categoryId)?.name;
        const row={id:sample.id,file:sample.file,expected:sample.expectedCategoryName,actual:category,categoryCorrect:category===sample.expectedCategoryName,title:result.title,titleKeywordMatch:sample.acceptableTitleKeywords.some(word=>result.title.toLowerCase().includes(word.toLowerCase())),needsReview:result.needsReview,summary:result.summary,elapsedMs:Math.round(performance.now()-start)};
        results.push({...row,diagnostics});console.log(JSON.stringify(row));
      }catch(error){const row={id:sample.id,error:(error as Error).message,elapsedMs:Math.round(performance.now()-start)};results.push(row);console.log(JSON.stringify(row));}
      await fs.mkdir(path.join(root,'output/validation'),{recursive:true});await fs.writeFile(path.join(root,'output/validation/model-benchmark.json'),JSON.stringify({kind:'synthetic-fixtures',model:DEFAULT_MODEL,promptVersion:PROMPT_VERSION,digest:runtime.digest(),results},null,2));
    }
    const successes=results.filter(row=>!row.error);const summary={total:results.length,succeeded:successes.length,categoryCorrect:successes.filter(row=>row.categoryCorrect).length,titleKeywordMatch:successes.filter(row=>row.titleKeywordMatch).length,bothMatched:successes.filter(row=>row.categoryCorrect&&row.titleKeywordMatch&&!row.needsReview).length,medianMs:successes.map(row=>row.elapsedMs as number).sort((a,b)=>a-b)[Math.floor(successes.length/2)],note:'合成截图结果，不代表用户真实截图准确率；标题关键词匹配只是自动辅助指标。'};
    await fs.writeFile(path.join(root,'output/validation/model-benchmark.json'),JSON.stringify({kind:'synthetic-fixtures',model:DEFAULT_MODEL,promptVersion:PROMPT_VERSION,digest:runtime.digest(),summary,results},null,2));console.log(JSON.stringify(summary));
    if(successes.length!==results.length)process.exitCode=1;
  }finally{await runtime.stop();}
}
void main().catch(error=>{console.error(error);process.exitCode=1;});
