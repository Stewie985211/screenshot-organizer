import type { BatchView, ImageEntry, PlanChoice, ScreenshotAPI } from '../shared/types';

export interface QuickOrganizeReport {
  total: number;
  batch?: BatchView;
  skipped: { imageId: string; name: string; reason: string }[];
  stopped: boolean;
}
type QuickAPI = Pick<ScreenshotAPI, 'getState' | 'analyze' | 'buildPlan' | 'applyPlan'>;
type Drafts = Record<string, Pick<PlanChoice, 'title' | 'categoryId'>>;
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error)).replace(/^Error invoking remote method '[^']+': Error: /, '');

// Videos deliberately remain "review" after inference. The explicit bulk
// confirmation accepts usable suggestions without changing the manual flow.
function readable(image: ImageEntry) {
  return image.status !== 'moved' && image.width > 0 && image.height > 0 && !!image.hash;
}
function meaningful(title: string) {
  const normalized = title.replace(/[\s:：。.!！?？]/g, '');
  return /[\p{L}\p{N}]/u.test(normalized) && !/^(?:图片|视频|截图|画面|内容|素材)*(?:待确认|待识别|未识别|无法辨认|无法识别|不确定|不明|未知)(?:的?(?:图片|视频|截图|画面|内容|素材))*$/.test(normalized);
}

export async function quickOrganize(api: QuickAPI, scope: ImageEntry[], drafts: Drafts, stopped: () => boolean): Promise<QuickOrganizeReport> {
  const unique = [...new Map(scope.map(image => [image.id, image])).values()];
  const report: QuickOrganizeReport = { total: unique.length, skipped: [], stopped: false };
  if (!unique.length || stopped()) return { ...report, stopped: stopped() };
  let state = await api.getState();
  const current = new Map(state.images.map(image => [image.id, image]));
  const targets = unique.flatMap(({ id }) => {
    const image = current.get(id);
    return image && readable(image) && (image.status === 'pending' || image.status === 'error') ? [id] : [];
  });
  let recognitionError: string | undefined;
  if (targets.length && !stopped()) {
    try { await api.analyze(targets); }
    catch (error) { recognitionError = errorMessage(error); }
    state = await api.getState();
  }
  // A stop during inference must never start a subsequent moving job, which
  // otherwise resets the main process's per-job cancellation state.
  if (stopped()) return { ...report, stopped: true };
  const latest = new Map(state.images.map(image => [image.id, image]));
  const choices: PlanChoice[] = [];
  for (const original of unique) {
    const image = latest.get(original.id);
    const choice = drafts[original.id] ?? image?.confirmed ?? image?.analysis;
    let reason: string | undefined;
    if (!image || image.status === 'moved') reason = '文件已不在当前来源，或已整理';
    else if (!readable(image)) reason = image.error || '文件无法读取，请重新扫描';
    else if (image.status === 'error') reason = image.error || recognitionError || '识别失败，可稍后重试';
    else if (image.status === 'pending') reason = recognitionError || '尚未获得识别结果';
    else if (!choice || !meaningful(choice.title)) reason = '没有可用的内容标题，保留原文件供稍后核对';
    else if (!state.settings.categories.some(category => category.id === choice.categoryId && category.enabled)) reason = '分类不存在或已停用，请重新识别或修改分类';
    if (reason) report.skipped.push({ imageId: original.id, name: original.originalName, reason });
    else choices.push({ imageId: original.id, categoryId: choice!.categoryId, title: choice!.title });
  }
  if (!choices.length || stopped()) return { ...report, stopped: stopped() };
  // Reuse the existing validated plan, journaled move and undo implementation.
  const plan = await api.buildPlan(choices);
  if (stopped()) return { ...report, stopped: true };
  report.batch = await api.applyPlan(plan.id);
  report.stopped = stopped();
  return report;
}
