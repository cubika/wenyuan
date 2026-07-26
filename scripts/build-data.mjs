import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

// data/works/*.json 是流水线产物；这里把它们同步进原型站点，
// 并生成一份轻量索引，首页不必下载全部作品正文。
const root = resolve(import.meta.dirname, '..');
const src = join(root, 'data', 'works');
const dest = join(root, 'prototypes', 'data');

await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });

const files = (await readdir(src).catch(() => [])).filter((f) => f.endsWith('.json'));
if (files.length === 0) {
  console.error('data/works 下没有作品，先跑 npm run import');
  process.exit(1);
}

const index = [];
for (const file of files) {
  const work = JSON.parse(await readFile(join(src, file), 'utf8'));
  await writeFile(join(dest, file), JSON.stringify(work), 'utf8');
  index.push({
    id: work.id,
    title: work.title,
    type: work.type,
    dynasty: work.dynasty,
    author: work.author.name,
    hook: work.hook,
    moods: work.moods,
    themes: work.themes,
    difficulty: work.overview.difficulty,
    lead: work.famousLines[0],
    hero: work.media.hero ?? null,
  });
  console.log(`  ${work.id}  ${work.chapters.length} 章  ${(JSON.stringify(work).length / 1024).toFixed(0)}KB`);
}

index.sort((a, b) => a.id.localeCompare(b.id));
await writeFile(join(dest, 'index.json'), JSON.stringify(index), 'utf8');
console.log(`\nprototypes/data/index.json  ${index.length} 篇`);
