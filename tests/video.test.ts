import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import sharp from 'sharp';
import { OrganizerService } from '../src/main/service.js';
import { fileHash, exists } from '../src/main/files.js';
import { analysisCacheKey } from '../src/main/analyzer.js';
import { analyzeVideo } from '../src/main/video-analyzer.js';
import { videoTool, probeVideo, videoFrames, previewVideo, videoSampleTimes, isVideoFile } from '../src/main/videos.js';
import { DEFAULT_CATEGORIES, DEFAULT_MODEL } from '../src/shared/types.js';
import { MoveEngine } from '../src/main/moves.js';

const run = promisify(execFile);
async function setup() {
  const root = path.join(process.cwd(), 'output/video-local-20261016/tests', randomUUID()), source = path.join(root, 'assets/视频 与图片');
  await fs.mkdir(source, { recursive: true });
  const file = path.join(source, '测试 视频.MP4');
  await run(await videoTool(root, 'ffmpeg'), ['-v', 'error', '-nostdin', '-f', 'lavfi', '-i', 'testsrc2=size=320x240:rate=10:duration=2.4', '-c:v', 'libx264', '-threads', '1', '-pix_fmt', 'yuv420p', '-y', file], { windowsHide: true });
  const service = new OrganizerService(root);
  await service.saveSettings({ ...service.store.settings(), sourceFolders: [source] });
  return { root, source, file, service };
}

test('视频抽样覆盖全时长、限制帧数并拒绝无效时长', () => {
  for (const duration of [0.1, 1, 10, 3600, 100000]) {
    const times = videoSampleTimes(duration);
    assert.ok(times.length >= 3 && times.length <= 6);
    assert.ok(times[0] > 0 && times.at(-1)! < duration);
    assert.ok(times.every((time, i) => i === 0 || time > times[i - 1]));
  }
  assert.throws(() => videoSampleTimes(NaN)); assert.throws(() => videoSampleTimes(0));
  assert.ok(isVideoFile('视频.MP4')); assert.equal(isVideoFile('图片.png'), false);
});

test('真实FFmpeg读取中文路径、有限抽帧和时间标注预览，无落盘抽帧', async () => {
  const s = await setup(); try {
    const before = await fileHash(s.file), info = await probeVideo(s.root, s.file);
    assert.equal(info.width, 320); assert.equal(info.height, 240); assert.ok(Math.abs(info.durationSeconds - 2.4) < .1);
    const samples = await videoFrames(s.root, s.file);
    assert.equal(samples.frames.length, 3);
    for (const frame of samples.frames) { const metadata = await sharp(frame).metadata(); assert.ok(metadata.width! <= 512 && metadata.height! <= 512); }
    const thumbnail = await sharp(await previewVideo(s.root, s.file)).metadata(); assert.ok(thumbnail.width! <= 420);
    const full = await sharp(await previewVideo(s.root, s.file, true)).metadata(); assert.equal(full.width, 1024); assert.equal(full.height, 660);
    assert.deepEqual(await fs.readdir(path.join(s.root, 'data/temp')), []); assert.equal(await fileHash(s.file), before);
  } finally { await s.service.shutdown(); }
});

test('混合扫描保留图片路径、识别视频并阻止损坏视频整理', async () => {
  const s = await setup(); try {
    await sharp({ create: { width: 64, height: 64, channels: 3, background: '#fff' } }).png().toFile(path.join(s.source, '图片.png'));
    await fs.writeFile(path.join(s.source, '损坏.mp4'), 'invalid video');
    const entries = await s.service.scan(); assert.equal(entries.length, 3);
    const video = entries.find(entry => entry.path === s.file)!, image = entries.find(entry => entry.originalName === '图片.png')!, bad = entries.find(entry => entry.originalName === '损坏.mp4')!;
    assert.equal(video.mediaType, 'video'); assert.ok(video.durationSeconds! > 0); assert.equal(video.status, 'pending');
    assert.equal(image.mediaType, 'image'); assert.equal(image.width, 64); assert.equal(bad.status, 'error'); assert.equal(bad.width, 0);
    await assert.rejects(() => s.service.plan([{ imageId: bad.id, categoryId: 'life', title: '损坏视频' }]), /读取失败/);
  } finally { await s.service.shutdown(); }
});

test('纯音频MP4不会被当作可识别视频', async () => {
  const s = await setup(); try {
    const audio = path.join(s.source, '纯音频.mp4');
    await run(await videoTool(s.root, 'ffmpeg'), ['-v', 'error', '-nostdin', '-f', 'lavfi', '-i', 'sine=frequency=400:duration=1', '-c:a', 'aac', '-y', audio], { windowsHide: true });
    await assert.rejects(() => probeVideo(s.root, audio), /有效画面/);
    assert.equal((await s.service.scan()).find(entry => entry.path === audio)?.status, 'error');
  } finally { await s.service.shutdown(); }
});

