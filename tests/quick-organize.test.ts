import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quickOrganize } from '../src/renderer/quick-organize.js';
import { DEFAULT_CATEGORIES } from '../src/shared/types.js';
import type { AppState, BatchView, ImageEntry, OrganizePlan, PlanChoice } from '../src/shared/types.js';

function image(id: string, status: ImageEntry['status'] = 'pending'): ImageEntry {
  return { id, path: `D:/samples/${id}.png`, originalName: `${id}.png`, hash: id, bytes: 20, mtimeMs: 0, width: 200, height: 100, status,
    ...(status === 'ready' || status === 'review' ? { analysis: { categoryId: 'study', title: `${id}学习资料`, summary: '内容摘要', needsReview: status === 'review' } } : {}) };
}
function fixture(images: ImageEntry[]) {
  const state = { images, settings: { categories: DEFAULT_CATEGORIES } } as AppState;
  const calls: string[] = [], analyzed: string[][] = [];
  let choices: PlanChoice[] = [];
  const api = {
    async getState() { return structuredClone(state); },
    async analyze(ids: string[]) { calls.push('analyze'); analyzed.push(ids); for (const entry of state.images) if (ids.includes(entry.id)) Object.assign(entry, image(entry.id, 'ready')); return structuredClone(state.images); },
    async buildPlan(input: PlanChoice[]) { calls.push('plan'); choices = input; return { id: 'plan', items: input } as unknown as OrganizePlan; },
    async applyPlan(id: string) { assert.equal(id, 'plan'); calls.push('apply'); return { id: 'batch', records: [] } as unknown as BatchView; }
  };
  return { state, api, calls, analyzed, choices: () => choices };
}

test('一键模式自动识别待识别与失败项，采用待确认视频，保留已有编辑，仅处理指定范围', async () => {
  const pending = image('pending'), retry = image('retry', 'error'), video = { ...image('video', 'review'), mediaType: 'video' as const };
  const f = fixture([pending, retry, video, image('outside')]);
  const report = await quickOrganize(f.api, [pending, retry, video, video], { video: { categoryId: 'work', title: '已修改的讲座标题' } }, () => false);
  assert.deepEqual(f.analyzed, [['pending', 'retry']]);
  assert.deepEqual(f.calls, ['analyze', 'plan', 'apply']);
  assert.equal(report.total, 3); assert.equal(report.skipped.length, 0);
  assert.deepEqual(f.choices().find(choice => choice.imageId === 'video'), { imageId: 'video', categoryId: 'work', title: '已修改的讲座标题' });
  assert.equal(f.choices().some(choice => choice.imageId === 'outside'), false);
});

test('坏文件、占位标题和已停用分类明确跳过，有效待确认建议仍整理', async () => {
  const bad = { ...image('bad', 'error'), width: 0, error: '无效文件' }, blank = image('blank', 'review'), disabled = image('disabled', 'ready'), good = image('good', 'review');
  blank.analysis!.title = '视频内容待确认'; disabled.analysis!.categoryId = 'removed'; good.analysis!.title = 'Windows无法识别USB设备';
  const f = fixture([bad, blank, disabled, good]);
  const report = await quickOrganize(f.api, f.state.images, {}, () => false);
  assert.deepEqual(f.calls, ['plan', 'apply']);
  assert.deepEqual(f.choices().map(choice => choice.imageId), ['good']);
  assert.deepEqual(report.skipped.map(item => item.imageId), ['bad', 'blank', 'disabled']);
  assert.equal(report.skipped[0].reason, '无效文件');
});

test('模型启动失败时保留未识别项，已有可用建议仍可整理', async () => {
  const f = fixture([image('pending'), image('ready', 'ready')]);
  f.api.analyze = async () => { throw new Error('本地模型尚未准备'); };
  const report = await quickOrganize(f.api, f.state.images, {}, () => false);
  assert.deepEqual(f.choices().map(choice => choice.imageId), ['ready']);
  assert.match(report.skipped[0].reason, /模型尚未准备/);
});

test('全部无效时不创建计划或整理记录', async () => {
  const blank = image('blank', 'review'); blank.analysis!.title = '内容待确认';
  const f = fixture([blank]); const report = await quickOrganize(f.api, [blank], {}, () => false);
  assert.equal(report.skipped.length, 1); assert.equal(report.batch, undefined); assert.deepEqual(f.calls, []);
});

test('识别中停止后不进入计划与移动阶段', async () => {
  const f = fixture([image('pending')]); let stopped = false;
  const analyze = f.api.analyze; f.api.analyze = async ids => { const result = await analyze(ids); stopped = true; return result; };
  const report = await quickOrganize(f.api, f.state.images, {}, () => stopped);
  assert.equal(report.stopped, true); assert.deepEqual(f.calls, ['analyze']); assert.equal(report.batch, undefined);
});

test('生成计划期间停止后不启动移动；确认后状态变更不会使用旧建议', async () => {
  const f = fixture([image('gone', 'ready'), image('ready', 'ready')]);
  const scope = structuredClone(f.state.images); f.state.images[0].status = 'moved'; f.state.images[1].analysis!.title = '最新建议';
  let stopped = false; const buildPlan = f.api.buildPlan;
  f.api.buildPlan = async choices => { const result = await buildPlan(choices); stopped = true; return result; };
  const report = await quickOrganize(f.api, scope, {}, () => stopped);
  assert.equal(report.stopped, true); assert.deepEqual(f.calls, ['plan']);
  assert.deepEqual(f.choices(), [{ imageId: 'ready', categoryId: 'study', title: '最新建议' }]);
  assert.equal(report.skipped[0].imageId, 'gone');
});
