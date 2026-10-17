import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { videoTool } from '../src/main/videos';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { _electron, type ElectronApplication } from 'playwright';
import { fileHash, exists } from '../src/main/files';

const project = process.cwd(), baseline = process.argv.includes('--baseline'), development = process.argv.includes('--dev');
const root = path.join(project, 'output/select-all-20261016', `${baseline ? 'baseline' : development ? 'development' : 'packaged'}-${randomUUID().slice(0, 8)}`);
const source = path.join(root, 'assets/混合副本'), report: Record<string, any> = { root, baseline, development, scope: 'real Electron UI, actual image/video decoding and file operations; model responses simulated', checks: [] };
let desktop: ElectronApplication | undefined;
const check = (name: string) => { report.checks.push(name); console.log(`PASS ${name}`); };
async function main() {
  await fs.mkdir(source, { recursive: true }); await fs.mkdir(path.join(root, 'data/temp'), { recursive: true });
  if (await exists(path.join(project, 'tools'))) await fs.symlink(path.join(project, 'tools'), path.join(root, 'tools'), 'junction');
  const manifest = JSON.parse(await fs.readFile(path.join(project, 'data/supervision/manifest.json'), 'utf8'));
  await fs.copyFile(path.join(project, manifest.clearCases[0].file), path.join(source, '学习图片.png'));
  await fs.copyFile(path.join(project, manifest.clearCases[2].file), path.join(source, '英语图片.webp'));
  await promisify(execFile)(await videoTool(project, 'ffmpeg'), ['-v', 'error', '-nostdin', '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=10:duration=2.4', '-c:v', 'libx264', '-threads', '1', '-pix_fmt', 'yuv420p', path.join(source, '学习视频.mp4')], { windowsHide: true });
  await fs.writeFile(path.join(source, '损坏图片.png'), 'invalid PNG');
  const before = Object.fromEntries(await Promise.all((await fs.readdir(source)).map(async name => [name, await fileHash(path.join(source, name))])));
  desktop = await _electron.launch({ executablePath: development ? path.join(project, 'node_modules/electron/dist/electron.exe') : process.env.SELECTION_APP_PATH ?? path.join(project, 'output/desktop/win-unpacked/ScreenshotOrganizer.exe'), args: development ? [project] : [],
    env: { ...process.env, SCREENSHOT_PROJECT_ROOT: root, TEMP: path.join(root, 'data/temp'), TMP: path.join(root, 'data/temp') }, timeout: 60000 });
  const page = await desktop.firstWindow(), errors: string[] = []; page.setDefaultTimeout(15000); page.on('pageerror', error => errors.push(error.message));
  await page.locator('.desktop-shell').waitFor();
  await desktop.evaluate(() => {
    const original = globalThis.fetch; (globalThis as any).selectionCalls = [];
    globalThis.fetch = async (input, init) => {
      if (String(input).endsWith('/api/tags')) return new Response(JSON.stringify({ models: [{ name: 'qwen3-vl:4b-instruct', digest: 'selection-test-model' }] }));
      if (String(input).endsWith('/api/chat')) {
        const body = JSON.parse(String(init!.body)), video = body.messages[0].content.includes('本地视频整理助手');
        (globalThis as any).selectionCalls.push({ video, frameCount: body.messages[0].images.length });
        await new Promise(resolve => setTimeout(resolve, 100));
        return new Response(JSON.stringify({ message: { content: JSON.stringify({ categoryId: 'study', title: video ? '视频数学笔记' : '图片学习笔记', summary: '用于测试选择流程的模拟建议。', needsReview: false }) } }));
      }
      return original(input, init);
    };
  });
  await page.reload(); await page.locator('.desktop-shell').waitFor();
  const state = () => page.evaluate(() => window.screenshots.getState());
  const idle = () => page.waitForFunction(() => !document.querySelector('.progress-banner') && !document.querySelector<HTMLButtonElement>('.header-actions button')?.disabled, null, { timeout: 30000 });
  await desktop.evaluate(({ dialog }, folder) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] }); }, source);
  await page.getByRole('button', { name: '选择文件夹', exact: true }).click(); await page.getByRole('button', { name: '添加来源文件夹', exact: true }).click(); await page.getByRole('button', { name: '保存来源并扫描', exact: true }).click(); await idle();
  assert.equal(await page.locator('.shot-card').count(), 4);
  const all = page.locator('.gallery-heading input[type=checkbox]');
  report.afterScan = { allDisabled: await all.isDisabled(), disabledCards: await page.locator('.shot-check input:disabled').count() };
  if (baseline) { assert.equal(report.afterScan.allDisabled, true); assert.equal(report.afterScan.disabledCards, 4); await page.screenshot({ path: path.join(root, '01-disabled-after-scan.png') }); report.bugReproduced = true; check('旧版复现：扫描后全选四项全部禁用'); return; }
  assert.equal(await all.isEnabled(), true); assert.equal(report.afterScan.disabledCards, 1);
  await all.check(); assert.equal(await page.locator('.shot-check input:checked').count(), 3);
  assert.equal(await page.locator('.selection-bar').getByRole('button', { name: /识别所选/ }).isEnabled(), true);
  check('扫描后全选可点击，选择未识别图片和视频，损坏项排除');
  await page.getByLabel('文件类型', { exact: true }).selectOption('video'); await all.uncheck();
  assert.equal(await page.locator('.selection-bar strong').innerText(), '已选择 2 项素材');
  await page.getByLabel('文件类型', { exact: true }).selectOption('all'); await all.check(); assert.equal(await page.locator('.shot-check input:checked').count(), 3);
  await all.uncheck(); assert.equal(await page.locator('.shot-check input:checked').count(), 0);
  await page.getByLabel('文件类型', { exact: true }).selectOption('image'); await all.check(); assert.equal(await page.locator('.shot-check input:checked').count(), 2);
  await page.getByLabel('文件类型', { exact: true }).selectOption('all'); await all.check();
  check('全选和取消全选遵守当前类型筛选，保留其他筛选的选择');
  await page.locator('.selection-bar').getByRole('button', { name: /识别所选/ }).click(); await idle();
  assert.equal(await page.locator('.shot-check input:checked').count(), 3);
  const results = (await state()).images; assert.equal(results.filter(entry => entry.status === 'ready').length, 2); assert.equal(results.filter(entry => entry.status === 'review').length, 1);
  assert.equal(await page.locator('.selection-bar').getByRole('button', { name: /核对所选/ }).isEnabled(), true);
  assert.equal(await page.locator('.selection-bar').getByRole('button', { name: /整理预览/ }).count(), 0);
  await page.screenshot({ path: path.join(root, '02-selection-retained.png') }); check('批量识别后保留全选，视频待核对时提供可点击下一步');
  await page.locator('.selection-bar').getByRole('button', { name: /核对所选/ }).click();
  await page.locator('.inspector .video-note').waitFor(); assert.ok(await page.getByRole('button', { name: '确认并加入整理', exact: true }).isDisabled());
  await page.getByRole('checkbox', { name: '我已核对素材内容' }).check(); await page.getByRole('button', { name: '确认并加入整理', exact: true }).click();
  assert.equal(await page.locator('.shot-check input:checked').count(), 3);
  assert.ok(await page.locator('.selection-bar').getByRole('button', { name: /整理预览/ }).isEnabled());
  await page.getByLabel('内容标题', { exact: true }).fill('人工核对数学视频');
  assert.equal(await page.locator('.shot-check input:checked').count(), 3);
  assert.equal(await page.locator('.selection-bar').getByRole('button', { name: /核对所选/ }).count(), 1);
  assert.equal(await page.getByRole('checkbox', { name: '我已核对素材内容' }).isChecked(), false);
  await page.getByRole('checkbox', { name: '我已核对素材内容' }).check(); await page.getByRole('button', { name: '确认并加入整理', exact: true }).click();
  check('修改待核对视频保留选择并要求重新核对，不跳过人工确认');
  await page.locator('.selection-bar').getByRole('button', { name: /整理预览/ }).click();
  await page.getByRole('dialog', { name: '整理预览', exact: true }).waitFor(); assert.equal(await page.locator('.plan-row').count(), 3);
  await page.getByRole('button', { name: '确认整理 3 项', exact: true }).click(); await idle();
  const moved = (await state()).images.filter(entry => entry.status === 'moved'); assert.equal(moved.length, 3);
  assert.deepEqual(await fs.readdir(source), ['损坏图片.png']);
  for (const entry of moved) { assert.equal(await exists(path.join(source, entry.originalName)), false); assert.ok(Object.values(before).includes(await fileHash(entry.path))); }
  assert.equal(await fs.readFile(path.join(source, '损坏图片.png'), 'utf8'), 'invalid PNG');
  await page.getByRole('button', { name: '整理记录', exact: true }).click(); await page.getByRole('button', { name: '撤销本次整理', exact: true }).click(); await page.getByRole('button', { name: '确认撤销', exact: true }).click(); await idle();
  for (const [name, hash] of Object.entries(before)) assert.equal(await fileHash(path.join(source, name)), hash);
  check('全选三项实际预览、整理、撤销，文件内容完整恢复且未混入损坏项');
  await page.getByRole('button', { name: /全部素材/ }).first().click(); await page.getByRole('button', { name: '重新扫描', exact: true }).click(); await idle();
  await all.check(); assert.equal(await page.locator('.shot-check input:checked').count(), 3);
  assert.equal(await page.locator('.selection-bar').getByRole('button', { name: /整理预览/ }).count(), 1);
  check('撤销与重新扫描后的已确认结果可全选直接整理');
  for (const [width, height] of [[1440, 960], [1024, 700]]) {
    await desktop.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setSize(size[0], size[1]), [width, height]); await page.waitForTimeout(150);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    const box = await page.locator('.selection-bar .preview-button').boundingBox(); assert.ok(box && box.y + box.height <= height);
    await page.screenshot({ path: path.join(root, `03-selection-${width}.png`) });
  }
  assert.deepEqual(errors, []); report.rendererErrors = errors; report.calls = await desktop.evaluate(() => (globalThis as any).selectionCalls);
  assert.equal(report.calls.length, 3); check('正常与最小窗口按钮可见，无渲染错误，识别仅执行所选三项'); report.success = true;
}
main().catch(error => { report.error = String(error.stack ?? error); console.error(error); process.exitCode = 1; }).finally(async () => {
  if (desktop) await desktop.close(); await fs.mkdir(root, { recursive: true }); await fs.writeFile(path.join(root, 'report.json'), JSON.stringify(report, null, 2)); console.log(`REPORT ${path.join(root, 'report.json')}`);
});