test('实际生成并扫描MOV、MKV、AVI、M4V、WebM视频容器', async () => {
  const s = await setup(); try {
    for (const extension of ['mov', 'mkv', 'avi', 'm4v', 'webm']) {
      const file = path.join(s.source, `格式验证.${extension}`);
      await run(await videoTool(s.root, 'ffmpeg'), ['-v', 'error', '-nostdin', '-i', s.file, '-an', '-c:v', extension === 'webm' ? 'libvpx-vp9' : 'copy', '-threads', '1', '-y', file], { windowsHide: true });
    }
    const entries = await s.service.scan(); assert.equal(entries.length, 6);
    assert.ok(entries.every(entry => entry.status === 'pending' && entry.mediaType === 'video' && entry.width > 0));
  } finally { await s.service.shutdown(); }
});

test('改写视频后重新扫描清除旧建议与人工确认', async () => {
  const s = await setup(); try {
    const [video] = await s.service.scan();
    s.service.store.putImage({ ...video, analysis: { categoryId: 'life', title: '旧结果', summary: '旧摘要', needsReview: false }, confirmed: { categoryId: 'life', title: '人工旧结果' }, status: 'ready' });
    await run(await videoTool(s.root, 'ffmpeg'), ['-v', 'error', '-nostdin', '-f', 'lavfi', '-i', 'color=blue:size=320x240:rate=10:duration=1', '-c:v', 'libx264', '-threads', '1', '-y', s.file], { windowsHide: true });
    const [changed] = await s.service.scan(); assert.equal(changed.id, video.id); assert.notEqual(changed.hash, video.hash);
    assert.equal(changed.analysis, undefined); assert.equal(changed.confirmed, undefined); assert.equal(changed.status, 'pending');
  } finally { await s.service.shutdown(); }
});

test('旋转MOV的显示尺寸与实际解码方向一致', async () => {
  const s = await setup(); try {
    const rotated = path.join(s.source, '旋转.mov');
    await run(await videoTool(s.root, 'ffmpeg'), ['-v', 'error', '-nostdin', '-display_rotation:v:0', '90', '-i', s.file, '-c', 'copy', '-y', rotated], { windowsHide: true });
    const info = await probeVideo(s.root, rotated); assert.equal(info.width, 240); assert.equal(info.height, 320);
    const { frames } = await videoFrames(s.root, rotated), metadata = await sharp(frames[0]).metadata(); assert.ok(metadata.height! > metadata.width!);
  } finally { await s.service.shutdown(); }
});

test('视频使用本地模型的受限帧输入、类别校验和强制人工核对（模拟响应）', async () => {
  const s = await setup(), originalFetch = globalThis.fetch; try {
    const [video] = await s.service.scan(); let requests = 0;
    globalThis.fetch = async (input, init) => {
      assert.equal(String(input), 'http://127.0.0.1:21434/api/chat'); requests++;
      const body = JSON.parse(String(init!.body)); assert.equal(body.model, DEFAULT_MODEL); assert.equal(body.options.num_ctx, 8192);
      assert.ok(body.messages[0].images.length >= 3 && body.messages[0].images.length <= 6); assert.match(body.messages[0].content, /没有音频/);
      return new Response(JSON.stringify({ message: { content: JSON.stringify({ categoryId: 'code', title: '测试图案画面', summary: '画面显示测试图案。', needsReview: false }) } }));
    };
    const result = await analyzeVideo(s.root, video, DEFAULT_CATEGORIES, 30000, new AbortController().signal);
    assert.equal(requests, 1); assert.equal(result.categoryId, 'code'); assert.equal(result.needsReview, true);
    globalThis.fetch = async () => new Response(JSON.stringify({ message: { content: '{"categoryId":"unknown","title":"错误","summary":"错误","needsReview":false}' } }));
    const invalid = await analyzeVideo(s.root, video, DEFAULT_CATEGORIES, 30000, new AbortController().signal);
    assert.equal(invalid.needsReview, true); assert.match(invalid.title, /待确认/);
  } finally { globalThis.fetch = originalFetch; await s.service.shutdown(); }
});

