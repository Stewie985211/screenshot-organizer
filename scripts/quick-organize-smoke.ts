import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { videoTool } from '../src/main/videos';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { _electron, type ElectronApplication } from 'playwright';
import { fileHash, exists } from '../src/main/files';

const project = process.cwd(), development = process.argv.includes('--dev');
const root = path.join(project, 'output/quick-organize-20261016', `${development ? 'development' : 'packaged'}-${randomUUID().slice(0, 8)}`);
const source = path.join(root, 'assets/混合副本');
const report: Record<string, any> = { root, development, scope: 'real Electron UI, FFmpeg/image decoding, file move and undo; model responses simulated', checks: [] };
let desktop: ElectronApplication | undefined;
const check = (name: string) => { report.checks.push(name); console.log(`PASS ${name}`); };
async function main() {
  await fs.mkdir(source, { recursive: true }); await fs.mkdir(path.join(root, 'data/temp'), { recursive: true });
  if (await exists(path.join(project, 'tools'))) await fs.symlink(path.join(project, 'tools'), path.join(root, 'tools'), 'junction');
  const manifest = JSON.parse(await fs.readFile(path.join(project, 'data/supervision/manifest.json'), 'utf8'));
  await fs.copyFile(path.join(project, manifest.clearCases[0].file), path.join(source, '学习图片.png'));
  await fs.copyFile(path.join(project, manifest.clearCases[2].file), path.join(source, '英语图片.webp'));
  await promisify(execFile)(await videoTool(project, 'ffmpeg'), ['-v', 'error', '-nostdin', '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=10:duration=2.4', '-c:v', 'libx264', '-threads', '1', '-pix_fmt', 'yuv420p', path.join(source, '学习视频.mp4')], { windowsHide: true });
  await sharp({ create: { width: 300, height: 200, channels: 3, background: '#ffffff' } }).png().toFile(path.join(source, '空白图片.png'));
  await fs.writeFile(path.join(source, '损坏图片.png'), 'invalid PNG');
  const before = Object.fromEntries(await Promise.all((await fs.readdir(source)).map(async name => [name, await fileHash(path.join(source, name))])));
  desktop = await _electron.launch({ executablePath: development ? path.join(project, 'node_modules/electron/dist/electron.exe') : process.env.QUICK_APP_PATH ?? path.join(project, 'output/desktop/win-unpacked/ScreenshotOrganizer.exe'), args: development ? [project] : [],
    env: { ...process.env, SCREENSHOT_PROJECT_ROOT: root, TEMP: path.join(root, 'data/temp'), TMP: path.join(root, 'data/temp') }, timeout: 60000 });
  const page = await desktop.firstWindow(), errors: string[] = []; page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
  await page.locator('.desktop-shell').waitFor();
  await desktop.evaluate(() => {
    const original = globalThis.fetch; (globalThis as any).quickCalls = []; (globalThis as any).blockQuick = false;
    globalThis.fetch = async (input, init) => {
      if (String(input).endsWith('/api/tags')) return new Response(JSON.stringify({ models: [{ name: 'qwen3-vl:4b-instruct', digest: 'quick-test-model' }] }));
      if (String(input).endsWith('/api/chat')) {
        const body = JSON.parse(String(init!.body)), video = body.messages[0].content.includes('本地视频整理助手');
        (globalThis as any).quickCalls.push({ video, frames: body.messages[0].images.length });
        if ((globalThis as any).blockQuick) await new Promise<void>((_resolve, reject) => {
          if (init?.signal?.aborted) reject(new Error('任务停止'));
          else init?.signal?.addEventListener('abort', () => reject(new Error('任务停止')), { once: true });
        });
        return new Response(JSON.stringify({ message: { content: JSON.stringify({ categoryId: 'study', title: video ? '数学课程视频' : '学习知识笔记', summary: '用于一键整理回归的模拟建议。', needsReview: true }) } }));
      }
      return original(input, init);
    };
  });
  await page.reload(); await page.locator('.desktop-shell').waitFor();
  const state = () => page.evaluate(() => window.screenshots.getState());
  const idle = () => page.waitForFunction(() => !document.querySelector('.progress-banner') && !document.querySelector<HTMLButtonElement>('.header-actions button')?.disabled, null, { timeout: 30000 });
  const quick = page.getByRole('button', { name: '一键整理', exact: true });
  const runQuick = async (count: number) => { await quick.click(); await page.getByRole('button', { name: `开始一键整理 ${count} 项`, exact: true }).click(); await page.getByRole('dialog', { name: /一键整理结果|一键整理已停止/ }).waitFor({ timeout: 30000 }); await idle(); };
  const undo = async () => { await page.getByRole('button', { name: '查看整理记录', exact: true }).click(); await page.getByRole('button', { name: '撤销本次整理', exact: true }).first().click(); await page.getByRole('button', { name: '确认撤销', exact: true }).click(); await idle(); await page.getByRole('button', { name: /全部素材/ }).first().click(); };
  await desktop.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, source);
  await page.getByRole('button', { name: '选择文件夹', exact: true }).click(); await page.getByRole('button', { name: '添加来源文件夹', exact: true }).click(); await page.getByRole('button', { name: '保存来源并扫描', exact: true }).click(); await idle();
  assert.equal(await page.locator('.shot-card').count(), 5); assert.ok(await quick.isEnabled());
  await quick.click(); await page.getByRole('dialog', { name: '一键整理', exact: true }).waitFor();
  assert.match(await page.locator('.modal-content').innerText(), /分类可能有误/);
  await page.getByRole('button', { name: '取消', exact: true }).click();
  assert.equal((await state()).history.length, 0); assert.equal(await desktop.evaluate(() => (globalThis as any).quickCalls.length), 0);
  check('扫描后无需全选即可操作；确认框展示范围与目标，取消不识别、不移动');

  await page.getByRole('checkbox', { name: '选择 学习视频.mp4', exact: true }).check();
  await runQuick(1); assert.match(await page.getByRole('dialog').innerText(), /1 项成功 · 0 项跳过/);
  let moved = (await state()).images.filter(entry => entry.status === 'moved');
  assert.equal(moved.length, 1); assert.equal(moved[0].mediaType, 'video'); assert.equal(moved[0].analysis?.title, '数学课程视频');
  assert.equal(await fileHash(moved[0].path), before['学习视频.mp4']);
  assert.equal(await exists(path.join(source, '学习视频.mp4')), false);
  assert.equal(await page.getByRole('checkbox', { name: '我已核对素材内容' }).count(), 0);
  await page.screenshot({ path: path.join(root, '01-video-direct-result.png') });
  check('所选视频自动识别并直接整理，无逐项确认、无第二次整理预览');
  await undo(); for (const [name, hash] of Object.entries(before)) assert.equal(await fileHash(path.join(source, name)), hash);
  check('一键批次可通过原整理记录撤销，视频及其他原文件哈希保持一致');

  await page.getByLabel('文件类型', { exact: true }).selectOption('image');
  const edited = (await state()).images.find(entry => entry.originalName === '英语图片.webp')!;
  await page.locator('.shot-card').filter({ has: page.getByRole('checkbox', { name: '选择 英语图片.webp', exact: true }) }).locator('.shot-open').click();
  await page.getByLabel('内容标题', { exact: true }).fill('保留我的手工标题');
  await page.getByLabel('截图分类', { exact: true }).selectOption('work');
  await runQuick(4); assert.match(await page.getByRole('dialog').innerText(), /2 项成功 · 2 项跳过 · 0 项失败/);
  assert.match(await page.locator('.quick-result-list').innerText(), /空白图片.png/); assert.match(await page.locator('.quick-result-list').innerText(), /损坏图片.png/);
  const result = await state(); moved = result.images.filter(entry => entry.status === 'moved'); assert.equal(moved.length, 2);
  assert.equal(moved.find(entry => entry.id === edited.id)?.confirmed?.title, '保留我的手工标题'); assert.equal(moved.find(entry => entry.id === edited.id)?.confirmed?.categoryId, 'work');
  assert.ok(await exists(path.join(source, '学习视频.mp4'))); assert.ok(await exists(path.join(source, '空白图片.png'))); assert.ok(await exists(path.join(source, '损坏图片.png')));
  for (const entry of moved) assert.ok(Object.values(before).includes(await fileHash(entry.path)));
  await page.screenshot({ path: path.join(root, '02-filtered-result.png') });
  check('无选择时仅整理当前图片筛选；保留手工标题分类，跳过空白及坏文件并列出原因');
  await undo(); for (const [name, hash] of Object.entries(before)) assert.equal(await fileHash(path.join(source, name)), hash);

  const countBefore = (await state()).history.length;
  await page.getByLabel('搜索素材', { exact: true }).fill('空白图片'); await runQuick(1);
  assert.match(await page.getByRole('dialog').innerText(), /0 项成功 · 1 项跳过/); assert.equal((await state()).history.length, countBefore);
  await page.getByRole('button', { name: '完成', exact: true }).click();
  check('全部无有效建议时不创建空批次，不移动文件');

  await fs.copyFile(path.join(project, manifest.clearCases[4].file), path.join(source, '停止样本.png'));
  const stopHash = await fileHash(path.join(source, '停止样本.png'));
  await page.getByLabel('搜索素材', { exact: true }).fill(''); await page.getByRole('button', { name: '重新扫描', exact: true }).click(); await idle();
  await page.getByLabel('搜索素材', { exact: true }).fill('停止样本');
  const callsBefore = await desktop.evaluate(() => (globalThis as any).quickCalls.length);
  await desktop.evaluate(() => { (globalThis as any).blockQuick = true; });
  await quick.click(); await page.getByRole('button', { name: '开始一键整理 1 项', exact: true }).click();
  await page.waitForFunction(() => !!document.querySelector('.progress-banner'));
  for (let attempt = 0; attempt < 100; attempt++) { if (await desktop.evaluate(() => (globalThis as any).quickCalls.length) > callsBefore) break; await page.waitForTimeout(50); }
  assert.equal(await desktop.evaluate(() => (globalThis as any).quickCalls.length), callsBefore + 1);
  report.beforeStop = { progress: await page.locator('.progress-banner').innerText(), calls: callsBefore + 1 };
  await page.getByRole('button', { name: '停止', exact: true }).click(); await page.getByRole('dialog', { name: '一键整理已停止', exact: true }).waitFor(); await idle();
  assert.equal((await state()).history.length, countBefore); assert.equal(await fileHash(path.join(source, '停止样本.png')), stopHash);
  await page.getByRole('button', { name: '完成', exact: true }).click();
  await desktop.evaluate(() => { (globalThis as any).blockQuick = false; });
  check('识别中停止不会自动进入移动阶段，原文件及整理批次数量不变');

  if (await page.locator('.toast').count()) await page.locator('.toast').getByRole('button').click();
  await page.getByLabel('搜索素材', { exact: true }).fill(''); await page.locator('.gallery-heading input[type=checkbox]').check();
  for (const [width, height] of [[1440, 960], [1024, 700]]) {
    await desktop.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(size[0], size[1]), [width, height]); await page.waitForTimeout(150);
    const bounds = await page.locator('.selection-bar').evaluate(bar => { const actions = bar.querySelectorAll<HTMLButtonElement>('.selection-actions button'); const info = bar.firstElementChild!.getBoundingClientRect(); return { overflow: document.documentElement.scrollWidth > innerWidth, infoRight: info.right, buttons: [...actions].map(button => { const r = button.getBoundingClientRect(); return { x: r.x, right: r.right, bottom: r.bottom, width: r.width, height: r.height, visible: !!button.getClientRects().length }; }) }; });
    assert.equal(bounds.overflow, false); assert.ok(bounds.infoRight <= bounds.buttons[0].x + 1);
    assert.ok(bounds.buttons.every(button => button.visible && button.width > 70 && button.height > 28 && button.bottom <= height && button.right <= width));
    await page.screenshot({ path: path.join(root, `03-actions-${width}.png`) });
  }
  report.rendererErrors = errors; assert.deepEqual(errors, []); report.calls = await desktop.evaluate(() => (globalThis as any).quickCalls);
  assert.equal(report.calls.length, 4); report.version = await desktop.evaluate(({ app }) => app.getVersion()); assert.equal(report.version, '0.4.0');
  check('1440 与 1024 窗口下两种整理入口均可见无重叠，无渲染错误'); report.success = true;
}
main().catch(error => { report.error = String(error.stack ?? error); console.error(error); process.exitCode = 1; }).finally(async () => {
  if (desktop) await desktop.close(); await fs.mkdir(root, { recursive: true }); await fs.writeFile(path.join(root, 'report.json'), JSON.stringify(report, null, 2)); console.log(`REPORT ${path.join(root, 'report.json')}`);
});
