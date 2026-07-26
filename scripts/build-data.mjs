import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

// data/works/*.json 与 data/people/*.json 是流水线产物；这里把它们同步进原型站点，
// 并生成轻量索引，首页与人物列表不必下载全部正文。
const root = resolve(import.meta.dirname, '..');
const src = join(root, 'data', 'works');
const peopleSrc = join(root, 'data', 'people');
const dest = join(root, 'prototypes', 'data');

await rm(dest, { recursive: true, force: true });
await mkdir(dest, { recursive: true });

// 模型给的朝代写法会漂（「唐」和「唐代」并存），卡片并排时很刺眼。
// data/ 里保持原样，同步到站点时统一成最简称呼。
const DYNASTY_FIX = { 唐代: '唐', 宋代: '宋', 汉代: '汉', 明代: '明', 清代: '清', 元代: '元', 秦代: '秦' };
const fixDynasty = (d) => DYNASTY_FIX[d] ?? d;

// 生卒不详的人物按朝代落位，否则「孙武」会被排到苏轼后面去。
const ERA_YEAR = {
  先秦: -700, 春秋: -600, 战国: -350, 秦: -220, 汉: 0, 东汉: 100, 魏晋: 280,
  南北朝: 450, 隋: 590, 初唐: 650, 唐: 750, 五代: 930, 北宋: 1050, 宋: 1100,
  南宋: 1180, 元: 1300, 明: 1450, 清: 1700,
};
const eraYear = (d) => ERA_YEAR[fixDynasty(d)] ?? 9999;

const files = (await readdir(src).catch(() => [])).filter((f) => f.endsWith('.json'));
if (files.length === 0) {
  console.error('data/works 下没有作品，先跑 npm run import');
  process.exit(1);
}

const index = [];
const works = [];
for (const file of files) {
  const raw = JSON.parse(await readFile(join(src, file), 'utf8'));
  const work = { ...raw, dynasty: fixDynasty(raw.dynasty) };
  works.push(work);
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

// ── 人物 ──
const peopleFiles = (await readdir(peopleSrc).catch(() => [])).filter((f) => f.endsWith('.json'));
if (peopleFiles.length === 0) {
  console.log('data/people 下暂无人物档案（npm run people 可生成）');
} else {
  await mkdir(join(dest, 'people'), { recursive: true });
  const peopleIndex = [];
  for (const file of peopleFiles) {
    const rawPerson = JSON.parse(await readFile(join(peopleSrc, file), 'utf8'));
    const person = { ...rawPerson, dynasty: fixDynasty(rawPerson.dynasty) };
    // 名下作品由 works 反查得出，而不是信 masterpieces 里的 workId ——
    // 站内收录了什么是事实，模型漏填不该让作品从人物页消失。
    const own = works
      .filter((w) => w.author.name === person.name)
      .map((w) => ({ id: w.id, title: w.title, type: w.type }));
    await writeFile(join(dest, 'people', file), JSON.stringify({ ...person, works: own }), 'utf8');
    peopleIndex.push({
      id: person.id,
      name: person.name,
      dynasty: person.dynasty,
      era: person.era,
      // 生卒不详就按朝代落位，人物列表本身就是一条时间线。
      order: person.born ?? eraYear(person.dynasty),
      hook: person.hook,
      traits: person.traits,
      hero: person.media.hero ?? null,
      works: own,
    });
    console.log(`  ${person.id}  ${person.timeline.length} 节点 / ${own.length} 篇`);
  }
  peopleIndex.sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  await writeFile(join(dest, 'people.json'), JSON.stringify(peopleIndex), 'utf8');
  console.log(`prototypes/data/people.json  ${peopleIndex.length} 位`);
}