test('混合识别分流不改变图片流程，视频复用缓存并在撤销重扫后保留人工结果（模拟模型）', async () => {
  const s = await setup(), originalFetch = globalThis.fetch; try {
    await sharp(Buffer.from('<svg width="64" height="64"><rect width="64" height="64" fill="white"/><rect width="32" height="32" fill="black"/></svg>')).png().toFile(path.join(s.source, '图片.png'));
    const entries = await s.service.scan(), video = entries.find(entry => entry.mediaType === 'video')!;
    s.service.runtime.start = async () => {};
    s.service.runtime.status = async () => ({ runtimeReady: true, serverReady: true, modelReady: true, model: DEFAULT_MODEL, detail: 'mocked' });
    let requests = 0;
    globalThis.fetch = async () => { requests++; return new Response(JSON.stringify({ message: { content: '{"categoryId":"life","title":"测试样本","summary":"模拟识别结果","needsReview":false}' } })); };
    const results = await s.service.analyze(entries.map(entry => entry.id)); assert.equal(requests, 2);
    assert.equal(results.find(entry => entry.mediaType === 'video')?.status, 'review'); assert.equal(results.find(entry => entry.mediaType === 'image')?.status, 'ready');
    await s.service.analyze([video.id]); assert.equal(requests, 2);
    const before = await fileHash(s.file), plan = await s.service.plan([{ imageId: video.id, categoryId: 'work', title: '人工视频标题' }]);
    const moved = await s.service.apply(plan.id); assert.equal(moved.records[0].stage, 'committed'); assert.equal(await exists(s.file), false);
    assert.equal(await fileHash(plan.items[0].target), before);
    assert.equal((await s.service.undo(moved.id)).records[0].stage, 'undone');
    await s.service.scan(); const [retained] = await s.service.analyze([video.id]); assert.equal(requests, 2);
    assert.equal(retained.analysis?.title, '人工视频标题'); assert.equal(retained.mediaType, 'video'); assert.equal(await fileHash(s.file), before);
    await s.service.analyze([video.id], true); assert.equal(requests, 3); assert.equal(s.service.store.image(video.id)?.confirmed, undefined);
  } finally { globalThis.fetch = originalFetch; await s.service.shutdown(); }
});

test('视频与图片的缓存隔离，旧图片缓存键保持兼容', async () => {
  const s = await setup(); try {
    const [video] = await s.service.scan();
    assert.notEqual(analysisCacheKey(video, DEFAULT_CATEGORIES, 'digest'), analysisCacheKey({ ...video, mediaType: 'image' }, DEFAULT_CATEGORIES, 'digest'));
    assert.equal(analysisCacheKey({ ...video, mediaType: undefined }, DEFAULT_CATEGORIES, 'digest'), analysisCacheKey({ ...video, mediaType: 'image' }, DEFAULT_CATEGORIES, 'digest'));
  } finally { await s.service.shutdown(); }
});

test('视频抽样的取消不会留下抽帧文件或修改视频', async () => {
  const s = await setup(); try {
    const before = await fileHash(s.file), controller = new AbortController();
    const operation = videoFrames(s.root, s.file, controller.signal); controller.abort();
    await assert.rejects(() => operation, { name: 'AbortError' });
    assert.equal(await fileHash(s.file), before); assert.deepEqual(await fs.readdir(path.join(s.root, 'data/temp')), []);
  } finally { await s.service.shutdown(); }
});

for (const mode of ['startup-failure', 'immediate-stop'] as const) test(`强制重识别在${mode}时也清除视频旧人工确认`, async () => {
  const s = await setup(); try {
    const [video] = await s.service.scan();
    s.service.store.putImage({ ...video, status: 'ready', analysis: { categoryId: 'life', title: '旧标题', summary: '旧摘要', needsReview: false }, confirmed: { categoryId: 'life', title: '旧标题' } });
    s.service.runtime.start = async signal => {
      if (mode === 'startup-failure') throw new Error('模拟模型启动失败');
      s.service.stop(); signal!.throwIfAborted();
    };
    await assert.rejects(() => s.service.analyze([video.id], true));
    assert.equal(s.service.store.image(video.id)?.confirmed, undefined); assert.equal(s.service.store.image(video.id)?.analysis, undefined);
    assert.equal(await fileHash(s.file), video.hash);
  } finally { await s.service.shutdown(); }
});

test('视频整理中断可继续或回滚，原始内容哈希一致', async () => {
  for (const action of ['continue', 'rollback'] as const) {
    const s = await setup(); try {
      const [video] = await s.service.scan(), before = await fileHash(s.file);
      const plan = await s.service.plan([{ imageId: video.id, categoryId: 'life', title: '视频恢复实验' }]);
      const batch = await new MoveEngine(s.service.store, () => {}, stage => { if (stage === 'copied') throw new Error('实验中断'); }).apply(plan, () => false);
      await s.service.recover(batch.records[0].id, action); assert.equal(s.service.store.recovery().length, 0);
      assert.equal(await fileHash(action === 'continue' ? plan.items[0].target : s.file), before);
      assert.equal(s.service.store.image(video.id)?.mediaType, 'video');
    } finally { await s.service.shutdown(); }
  }
});
