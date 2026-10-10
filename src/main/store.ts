import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { DEFAULT_CATEGORIES, DEFAULT_MODEL, type Settings, type ImageEntry, type AnalysisResult, type OrganizePlan, type Batch, type BatchView, type MoveRecord } from '../shared/types.js';
export class Store {
  private db: DatabaseSync;
  constructor(root: string) {
    this.db = new DatabaseSync(path.join(root, 'data/app/organizer.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS images (id TEXT PRIMARY KEY, path TEXT UNIQUE NOT NULL, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS analyses (key TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS plans (id TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS batches (id TEXT PRIMARY KEY, json TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS moves (id TEXT PRIMARY KEY, batch_id TEXT NOT NULL, json TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS moves_batch ON moves(batch_id); PRAGMA user_version=1;`);
    if (!this.get<Settings>('settings', 'app')) this.setSettings({ sourceFolders: [], recursive: true,
      outputFolder: path.join(root, 'output/整理后的截图'), categories: structuredClone(DEFAULT_CATEGORIES), model: DEFAULT_MODEL, recognitionTimeoutMs: 180000 });
    const existing=this.settings();if(existing.model==='qwen3-vl:4b')this.setSettings({...existing,model:DEFAULT_MODEL});
  }
  private get<T>(table: string, key: string): T | undefined {
    const column = table === 'settings' || table === 'analyses' ? 'key' : 'id';
    const row = this.db.prepare(`SELECT json FROM ${table} WHERE ${column}=?`).get(key) as {json: string} | undefined;
    return row ? JSON.parse(row.json) as T : undefined;
  }
  settings(): Settings { return this.get<Settings>('settings', 'app')!; }
  setSettings(settings: Settings): void { this.db.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run('app', JSON.stringify(settings)); }
  images(): ImageEntry[] { return (this.db.prepare('SELECT json FROM images ORDER BY rowid DESC').all() as {json: string}[]).map(r => JSON.parse(r.json)); }
  image(id: string): ImageEntry | undefined { return this.get<ImageEntry>('images', id); }
  imageAt(file: string): ImageEntry | undefined {
    const row = this.db.prepare('SELECT json FROM images WHERE path=?').get(file) as {json: string} | undefined;
    return row ? JSON.parse(row.json) : undefined;
  }
  putImage(entry: ImageEntry): void {
    this.db.prepare('INSERT INTO images VALUES (?,?,?) ON CONFLICT(id) DO UPDATE SET path=excluded.path,json=excluded.json').run(entry.id, entry.path, JSON.stringify(entry));
  }
  removeImage(id: string): void { this.db.prepare('DELETE FROM images WHERE id=?').run(id); }
  cached(key: string): AnalysisResult | undefined { return this.get<AnalysisResult>('analyses', key); }
  cache(key: string, analysis: AnalysisResult): void { this.db.prepare('INSERT OR REPLACE INTO analyses VALUES (?,?)').run(key, JSON.stringify(analysis)); }
  savePlan(plan: OrganizePlan): void { this.db.prepare('INSERT INTO plans VALUES (?,?)').run(plan.id, JSON.stringify(plan)); }
  plan(id: string): OrganizePlan | undefined { return this.get<OrganizePlan>('plans', id); }
  consumePlan(id: string): void { this.db.prepare('DELETE FROM plans WHERE id=?').run(id); }
  addBatch(batch: Batch): void { this.db.prepare('INSERT INTO batches VALUES (?,?)').run(batch.id, JSON.stringify(batch)); }
  putMove(record: MoveRecord): void { this.db.prepare('INSERT OR REPLACE INTO moves VALUES (?,?,?)').run(record.id, record.batchId, JSON.stringify(record)); }
  move(id: string): MoveRecord | undefined { return this.get<MoveRecord>('moves', id); }
  history(): BatchView[] {
    return (this.db.prepare('SELECT json FROM batches ORDER BY rowid DESC').all() as {json: string}[]).map(row => {
      const batch = JSON.parse(row.json) as Batch;
      return { ...batch, records: (this.db.prepare('SELECT json FROM moves WHERE batch_id=? ORDER BY rowid').all(batch.id) as {json: string}[]).map(r => JSON.parse(r.json)) };
    });
  }
  batch(id: string): BatchView | undefined { return this.history().find(b => b.id === id); }
  recovery(): MoveRecord[] { return this.history().flatMap(b => b.records).filter(r => ['prepared','copied','verified'].includes(r.stage) || (r.stage === 'failed' && (r.targetOwned || r.restoreOwned || r.stagingPath))); }
  close(): void { this.db.close(); }
}
