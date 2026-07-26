import { readdir, stat } from 'node:fs/promises';
import { join, extname, basename, dirname } from 'node:path';
import sharp from 'sharp';

// 把 media 目录下的 png/jpg 压成 webp。GitHub Pages 不解析 Git LFS 指针，
// 所以图片必须以普通文件提交，体积得自己控住。
const ROOTS = ['prototypes/media', 'public/media'];
const QUALITY = 78;

async function walk(dir) {
  let out = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out = out.concat(await walk(p));
    else if (['.png', '.jpg', '.jpeg'].includes(extname(e.name).toLowerCase())) out.push(p);
  }
  return out;
}

const files = (await Promise.all(ROOTS.map(walk))).flat();
if (files.length === 0) {
  console.log('no source images found');
  process.exit(0);
}

for (const src of files) {
  const dest = join(dirname(src), `${basename(src, extname(src))}.webp`);
  await sharp(src).webp({ quality: QUALITY, effort: 6 }).toFile(dest);
  const [a, b] = await Promise.all([stat(src), stat(dest)]);
  const pct = Math.round((1 - b.size / a.size) * 100);
  console.log(
    `${src}  ${(a.size / 1024).toFixed(0)}KB -> ${(b.size / 1024).toFixed(0)}KB  (-${pct}%)`
  );
}
