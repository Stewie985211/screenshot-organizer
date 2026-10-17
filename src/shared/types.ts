export interface Category { id: string; name: string; description: string; enabled: boolean }
export const DEFAULT_MODEL='qwen3-vl:4b-instruct';
export const DEFAULT_CATEGORIES: Category[] = [
  { id: 'study', name: '学习资料', description: '课程、笔记、题目、学习教程、考试与知识资料', enabled: true },
  { id: 'code', name: '代码与报错', description: '程序代码、终端报错、软件配置与技术排障', enabled: true },
  { id: 'chat', name: '聊天记录', description: '即时通信、私信和对话消息', enabled: true },
  { id: 'shopping', name: '购物订单', description: '商品、价格、购物订单、物流与付款凭证', enabled: true },
  { id: 'work', name: '工作文档', description: '工作通知、会议、任务安排、办公文件与表格', enabled: true },
  { id: 'life', name: '生活其他', description: '旅行、饮食、游戏、日常生活及其他可辨认内容', enabled: true }
];
export interface Settings {
  sourceFolders: string[]; recursive: boolean; outputFolder: string;
  categories: Category[]; model: string; recognitionTimeoutMs: number;
}
export interface AnalysisResult { categoryId: string; title: string; summary: string; needsReview: boolean }
export type ImageStatus = 'pending' | 'ready' | 'review' | 'error' | 'moved';
export interface ImageEntry {
  id: string; path: string; originalName: string; hash: string; bytes: number;
  /** 旧记录缺省为 image，保持已有图片与整理历史兼容。 */
  mediaType?: 'image' | 'video'; durationSeconds?: number;
  mtimeMs: number; width: number; height: number; status: ImageStatus;
  analysis?: AnalysisResult; error?: string;
  /** 已确认整理计划的最终结果；原图变更或显式强制识别后失效。 */
  confirmed?: Pick<AnalysisResult, 'categoryId' | 'title'>;
}
export interface PlanChoice { imageId: string; categoryId: string; title: string }
export interface PlanItem {
  imageId: string; source: string; target: string; hash: string; mtimeMs: number;
  categoryId: string; title: string;
}
export interface OrganizePlan { id: string; createdAt: string; outputFolder: string; items: PlanItem[] }
export type MoveStage = 'prepared' | 'copied' | 'verified' | 'committed' | 'failed' | 'undone' | 'conflict';
export interface FileIdentity { dev: string; ino: string }
export interface MoveRecord {
  id: string; batchId: string; item: PlanItem; stage: MoveStage; error?: string;
  createdAt: string; updatedAt: string;
  targetOwned: boolean;
  restoreOwned?: boolean;
  targetIdentity?: FileIdentity;
  restoreIdentity?: FileIdentity;
  direction?: 'forward' | 'undo';
  stagingPath?: string;
}
export interface Batch { id: string; createdAt: string; kind: 'organize'; planId: string; totalItems?: number }
export interface BatchView extends Batch { records: MoveRecord[] }
export interface Progress {
  phase: 'scan' | 'analyze' | 'apply' | 'undo' | 'setup'; done: number; total: number;
  message: string; running: boolean; image?: ImageEntry;
}
export interface RuntimeStatus { runtimeReady: boolean; serverReady: boolean; modelReady: boolean; model: string; detail: string }
export interface AppState { settings: Settings; images: ImageEntry[]; history: BatchView[]; recovery: MoveRecord[]; runtime: RuntimeStatus; projectRoot: string }
export interface ScreenshotAPI {
  getState(): Promise<AppState>;
  chooseFolders(kind: 'source' | 'output'): Promise<string[]>;
  saveSettings(settings: Settings): Promise<Settings>;
  scan(): Promise<ImageEntry[]>;
  analyze(ids: string[], force?: boolean): Promise<ImageEntry[]>;
  buildPlan(choices: PlanChoice[]): Promise<OrganizePlan>;
  applyPlan(planId: string): Promise<BatchView>;
  undoBatch(batchId: string): Promise<BatchView>;
  recover(recordId: string, action: 'continue' | 'rollback'): Promise<void>;
  stop(): Promise<void>;
  prepareModel(): Promise<RuntimeStatus>;
  runtimeStatus(): Promise<RuntimeStatus>;
  reveal(imageId: string): Promise<void>;
  onProgress(callback: (progress: Progress) => void): () => void;
}
