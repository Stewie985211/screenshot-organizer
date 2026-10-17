import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import sharp from 'sharp';

export const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.mkv', '.webm', '.avi', '.m4v']);
export const VIDEO_PROMPT_VERSION = 'local-video-samples-v2-max6';
export const isVideoFile = (file: string): boolean => VIDEO_EXTENSIONS.has(path.extname(file).toLowerCase());
export interface VideoInfo { width: number; height: number; durationSeconds: number; streamIndex: number }

// Reuse installed tools; no duplicate binaries, extracted frames or audio on disk.
export async function videoTool(root: string, name: 'ffmpeg' | 'ffprobe'): Promise<string> {
  const binary = process.platform === 'win32' ? `${name}.exe` : name;
  for (const directory of [path.join(root, 'tools/ffmpeg'), ...(process.env.PATH ?? process.env.Path ?? '').split(path.delimiter)]) {
    if (!directory) continue;
    const file = path.join(directory.replace(/^"|"$/g, ''), binary);
    if (await fs.stat(file).then(info => info.isFile(), () => false)) return file;
  }
  throw new Error(`未找到 ${name}。请安装 FFmpeg 并重开软件，或将 ffmpeg、ffprobe 放到项目 tools/ffmpeg 文件夹。`);
}

let active = 0;
const waiting: Array<() => void> = [];
async function runTool(root: string, name: 'ffmpeg' | 'ffprobe', args: string[], signal?: AbortSignal): Promise<Buffer> {
  signal?.throwIfAborted();
  if (active >= 2) {
    await new Promise<void>((resolve, reject) => {
      const grant = () => { signal?.removeEventListener('abort', abort); resolve(); };
      const abort = () => { const index = waiting.indexOf(grant); if (index >= 0) waiting.splice(index, 1); reject(signal!.reason); };
      waiting.push(grant); signal?.addEventListener('abort', abort, { once: true });
    });
  } else active++;
  try {
    signal?.throwIfAborted();
    const executable = await videoTool(root, name);
    signal?.throwIfAborted();
    return await new Promise<Buffer>((resolve, reject) => {
      const child = spawn(executable, args, { windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'],
        env: { ...process.env, TEMP: path.join(root, 'data/temp'), TMP: path.join(root, 'data/temp') } });
      const chunks: Buffer[] = []; let bytes = 0; let stderr = ''; let failure: Error | undefined;
      const abort = () => { failure = signal!.reason; child.kill(); };
      const timer = setTimeout(() => { failure = new Error('视频解码超时，请检查文件或重试'); child.kill(); }, 30000);
      signal?.addEventListener('abort', abort, { once: true });
      const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
      child.on('error', error => { cleanup(); reject(error); });
      child.stdout.on('data', (chunk: Buffer) => {
        bytes += chunk.length;
        if (bytes > 12 * 1024 * 1024) { failure = new Error('视频解码输出过大'); child.kill(); }
        else chunks.push(chunk);
      });
      child.stderr.on('data', (chunk: Buffer) => { stderr = (stderr + chunk.toString()).slice(-4000); });
      child.on('close', code => {
        cleanup();
        if (failure) reject(failure);
        else if (code !== 0) reject(new Error(`视频读取失败：${stderr.trim().slice(-500) || `解码器退出码 ${code}`}`));
        else resolve(Buffer.concat(chunks));
      });
      if (signal?.aborted) abort();
    });
  } finally {
    const next = waiting.shift(); if (next) next(); else active--;
  }
}

export async function probeVideo(root: string, file: string, signal?: AbortSignal): Promise<VideoInfo> {
  const raw = await runTool(root, 'ffprobe', ['-v', 'error', '-protocol_whitelist', 'file,pipe', '-show_entries',
    'format=duration:stream=index,codec_type,width,height,duration:stream_disposition=attached_pic:stream_tags=rotate:stream_side_data=rotation', '-of', 'json', '-i', file], signal);
  const data = JSON.parse(raw.toString('utf8')) as { format?: { duration?: string }; streams?: Array<{
    index: number; codec_type: string; width?: number; height?: number; duration?: string;
    disposition?: { attached_pic?: number }; tags?: { rotate?: string }; side_data_list?: Array<{ rotation?: number }>;
  }> };
  const stream = data.streams?.find(item => item.codec_type === 'video' && !item.disposition?.attached_pic);
  let width = stream?.width ?? 0, height = stream?.height ?? 0;
  const durationSeconds = [Number(data.format?.duration), Number(stream?.duration)].find(value => Number.isFinite(value) && value > 0) ?? NaN;
  if (!stream || !Number.isInteger(width) || !Number.isInteger(height) || width <= 0 || height <= 0 || width * height > 40_000_000 || !Number.isFinite(durationSeconds) || durationSeconds <= 0)
    throw new Error('视频没有有效画面、尺寸或时长');
  const rotation = stream.side_data_list?.find(item => item.rotation !== undefined)?.rotation ?? Number(stream.tags?.rotate ?? 0);
  if (Math.abs(rotation) % 180 === 90) [width, height] = [height, width];
  return { width, height, durationSeconds, streamIndex: stream.index };
}

