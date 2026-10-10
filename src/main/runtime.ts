import fs from 'node:fs/promises';
import { createWriteStream } from 'node:fs';
import path from 'node:path';
import { spawn, execFile, type ChildProcess } from 'node:child_process';
import { promisify } from 'node:util';
import { ensureProjectDirectories, runtimeEnvironment } from './paths.js';
import { exists } from './files.js';
import type { RuntimeStatus, Progress } from '../shared/types.js';
import { DEFAULT_MODEL } from '../shared/types.js';
export const MODEL_ENDPOINT = 'http://127.0.0.1:21434';
export class LocalRuntime {
  private child?: ChildProcess;
  private modelDigest = '';
  constructor(private root: string, private progress: (event: Progress) => void = () => {}) {}
  async status(model = DEFAULT_MODEL): Promise<RuntimeStatus> {
    const runtimeReady = await exists(path.join(this.root,'tools/ollama/ollama.exe'));
    try {
      const response = await fetch(`${MODEL_ENDPOINT}/api/tags`,{signal:AbortSignal.timeout(2000)});
      if (!response.ok) throw new Error('本地模型服务返回错误');
      const json = await response.json() as {models:{name:string;digest:string}[]};
      const selected = json.models.find(m => m.name === model);
      this.modelDigest = selected?.digest ?? '';
      return {runtimeReady,serverReady:true,modelReady:!!selected,model,detail:selected ? '本地模型已就绪' : '本地服务已启动，模型尚未下载'};
    } catch { return {runtimeReady,serverReady:false,modelReady:false,model,detail:runtimeReady ? '本地模型服务尚未启动' : '需要先准备本地运行环境'}; }
  }
  digest(): string { return this.modelDigest; }
  async start(): Promise<void> {
    if ((await this.status()).serverReady) return;
    const executable = path.join(this.root,'tools/ollama/ollama.exe');
    if (!(await exists(executable))) throw new Error('找不到本地模型运行环境，请先运行“准备本地环境.ps1”');
    ensureProjectDirectories(this.root);
    const log = createWriteStream(path.join(this.root,'data/logs/ollama.log'),{flags:'a'});
    this.child = spawn(executable,['serve'],{cwd:path.dirname(executable),env:runtimeEnvironment(this.root),windowsHide:true,stdio:['ignore','pipe','pipe']});
    let spawnError: Error | undefined;
    this.child.on('error', error => { spawnError = error; });
    this.child.stdout?.pipe(log,{end:false}); this.child.stderr?.pipe(log,{end:false});
    this.child.on('exit',() => log.end());
    await fs.writeFile(path.join(this.root,'data/runtime.pid'),String(this.child.pid ?? ''));
    for (let attempt=0; attempt<40; attempt++) {
      if (spawnError) throw spawnError;
      if ((await this.status()).serverReady) return;
      if (this.child.exitCode !== null) throw new Error('本地模型服务启动失败，请查看 data/logs/ollama.log');
      await new Promise(resolve => setTimeout(resolve,250));
    }
    throw new Error('启动本地模型服务超时');
  }
  async prepare(model = DEFAULT_MODEL, signal?: AbortSignal): Promise<RuntimeStatus> {
    if (model !== DEFAULT_MODEL) throw new Error('第一版仅使用本地 qwen3-vl:4b-instruct 模型');
    await this.start();
    const status = await this.status(model); if (status.modelReady) return status;
    const response = await fetch(`${MODEL_ENDPOINT}/api/pull`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({model,stream:true}),signal});
    if (!response.ok || !response.body) throw new Error(`模型下载失败：${await response.text()}`);
    const reader = response.body.getReader(); const decoder = new TextDecoder(); let pending = ''; let lastEmit = 0;
    const consume = (line: string) => {
      if (!line.trim()) return;
      const item = JSON.parse(line) as {status?:string;error?:string;completed?:number;total?:number};
      if (item.error) throw new Error(item.error);
      if (Date.now()-lastEmit > 500 || item.status === 'success') {
        this.progress({phase:'setup',done:item.completed ?? 0,total:item.total ?? 0,message:item.status ?? '准备本地模型',running:true}); lastEmit=Date.now();
      }
    };
    try { for (;;) { const {done,value} = await reader.read(); if (done) break; pending += decoder.decode(value,{stream:true}); const lines = pending.split('\n'); pending=lines.pop() ?? ''; for (const line of lines) consume(line); } consume(pending); }
    finally { reader.releaseLock(); }
    return this.status(model);
  }
  async stop(): Promise<void> {
    const child=this.child;this.child=undefined;
    if(!child?.pid||child.exitCode!==null)return;
    if(process.platform==='win32'){
      try{
        // Terminating just the Go server leaves llama-server.exe holding GPU memory.
        // Only stop the process tree started by this runtime, never a reused server.
        await promisify(execFile)(path.join(process.env.SystemRoot??'C:\\Windows','System32/taskkill.exe'),['/PID',String(child.pid),'/T','/F'],{windowsHide:true,timeout:10000});
      }catch{if(child.exitCode===null)child.kill();}
    }else child.kill();
  }
}
