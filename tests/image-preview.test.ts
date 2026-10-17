import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { openImage, previewImage } from '../src/main/images.js';
import { fileHash } from '../src/main/files.js';

for (const format of ['webp', 'jpeg', 'png'] as const) test(`${format} 多次扫描和预览后不会锁定原文件，能立即重命名`, async () => {
  const root = path.join(process.cwd(), 'output/select-all-20261016/image-handles', randomUUID());
  await fs.mkdir(root, { recursive: true });
  const file = path.join(root, `原始图片.${format}`), target = path.join(root, `恢复图片.${format}`);
  await sharp(Buffer.from('<svg width="320" height="240"><rect width="320" height="240" fill="white"/><rect width="150" height="120" fill="blue"/></svg>')).toFormat(format).toFile(file);
  const before = await fileHash(file);
  for (let i = 0; i < 3; i++) { await (await openImage(file)).resize(32, 32).png().toBuffer(); await previewImage(file); }
  await fs.rename(file, target);
  assert.equal(await fileHash(target), before);
  await fs.rename(target, file); assert.equal(await fileHash(file), before);
});
