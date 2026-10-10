import {build} from 'vite';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../',import.meta.url));
const outDir = path.join(root,'output');
await build({configFile:false,root,base:'./',build:{outDir,emptyOutDir:true,assetsInlineLimit:Infinity}});
let html = await fs.readFile(path.join(outDir,'index.html'),'utf8');
const script = html.match(/<script[^>]*src="([^"]+)"[^>]*><\/script>/);
if(!script)throw new Error('未找到构建脚本，无法生成单文件预览');
const js = await fs.readFile(path.join(outDir,script[1]),'utf8');
html = html.replace(script[0],'');
html = html.replace('</body>',()=>`<script>${js.replaceAll('</script','<\\/script')}</script></body>`);
const style = html.match(/<link[^>]*rel="stylesheet"[^>]*href="([^"]+)"[^>]*>/);
if(style) {
  const css = await fs.readFile(path.join(outDir,style[1]),'utf8');
  html = html.replace(style[0],()=>`<style>${css}</style>`);
}
await fs.writeFile(path.join(outDir,'拾图-交互原型.html'),html,'utf8');
console.log('单文件离线预览：ui-design/output/拾图-交互原型.html');
