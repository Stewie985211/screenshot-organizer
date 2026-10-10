import path from 'node:path';
import fs from 'node:fs';
export function resolveProjectRoot(start = process.cwd()): string {
  if (process.env.SCREENSHOT_PROJECT_ROOT) return path.resolve(process.env.SCREENSHOT_PROJECT_ROOT);
  let current = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(current, '.screenshot-organizer-root'))) return current;
    const parent = path.dirname(current);
    if (parent === current) throw new Error('找不到项目根目录，请通过“启动截图整理助手.cmd”打开软件');
    current = parent;
  }
}
export function isInside(root: string, target: string): boolean {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..' && !path.isAbsolute(relative));
}
export function assertInside(root: string, target: string): void {
  if (!isInside(root, target)) throw new Error('路径超出允许的目录范围');
}
export function assertOutputLocation(root: string, directory: string, sources: string[]): void {
  const target = path.resolve(directory);
  if (path.parse(target).root.toUpperCase() !== 'D:\\') throw new Error('请选择 D 盘上的整理目录');
  if (target.toLowerCase() === path.parse(target).root.toLowerCase()) throw new Error('请选择具体的整理文件夹，不能使用盘符根目录');
  if (sources.some(source => isInside(target, source))) throw new Error('整理目录不能等于来源文件夹或包含来源文件夹，请选择单独的子文件夹');
  if (['data', 'tools', 'dist', 'node_modules', '.cache', '.git'].some(folder => isInside(path.join(root, folder), target)))
    throw new Error('不能使用程序运行数据目录作为整理目录');
}
export function ensureProjectDirectories(root: string): void {
  for (const name of ['data', 'data/app', 'data/models', 'data/runtime-profile', 'data/runtime-profile/AppData/Local', 'data/runtime-profile/AppData/Roaming', 'data/logs', 'data/temp', 'output/整理后的截图'])
    fs.mkdirSync(path.join(root, name), { recursive: true });
}
export function runtimeEnvironment(root: string): NodeJS.ProcessEnv {
  const profile = path.join(root, 'data/runtime-profile');
  const env: NodeJS.ProcessEnv = { ...process.env, USERPROFILE: profile, APPDATA: path.join(profile, 'AppData/Roaming'), LOCALAPPDATA: path.join(profile, 'AppData/Local'),
    TEMP: path.join(root, 'data/temp'), TMP: path.join(root, 'data/temp'),
    OLLAMA_HOST: '127.0.0.1:21434', OLLAMA_MODELS: path.join(root, 'data/models'),
    OLLAMA_NO_CLOUD: '1', OLLAMA_NUM_PARALLEL: '1', OLLAMA_MAX_LOADED_MODELS: '1',
    OLLAMA_CONTEXT_LENGTH: '4096', NO_PROXY: '127.0.0.1,localhost' };
  // A system HTTP proxy must not intercept calls to the local model server.
  delete env.HTTP_PROXY; delete env.http_proxy; delete env.ALL_PROXY; delete env.all_proxy;
  return env;
}
