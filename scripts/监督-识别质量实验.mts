import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID, createHash } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { analyzeImage, PROMPT_VERSION } from '../src/main/analyzer.js';
import { LocalRuntime, MODEL_ENDPOINT } from '../src/main/runtime.js';
import { DEFAULT_CATEGORIES } from '../src/shared/types.js';
import { fileHash } from '../src/main/files.js';
import { openImage } from '../src/main/images.js';

const project=path.resolve(import.meta.dirname,'..');
const manifest=JSON.parse(await fs.readFile(path.join(project,'data/supervision/manifest.json'),'utf8'));
const experimentInstruct=process.argv.includes('--experiment-instruct');
const simulateOffline=process.argv.includes('--simulate-offline');
const requestedIds=process.argv.slice(2).filter(arg=>!arg.startsWith('--'));
const clearCases=manifest.clearCases.filter((c:any)=>!requestedIds.length||requestedIds.includes(c.id));
const edgeCases=requestedIds.length?[]:manifest.edgeCases.slice(0,2);
const run=path.join(project,'output/监督验收',`recognition-${new Date().toISOString().replace(/[:.]/g,'-')}`);
await fs.mkdir(run,{recursive:true});
const runtime=new LocalRuntime(project);
const network:unknown[]=[];
const originalFetch=globalThis.fetch;
globalThis.fetch=(async(input:any,init?:RequestInit)=>{
  const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url);
  if(url.origin!==MODEL_ENDPOINT)throw new Error('独立识别实验拒绝非本地网络请求：'+url.origin);
  if(experimentInstruct&&url.pathname==='/api/chat'&&typeof init?.body==='string') {
    const body=JSON.parse(init.body);body.model='qwen3-vl:4b-instruct';init={...init,body:JSON.stringify(body)};
  }
  const at=performance.now();const response=await originalFetch(input,init);
  const evidence:any={url:url.href,method:init?.method??'GET',status:response.status,elapsedMs:Math.round(performance.now()-at)};
  if(url.pathname==='/api/chat') {
    const body=await response.clone().json().catch(()=>({}));
    Object.assign(evidence,{model:body.model,done:body.done,doneReason:body.done_reason,totalDurationNs:body.total_duration,
      loadDurationNs:body.load_duration,promptTokens:body.prompt_eval_count,outputTokens:body.eval_count,responseContent:body.message?.content});
  }
  network.push(evidence);return response;
}) as typeof fetch;

