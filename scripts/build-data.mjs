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

// 朝代 → 长河分段。顺序即优先级：先秦要排在秦前面（否则「先秦」被「秦」吃掉），
// 五代、南唐要排在唐前面，南北朝要排在北朝/南朝的单字规则前面。
const ERA_OF = [
  ['先秦', 'xianqin'], ['春秋', 'xianqin'], ['战国', 'xianqin'], ['西周', 'xianqin'],
  ['东周', 'xianqin'], ['商', 'xianqin'], ['周', 'xianqin'],
  ['南北朝', 'nanbeichao'], ['南朝', 'nanbeichao'], ['北朝', 'nanbeichao'],
  ['五代', 'wudai'], ['十国', 'wudai'], ['南唐', 'wudai'],
  ['宋', 'song'], ['魏晋', 'weijin'], ['三国', 'weijin'], ['晋', 'weijin'], ['魏', 'weijin'],
  ['唐', 'tang'], ['汉', 'han'], ['秦', 'qin'], ['隋', 'sui'],
  ['元', 'yuan'], ['明', 'ming'], ['清', 'qing'],
];
const eraIdOf = (d) => ERA_OF.find(([k]) => fixDynasty(d).includes(k))?.[1] ?? null;

const files = (await readdir(src).catch(() => [])).filter((f) => f.endsWith('.json'));
if (files.length === 0) {
  console.error('data/works 下没有作品，先跑 npm run import');
  process.exit(1);
}

const index = [];
const works = [];
const eras = JSON.parse(await readFile(join(root, 'data', 'eras.json'), 'utf8').catch(() => '[]'));
const eraById = new Map(eras.map((e) => [e.id, e]));
// 朝代分段是长河与首页共用的口径，算一次写进索引，
// 免得前端和断言各写一份归并规则、各漂各的。
const eraFields = (dynasty) => {
  const era = eraById.get(eraIdOf(dynasty));
  return era
    ? { eraId: era.id, eraName: era.name, eraStart: era.start }
    : { eraId: null, eraName: fixDynasty(dynasty), eraStart: 9999 };
};

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
    ...eraFields(work.dynasty),
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
const peopleIndex = [];
const peopleFiles = (await readdir(peopleSrc).catch(() => [])).filter((f) => f.endsWith('.json'));
if (peopleFiles.length === 0) {
  console.log('data/people 下暂无人物档案（npm run people 可生成）');
} else {
  await mkdir(join(dest, 'people'), { recursive: true });
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
      ...eraFields(person.dynasty),
      // 生卒不详就按朝代落位，人物列表本身就是一条时间线。
      order: person.born ?? eraFields(person.dynasty).eraStart,
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

// ── 长河 ──
// 导语只讲「这个时期文学在变什么」，站内有什么在这里反查后挂上去。
// 加新作品自动出现在对应朝代下，导语一个字都不用改。
if (eras.length === 0) {
  console.log('data/eras.json 不存在（npm run eras 可生成）');
} else {
  const river = eras.map((era) => ({
    ...era,
    works: index
      .filter((w) => w.eraId === era.id)
      .map((w) => ({ id: w.id, title: w.title, type: w.type, author: w.author, dynasty: w.dynasty })),
    people: peopleIndex
      .filter((p) => p.eraId === era.id)
      .map((p) => ({ id: p.id, name: p.name, era: p.era, hook: p.hook })),
  }));
  await writeFile(join(dest, 'eras.json'), JSON.stringify(river), 'utf8');
  const filled = river.filter((e) => e.works.length + e.people.length > 0).length;
  console.log(`prototypes/data/eras.json  ${river.length} 段，其中 ${filled} 段有收录`);
}

// ── 地图 ──
// 坐标只来自手写的地名表，模型碰不到；这里把年表节点按 place 串成行迹。
const places = JSON.parse(await readFile(join(root, 'data', 'places.json'), 'utf8').catch(() => '[]'));
const placeById = new Map(places.map((p) => [p.id, p]));
if (peopleFiles.length === 0 || places.length === 0) {
  console.log('地图数据跳过（缺人物档案或地名表）');
} else {
  const routes = [];
  const used = new Map();
  for (const file of peopleFiles) {
    const person = JSON.parse(await readFile(join(peopleSrc, file), 'utf8'));
    const stops = person.timeline
      .filter((t) => t.place && placeById.has(t.place))
      .map((t) => ({ place: t.place, year: t.year, label: t.label, title: t.title, detail: t.detail }));
    if (stops.length === 0) continue;
    routes.push({
      id: person.id,
      name: person.name,
      dynasty: fixDynasty(person.dynasty),
      era: person.era,
      stops,
    });
    for (const stop of stops) {
      const hit = used.get(stop.place) ?? { ...placeById.get(stop.place), events: [] };
      hit.events.push({ person: person.id, name: person.name, year: stop.year, title: stop.title });
      used.set(stop.place, hit);
    }
  }
  routes.sort((a, b) => (a.stops[0]?.year ?? 0) - (b.stops[0]?.year ?? 0));
  const mapped = [...used.values()].sort((a, b) => b.events.length - a.events.length);
  await writeFile(join(dest, 'map.json'), JSON.stringify({ places: mapped, routes }), 'utf8');
  console.log(
    `prototypes/data/map.json  ${routes.length} 条行迹 / ${mapped.length} 个地点`,
  );
}