export function videoSampleTimes(duration: number): number[] {
  if (!Number.isFinite(duration) || duration <= 0) throw new Error('视频时长无效');
  // Ollama assigns this model at least 1024 visual tokens per image. Six frames
  // leave room for the prompt and JSON in the existing 8192-token context.
  const count = Math.min(6, Math.max(3, Math.ceil(duration / 5)));
  // Midpoints avoid an exact end-of-file seek and cover the full duration.
  return Array.from({ length: count }, (_, i) => duration * (i + 0.5) / count);
}

export async function videoFrame(root: string, file: string, seconds: number, streamIndex: number, signal?: AbortSignal): Promise<Buffer> {
  const result = await runTool(root, 'ffmpeg', ['-hide_banner', '-loglevel', 'error', '-nostdin', '-protocol_whitelist', 'file,pipe',
    '-threads', '1', '-ss', seconds.toFixed(6), '-i', file, '-map', `0:${streamIndex}`, '-frames:v', '1', '-an', '-sn',
    '-vf', "scale=512:512:force_original_aspect_ratio=decrease", '-threads', '1', '-f', 'image2pipe', '-vcodec', 'mjpeg', '-q:v', '3', 'pipe:1'], signal);
  if (!result.length) throw new Error('未能解码视频抽样画面');
  return result;
}

export async function videoFrames(root: string, file: string, signal?: AbortSignal) {
  const info = await probeVideo(root, file, signal), times = videoSampleTimes(info.durationSeconds);
  const frames: Buffer[] = [];
  for (const time of times) { signal?.throwIfAborted(); frames.push(await videoFrame(root, file, time, info.streamIndex, signal)); }
  return { info, times, frames };
}

// Bounded memory-only preview cache, invalidated by pathname + file metadata.
const previews = new Map<string, Buffer>();
const pending = new Map<string, Promise<Buffer>>();
export async function previewVideo(root: string, file: string, full = false): Promise<Buffer> {
  const stat = await fs.stat(file), key = JSON.stringify([root, file, stat.size, stat.mtimeMs, stat.ctimeMs, full]);
  const cached = previews.get(key); if (cached) return cached;
  if (pending.has(key)) return pending.get(key)!;
  const task = (async () => {
    let result: Buffer;
    if (!full) {
      const info = await probeVideo(root, file);
      result = await sharp(await videoFrame(root, file, info.durationSeconds / 2, info.streamIndex)).resize({ width: 420, height: 300, fit: 'inside' }).png().toBuffer();
    } else {
      const { frames, times } = await videoFrames(root, file);
      const tiles: sharp.OverlayOptions[] = [];
      for (let i = 0; i < frames.length; i++) {
        const x = (i % 2) * 512, y = Math.floor(i / 2) * 330;
        tiles.push({ input: await sharp(frames[i]).resize(512, 296, { fit: 'contain', background: '#171923' }).png().toBuffer(), left: x, top: y });
        tiles.push({ input: Buffer.from(`<svg width="512" height="34"><rect width="512" height="34" fill="#171923"/><text x="12" y="23" font-family="Arial" font-size="16" fill="white">${i + 1} / ${times[i].toFixed(1)} s</text></svg>`), left: x, top: y + 296 });
      }
      result = await sharp({ create: { width: 1024, height: Math.ceil(frames.length / 2) * 330, channels: 3, background: '#171923' } }).composite(tiles).png().toBuffer();
    }
    previews.set(key, result); while (previews.size > 24) previews.delete(previews.keys().next().value!);
    return result;
  })();
  pending.set(key, task); try { return await task; } finally { pending.delete(key); }
}