const gpu=async()=>{
  try{return(await promisify(execFile)('nvidia-smi',['--query-gpu=memory.used,memory.total,utilization.gpu','--format=csv,noheader,nounits'],{windowsHide:true,timeout:5000})).stdout.trim();}
  catch{return'不可读取';}
};
const results:any[]=[];
const sourceHashes:Record<string,string>={};
for(const file of ['src/main/analyzer.ts','src/main/files.ts','src/main/images.ts','src/shared/types.ts'])sourceHashes[file]=createHash('sha256').update(await fs.readFile(path.join(project,file))).digest('hex');
const previousProxy=process.env.HTTPS_PROXY;
if(simulateOffline)process.env.HTTPS_PROXY='http://127.0.0.1:9';
try{await runtime.start();}finally{if(previousProxy===undefined)delete process.env.HTTPS_PROXY;else process.env.HTTPS_PROXY=previousProxy;}
const ownsServer=!!(runtime as any).child?.pid;
const runtimePid=(runtime as any).child?.pid;
const status=await runtime.status(experimentInstruct?'qwen3-vl:4b-instruct':undefined);
if(!status.modelReady)throw new Error('实际本地模型尚未下载完成，请等待后再执行。');
const beforeGpu=await gpu();
console.log('LOCAL_MODEL_READY '+runtime.digest());
async function persist() {
  const clear=results.filter(i=>i.kind==='clear');
  const rate=(count:number)=>clear.length?Number((count/clear.length*100).toFixed(1)):0;
  const summary={evaluated:clear.length,totalExpected:clearCases.length,errors:clear.filter(i=>i.error).length,
    categoryCorrect:clear.filter(i=>i.categoryCorrect).length,categoryRate:rate(clear.filter(i=>i.categoryCorrect).length),
    titleKeywordRelevant:clear.filter(i=>i.titleRelevant).length,titleKeywordRate:rate(clear.filter(i=>i.titleRelevant).length),
    autoUsable:clear.filter(i=>i.autoUsable).length,autoUsableRate:rate(clear.filter(i=>i.autoUsable).length),
    completed:results.length===clearCases.length+edgeCases.length};
  const report={timestamp:new Date().toISOString(),datasetKind:'synthetic',note:'标题关键词筛选只是初筛，须人工核对忠实性；不代表用户真实截图准确率。',
    runDirectory:run,sampleScope:requestedIds.length?'selected-reproduction':'full-24-plus-blank',experiment:experimentInstruct?'仅测试请求中将模型替换为4b-instruct；业务代码未改':'production-function',promptVersion:PROMPT_VERSION,model:status.model,modelDigest:runtime.digest(),sourceHashes,
    appNetworkPolicy:'本测试进程拒绝非本地网络请求；仅允许127.0.0.1:21434。未断开用户整机网络。',
    offlineSimulation:{requested:simulateOffline,testOwnedServer:ownsServer,runtimePid,unreachableHttpsProxyApplied:simulateOffline&&ownsServer,cloudDisabled:true},gpuBefore:beforeGpu,summary,results,network};
  await fs.writeFile(path.join(run,'结果.json'),JSON.stringify(report,null,2)+'\n');
  await fs.writeFile(path.join(project,'output/监督验收/最新识别结果.json'),JSON.stringify(report,null,2)+'\n');
  return summary;
}
try {
  for(const item of [...clearCases.map((i:any)=>({...i,kind:'clear'})),...edgeCases.map((i:any)=>({...i,id:path.basename(i.file),kind:'blank'}))]) {
    const at=performance.now();const file=path.join(project,item.file);
    const result:any={id:item.id,file:item.file,kind:item.kind,expectedCategoryName:item.expectedCategoryName};
    try {
      const stats=await fs.stat(file);const meta=await(await openImage(file)).metadata();
      const entry={id:randomUUID(),path:file,originalName:path.basename(file),hash:await fileHash(file),bytes:stats.size,mtimeMs:stats.mtimeMs,width:meta.width!,height:meta.height!,status:'pending' as const};
      const analysis=await analyzeImage(entry,DEFAULT_CATEGORIES,180000,new AbortController().signal);
      const categoryName=DEFAULT_CATEGORIES.find(c=>c.id===analysis.categoryId)?.name;
      Object.assign(result,{analysis,categoryName,categoryCorrect:categoryName===item.expectedCategoryName,
        titleRelevant:item.acceptableTitleKeywords?.some((k:string)=>analysis.title.toLowerCase().includes(k.toLowerCase()))??false});
      result.autoUsable=result.kind==='clear'&&result.categoryCorrect&&result.titleRelevant&&!analysis.needsReview;
      if(result.kind==='blank')result.reviewCorrect=analysis.needsReview;
    }catch(error){result.error=error instanceof Error?`${error.name}: ${error.message}`:String(error);}
    result.elapsedMs=Math.round(performance.now()-at);result.gpuAfter=await gpu();results.push(result);
    console.log(JSON.stringify(result));await persist();
    if(result.error&&/out-of-memory|failed to allocate|unable to allocate/i.test(result.error)) {
      console.log('SYSTEM_MEMORY_BLOCK: 停止后续样本，保留失败证据。');break;
    }
  }
  const summary=await persist();console.log('SUMMARY '+JSON.stringify(summary));
  process.exitCode=summary.errors||summary.autoUsableRate<80||results.some(i=>i.kind==='blank'&&!i.reviewCorrect)?1:0;
}finally{await runtime.stop();globalThis.fetch=originalFetch;}
