import pw from 'file:///C:/Users/bili1/source/knowledge-atlas/node_modules/playwright/index.js';
const { chromium } = pw;

const BASE = process.argv[2] ?? 'http://127.0.0.1:5180';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });

let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!ok) failed++;
};

const failures = [];
page.on('response', (r) => {
  if (r.status() >= 400) failures.push(`${r.status()} ${r.url()}`);
});

// ── 首页 ──
await page.goto(`${BASE}/home.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
const indexData = await page.evaluate(async () =>
  await fetch('data/index.json').then((r) => r.json()));
const indexCount = indexData.length;
// 断言按体裁分流：诗词看逐句成行，文章看按段连排，各挑一篇代表。
const verseId = (indexData.find((w) => w.type === 'poem' || w.type === 'ci') ?? indexData[0]).id;
const proseWork = indexData.find((w) => w.type === 'essay' || w.type === 'classic');
const classicWork = indexData.find((w) => w.type === 'classic');
check('home: 无 404 资源', failures.length === 0, failures.join(', '));
check('home: 横幅配图已加载', await page.evaluate(() => {
  const i = document.querySelector('.band img');
  return !!i && i.naturalWidth > 100;
}));
check('home: 卡片数与 index.json 一致',
  (await page.locator('.pick').count()) === indexCount, `${indexCount} 篇`);
check('home: 侧栏与精选并排（两栏未塌）', await page.evaluate(() => {
  const a = document.querySelector('.pick-row').getBoundingClientRect();
  const b = document.querySelector('.rail').getBoundingClientRect();
  return b.left > a.right - 5;
}));
check('home: 无横向溢出', await page.evaluate(() =>
  document.documentElement.scrollWidth <= window.innerWidth + 1));
check('home: 不含阅读页区块', (await page.locator('.r-grid').count()) === 0);
check('home: 名句由数据填充', await page.evaluate(() =>
  (document.querySelector('h1.verse')?.textContent ?? '').trim().length > 4));
check('home: 「读全篇」带作品 id',
  /^work\.html\?id=.+/.test((await page.locator('a.btn').first().getAttribute('href')) ?? ''));
check('home: 卡片链接到阅读页',
  /^work\.html\?id=.+/.test((await page.locator('.pick').first().getAttribute('href')) ?? ''));
check('home: 长河由数据算出（非写死）', await page.evaluate(async () => {
  const idx = await fetch('data/index.json').then((r) => r.json());
  // 长河按主朝代归并（唐代→唐、北宋→宋），断言要跟着同一套规则，
  // 否则一加「唐代」这类写法就会误报。
  const ORDER = ['先秦', '秦', '汉', '魏晋', '南北朝', '隋', '唐', '五代', '宋', '元', '明', '清'];
  const ALIAS = { 春秋: '先秦', 战国: '先秦' };
  const norm = (d) => {
    const alias = Object.keys(ALIAS).find((k) => d.includes(k));
    return alias ? ALIAS[alias] : (ORDER.find((era) => d.includes(era)) ?? d);
  };
  const eras = new Set(idx.map((w) => norm(w.dynasty)));
  const rows = [...document.querySelectorAll('[data-river] .era')];
  const total = rows.reduce((n, r) => n + Number(r.querySelector('s').textContent), 0);
  return rows.length === eras.size && total === idx.length;
}));
// 点朝代应筛掉其它朝代的卡片
const eras = page.locator('[data-river] .era');
if ((await eras.count()) > 1) {
  await eras.first().click();
  await page.waitForTimeout(300);
  const shown = await page.locator('.pick').count();
  check('home: 点朝代可筛选', shown > 0 && shown < indexCount, `${shown}/${indexCount}`);
  await eras.first().click();
  await page.waitForTimeout(300);
  check('home: 再点取消筛选', (await page.locator('.pick').count()) === indexCount);
} else {
  check('home: 点朝代可筛选', true, '(仅一个朝代，跳过)');
  check('home: 再点取消筛选', true, '(跳过)');
}

// ── 顶栏板块 ──
const essayCount = indexData.filter((w) => w.type === 'essay').length;
const navEssay = page.locator('nav li', { hasText: /^文章$/ }).first();
await navEssay.click();
await page.waitForTimeout(300);
check('nav: 点「文章」筛出文章', (await page.locator('.pick').count()) === essayCount,
  `${essayCount} 篇`);
check('nav: 「文章」进入选中态', (await navEssay.getAttribute('class'))?.includes('on') === true);
check('nav: 板块与长河互斥', (await page.locator('[data-river] .era.on').count()) === 0);
await navEssay.click();
await page.waitForTimeout(300);
check('nav: 再点取消筛选', (await page.locator('.pick').count()) === indexCount);
check('nav: 未开放栏目置灰不可点', await page.evaluate(() =>
  [...document.querySelectorAll('nav li.off')].length === 0));
check('nav: 「人物」「长河」「地图」可点进独立页', await page.evaluate(() =>
  ['人物', '长河', '地图'].every((t) => {
    const li = [...document.querySelectorAll('nav li')].find((l) => l.textContent.trim() === t);
    return !!li && !li.classList.contains('off');
  })));

// 阅读页的顶栏与面包屑靠 ?sec= 跳回来，落地要停在那个板块上
await page.goto(`${BASE}/home.html?sec=essay`, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
check('nav: ?sec=essay 深链直达文章板块',
  (await page.locator('.pick').count()) === essayCount &&
  (await page.locator('nav li.on').innerText()).trim() === '文章');

// ── 阅读页 ──
failures.length = 0;
await page.goto(`${BASE}/work.html?id=${verseId}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
check('work: 无 404 资源', failures.length === 0, failures.join(', '));
check('work: 页首配图已加载', await page.evaluate(() => {
  const i = document.querySelector('.wband img');
  return !!i && i.naturalWidth > 100;
}));
check('work: 三栏并排', await page.evaluate(() => {
  const g = getComputedStyle(document.querySelector('.r-grid')).gridTemplateColumns;
  return g.split(' ').length === 3;
}));
check('work: 内容来自生成的 JSON', await page.evaluate(() =>
  (document.querySelector('.wband-in h1')?.textContent ?? '').trim().length > 0 &&
  document.querySelectorAll('.paper .row').length >= 10));
check('work: 注释由 term 自动挂回原文', await page.evaluate(() =>
  document.querySelectorAll('.paper .n').length >= 5));
check('work: 不含首页精选/长河区块',
  (await page.locator('.pick').count()) === 0 && (await page.locator('.era').count()) === 0);
check('work: 无横向溢出', await page.evaluate(() =>
  document.documentElement.scrollWidth <= window.innerWidth + 1));
// 侧栏比正文长时要能滚到底，但不能在页面上多出第二条可见滚动条
check('work: 侧栏不出现第二条滚动条', await page.evaluate(() =>
  [...document.querySelectorAll('.side, .aside')].every((el) => el.offsetWidth - el.clientWidth === 0)));
check('work: 阅读深度在左栏', (await page.locator('.side .lv').count()) === 3 &&
  (await page.locator('.aside .lv').count()) === 0);

// 交互：点词出注
const firstNote = page.locator('.paper .n').first();
await firstNote.click();
await page.waitForTimeout(500);
check('work: 点词浮出注释', await page.evaluate(() => {
  const open = document.querySelector('.paper .n.open .pop');
  return !!open && parseFloat(getComputedStyle(open).opacity) > 0.9;
}));

// 交互：对照模式
await page.locator('.modes button[data-m="compare"]').click();
await page.waitForTimeout(500);
check('work: 对照模式显示译文', await page.evaluate(() =>
  document.querySelector('.row .tr').getBoundingClientRect().height > 10));

// 交互：右栏注释跳转并高亮
await page.locator('.modes button[data-m="orig"]').click();
const noteItem = page.locator('.note-i[data-t]').first();
const targetId = await noteItem.getAttribute('data-t');
await noteItem.click();
await page.waitForTimeout(400);
check('work: 注释一览可定位高亮', await page.evaluate((id) =>
  document.getElementById(id)?.classList.contains('flash') === true, targetId));

// 窄屏回退
await page.setViewportSize({ width: 768, height: 900 });
await page.waitForTimeout(400);
check('work: 窄屏无横向溢出', await page.evaluate(() =>
  document.documentElement.scrollWidth <= window.innerWidth + 1));
// 隐藏的注释浮层曾撑大滚动区，让窄屏能横向拖动
await page.setViewportSize({ width: 600, height: 900 });
await page.waitForTimeout(400);
check('work: 极窄屏无横向溢出（注释浮层不撑版）', await page.evaluate(() =>
  document.documentElement.scrollWidth <= window.innerWidth + 1));
await page.setViewportSize({ width: 1366, height: 768 });

// ── 三层阅读深度 ──
const visible = (sel) =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    return !!el && getComputedStyle(el).display !== 'none';
  }, sel);

check('depth: 默认停在 L2', (await page.evaluate(() => document.body.dataset.depth)) === 'L2');check('depth: L2 显示正文、折叠细读',
  (await visible('.paper')) && !(await visible('.deep')));

await page.locator('.lv[data-depth="L1"]').click();
await page.waitForTimeout(300);
check('depth: L1 收起正文，只留名句',
  !(await visible('.paper')) && (await visible('.l1')) &&
    (await page.locator('.l1 .fl').count()) > 0);

await page.locator('.l1-more').click();
await page.waitForTimeout(300);
check('depth: L1 的「继续读全篇」回到 L2',
  (await page.evaluate(() => document.body.dataset.depth)) === 'L2' && (await visible('.paper')));

await page.locator('.lv[data-depth="L3"]').click();
await page.waitForTimeout(400);
check('depth: L3 展开细读', await visible('.deep'));
check('depth: L3 自动切到对照模式',
  (await page.evaluate(() => document.body.dataset.mode)) === 'compare');
check('depth: L3 注释常亮（无需逐个点）', await page.evaluate(() => {
  const n = document.querySelector('.paper .n');
  return !!n && getComputedStyle(n).backgroundImage !== 'none';
}));

// 以下细读断言依赖 L3 展开：display:none 的元素 getComputedStyle
// 拿到的是未解析值（minmax(0, 1fr)），量不出真实布局。
check('deep: 细读已展开', await visible('.deep'));

// 细读内容量：扩展 schema 后应显著变厚
const deepLen = await page.evaluate(() =>
  (document.querySelector('.deep-in')?.textContent ?? '').replace(/\s/g, '').length);
check('deep: 细读正文 ≥ 600 字', deepLen >= 600, `${deepLen} 字`);
check('deep: 含名句精讲', (await page.locator('.blk.jiang').count()) > 0);
// 模型的长文本用 \n 分段，曾被整段塞进一个 <p> 导致换行全丢
check('deep: 逐段赏析保留分段', await page.evaluate(async (id) => {
  const w = await fetch(`data/${id}.json`).then((r) => r.json());
  const src = w.chapters[0].commentary ?? '';
  const want = src.split(/\n+/).filter((s) => s.trim()).length;
  const blk = [...document.querySelectorAll('.blk')].find(
    (b) => b.querySelector('b')?.textContent === '逐段赏析');
  return want <= 1 || blk?.querySelectorAll('p').length === want;
}, verseId));
check('deep: 标签与正文分列（非双栏流式）', await page.evaluate(() => {
  const blk = document.querySelector('.blk');
  if (!blk) return false;
  const { width } = blk.getBoundingClientRect();
  const label = blk.querySelector('b')?.getBoundingClientRect();
  const body = blk.querySelector('div')?.getBoundingClientRect();
  // 标签在左、正文在右，且正文占大头
  return !!label && !!body && body.left > label.right - 1 && body.width > width * 0.6;
}));

// ── 阅读页 · 文章（按段连排） ──
if (proseWork) {
  failures.length = 0;
  await page.goto(`${BASE}/work.html?id=${proseWork.id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const paraCount = await page.evaluate(async (id) => {
    const w = await fetch(`data/${id}.json`).then((r) => r.json());
    return new Set(w.chapters[0].lines.map((l) => l.para ?? 0)).size;
  }, proseWork.id);

  check(`essay: ${proseWork.title} 无 404 资源`, failures.length === 0, failures.join(', '));
  check('essay: 走散文排版（非逐句成行）',
    (await page.locator('.paper.prose').count()) === 1 &&
    (await page.locator('.paper .row.para').count()) === paraCount, `${paraCount} 段`);
  check('essay: 句子在段内连排（同段多句同一行）', await page.evaluate(() => {
    const s = [...document.querySelectorAll('.paper .row.para')[0].querySelectorAll('.s')];
    if (s.length < 2) return false;
    const tops = s.map((x) => Math.round(x.getBoundingClientRect().top));
    return new Set(tops).size < tops.length;
  }));
  check('essay: 正文首行缩进', await page.evaluate(() =>
    parseFloat(getComputedStyle(document.querySelector('.prose .orig')).textIndent) > 20));
  check('essay: 注释挂回原文', (await page.locator('.paper .n').count()) >= 5);
  check('essay: 顶栏高亮到「文章」板块', await page.evaluate(() =>
    [...document.querySelectorAll('nav li.on')].map((l) => l.textContent.trim()).join() === '文章'));
  check('essay: 顶栏「文章」跳回首页板块', await (async () => {
    await page.locator('nav li.on').click();
    await page.waitForLoadState('networkidle');
    const ok = /home\.html\?sec=essay$/.test(page.url());
    await page.goBack({ waitUntil: 'networkidle' });
    await page.waitForTimeout(700);
    return ok;
  })());

  const firstProseNote = page.locator('.paper .n').first();
  await firstProseNote.click();
  await page.waitForTimeout(400);
  check('essay: 点词浮出注释', await page.evaluate(() => {
    const open = document.querySelector('.paper .n.open .pop');
    return !!open && parseFloat(getComputedStyle(open).opacity) > 0.9;
  }));

  await page.locator('.modes button[data-m="compare"]').click();
  await page.waitForTimeout(500);
  // 段译由句译拼成，整段读着才连贯；这里守住「段级对照」不退化成逐句
  check('essay: 对照模式给出段级译文', await page.evaluate(() => {
    const tr = document.querySelector('.row.para .tr');
    return !!tr && tr.getBoundingClientRect().height > 10 && tr.textContent.trim().length > 30;
  }));
  check('essay: 无横向溢出', await page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth + 1));
  check('essay: 侧栏无第二条滚动条，注释仍可滚到底', await page.evaluate(async () => {
    const rails = [...document.querySelectorAll('.side, .aside')];
    if (!rails.every((el) => el.offsetWidth - el.clientWidth === 0)) return false;
    const a = document.querySelector('.aside');
    if (a.scrollHeight <= a.clientHeight) return true;
    // 藏了滚动条也必须滚得到底：滚到底后渐隐提示要撤掉
    if (!a.classList.contains('scrolls')) return false;
    a.scrollTop = a.scrollHeight;
    await new Promise((r) => setTimeout(r, 120));
    return !a.classList.contains('scrolls');
  }));
} else {
  check('essay: 走散文排版（非逐句成行）', true, '(索引里没有文章，跳过)');
}

// ── 阅读页 · 典籍（多章） ──
if (classicWork) {
  failures.length = 0;
  await page.goto(`${BASE}/work.html?id=${classicWork.id}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const meta = await page.evaluate(async (id) => {
    const w = await fetch(`data/${id}.json`).then((r) => r.json());
    const perCh = w.chapters.map((c) => c.lines.reduce((m, l) => m + l.notes.length, 0));
    return {
      chapters: w.chapters.length,
      notes: perCh.reduce((a, b) => a + b, 0),
      firstChNotes: perCh[0],
      lastChNotes: perCh.at(-1),
      lastTitle: w.chapters.at(-1).title ?? '',
    };
  }, classicWork.id);

  check(`classic: ${classicWork.title} 无 404 资源`, failures.length === 0, failures.join(', '));
  // 阅读页曾只渲染 chapters[0]，多章典籍等于只能读第一篇
  check('classic: 全部章节都渲染', (await page.locator('.ch').count()) === meta.chapters &&
    (await page.locator('.ch-h').count()) === meta.chapters, `${meta.chapters} 章`);
  check('classic: 目录条目与章数一致', (await page.locator('.toc').count()) === meta.chapters);
  // 全书注释全在 DOM 里，但侧栏一次只给当前章 —— 552 条平铺没人翻得动
  check('classic: 注释按章给，不平铺全书',
    (await page.locator('.note-i[data-t]').count()) === meta.notes &&
    (await page.locator('.note-i[data-t]:visible').count()) === meta.firstChNotes,
    `全书 ${meta.notes} / 本章 ${meta.firstChNotes}`);
  check('classic: 章题取自原文篇名（未混入 markdown 记号）', await page.evaluate(() =>
    [...document.querySelectorAll('.ch-h h2')].every((h) => !h.textContent.trim().startsWith('#'))));

  await page.locator('.toc').last().click();
  await page.waitForTimeout(1000);
  check('classic: 点目录跳到该章', await page.evaluate((n) => {
    const last = document.querySelector(`#ch${n} .ch-h`);
    if (!last) return false;
    const top = last.getBoundingClientRect().top;
    return top > 0 && top < 200;
  }, meta.chapters));
  check('classic: 目录高亮跟着正文走', await page.evaluate((title) => {
    const on = document.querySelector('.toc.on');
    return !!on && on.textContent.trim() === title;
  }, meta.lastTitle));
  check('classic: 侧栏注释跟着换到该章',
    (await page.locator('.note-i[data-t]:visible').count()) === meta.lastChNotes,
    `${meta.lastChNotes} 条`);

  // 末章的注释也要能从右栏定位回正文
  const lastNote = page.locator('.note-i[data-t]:visible').last();
  const lastId = await lastNote.getAttribute('data-t');
  await lastNote.click();
  await page.waitForTimeout(500);
  check('classic: 末章注释可定位高亮', await page.evaluate((id) =>
    document.getElementById(id)?.classList.contains('flash') === true, lastId));

  await page.locator('.lv[data-depth="L3"]').click();
  await page.waitForTimeout(500);
  check('classic: L3 展开逐章细读', await page.evaluate(() => {
    const blocks = [...document.querySelectorAll('.ch-deep')];
    return blocks.length > 0 && blocks.every((b) => getComputedStyle(b).display !== 'none') &&
      blocks.every((b) => b.textContent.replace(/\s/g, '').length > 40);
  }));
  check('classic: L2 收起章内细读', await (async () => {
    await page.locator('.lv[data-depth="L2"]').click();
    await page.waitForTimeout(400);
    return page.evaluate(() =>
      [...document.querySelectorAll('.ch-deep')].every((b) => getComputedStyle(b).display === 'none'));
  })());
  check('classic: 无横向溢出', await page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth + 1));
} else {
  check('classic: 全部章节都渲染', true, '(索引里没有典籍，跳过)');
}

// ── 人物 ──
failures.length = 0;
await page.goto(`${BASE}/people.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
const people = await page.evaluate(async () => await fetch('data/people.json').then((r) => r.json()));
check('people: 无 404 资源', failures.length === 0, failures.join(', '));
check('people: 卡片数与 people.json 一致',
  (await page.locator('.pcard').count()) === people.length, `${people.length} 位`);
check('people: 顶栏「人物」高亮', await page.evaluate(() =>
  [...document.querySelectorAll('nav li.on')].map((l) => l.textContent.trim()).join() === '人物'));
// 生卒不详的人物要按朝代落位，否则孙武会被排到苏轼后面去
check('people: 按时间先后排列', await page.evaluate(() => {
  const names = [...document.querySelectorAll('.pcard h3')].map((h) => h.textContent.trim());
  return names.length < 2 || names[0] === '孙武';
}));
check('people: 卡片链接到人物页',
  /^person\.html\?id=.+/.test((await page.locator('.pcard').first().getAttribute('href')) ?? ''));
check('people: 卡片给出站内作品', await page.evaluate(() =>
  [...document.querySelectorAll('.pworks')].every((e) => e.textContent.trim().length > 0)));
check('people: 无横向溢出', await page.evaluate(() =>
  document.documentElement.scrollWidth <= window.innerWidth + 1));

const personId = people.find((p) => p.works.length > 0)?.id ?? people[0]?.id;
if (personId) {
  failures.length = 0;
  await page.goto(`${BASE}/person.html?id=${personId}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const pdata = await page.evaluate(async (id) =>
    await fetch(`data/people/${id}.json`).then((r) => r.json()), personId);

  check(`person: ${pdata.name} 无 404 资源`, failures.length === 0, failures.join(', '));
  check('person: 生平年表条数与档案一致',
    (await page.locator('.life li').count()) === pdata.timeline.length,
    `${pdata.timeline.length} 节点`);
  check('person: 年表按时间升序呈现', await page.evaluate(() =>
    [...document.querySelectorAll('.life li i')].map((e) => e.textContent).length > 0));
  check('person: 交游条数与档案一致',
    (await page.locator('.cc').count()) === pdata.circle.length, `${pdata.circle.length} 位`);
  check('person: 站内作品可点进阅读页', await page.evaluate(() => {
    const a = document.querySelector('.aside a.note-i');
    return !!a && /^work\.html\?id=.+/.test(a.getAttribute('href') ?? '');
  }));
  check('person: 配图已加载', await page.evaluate(() => {
    const i = document.querySelector('.wband img');
    return !!i && i.naturalWidth > 100;
  }));
  check('person: 侧栏不出现第二条滚动条', await page.evaluate(() =>
    [...document.querySelectorAll('.side, .aside')].every((el) => el.offsetWidth - el.clientWidth === 0)));
  check('person: 无横向溢出', await page.evaluate(() =>
    document.documentElement.scrollWidth <= window.innerWidth + 1));

  // 作品页的作者名要能接回人物页
  const w = pdata.works[0];
  if (w) {
    await page.goto(`${BASE}/work.html?id=${w.id}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    check('work: 作者名链到人物页', await page.evaluate((id) => {
      const a = document.querySelector('.wband-in a.who');
      return !!a && a.getAttribute('href') === `person.html?id=${id}`;
    }, personId));
  }
} else {
  check('person: 生平年表条数与档案一致', true, '(暂无人物，跳过)');
}

// ── 长河 ──
failures.length = 0;
await page.goto(`${BASE}/river.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
const riverEras = await page.evaluate(async () => await fetch('data/eras.json').then((r) => r.json()));
check('river: 无 404 资源', failures.length === 0, failures.join(', '));
check('river: 顶栏「长河」高亮', await page.evaluate(() =>
  [...document.querySelectorAll('nav li.on')].map((l) => l.textContent.trim()).join() === '长河'));
check('river: 轴段数与 eras.json 一致',
  (await page.locator('.axis .ax').count()) === riverEras.length, `${riverEras.length} 段`);
// 空朝代不藏起来，它同时是「这个站还缺什么」的进度条
check('river: 有收录的段亮起，空段留灰', await page.evaluate((eras) => {
  const filled = eras.filter((e) => e.works.length + e.people.length > 0).length;
  return document.querySelectorAll('.axis .ax.has').length === filled &&
    document.querySelectorAll('.era-sec.bare').length === eras.length - filled;
}, riverEras));
// 导语一旦点名作品，加一篇就过期一次 —— schema 拦了，渲染这层再守一道
check('river: 导语不点名具体作品', await page.evaluate(() =>
  [...document.querySelectorAll('.era-shift')].every((p) => !/[《》]/.test(p.textContent))));
check('river: 导语不点名站内作者', await page.evaluate(async () => {
  const idx = await fetch('data/index.json').then((r) => r.json());
  const authors = [...new Set(idx.map((w) => w.author))].filter((a) => a !== '佚名');
  const text = [...document.querySelectorAll('.era-shift')].map((p) => p.textContent).join('');
  return authors.every((a) => !text.includes(a));
}));
// 「站内有什么」由数据反查，不写进导语 —— 反查对不上就等于这条原则没落地
check('river: 站内作品全部落到某一段', await page.evaluate(async (eras) => {
  const idx = await fetch('data/index.json').then((r) => r.json());
  const inRiver = eras.reduce((n, e) => n + e.works.length, 0);
  return inRiver === idx.length && document.querySelectorAll('.ew').length === idx.length;
}, riverEras));
check('river: 站内人物全部落到某一段', await page.evaluate(async (eras) => {
  const ppl = await fetch('data/people.json').then((r) => r.json());
  return eras.reduce((n, e) => n + e.people.length, 0) === ppl.length &&
    document.querySelectorAll('.ep').length === ppl.length;
}, riverEras));
check('river: 作品卡链到阅读页、人物卡链到人物页', await page.evaluate(() => {
  const w = document.querySelector('.ew');
  const p = document.querySelector('.ep');
  return /^work\.html\?id=.+/.test(w?.getAttribute('href') ?? '') &&
    /^person\.html\?id=.+/.test(p?.getAttribute('href') ?? '');
}));
const axHas = page.locator('.axis .ax.has').last();
const axHref = await axHas.getAttribute('href');
await axHas.click();
await page.waitForTimeout(900);
check('river: 点朝代轴跳到该段', await page.evaluate((href) => {
  const sec = document.querySelector(`${href} .era-h`);
  if (!sec) return false;
  const top = sec.getBoundingClientRect().top;
  return top > 0 && top < 200;
}, axHref));
check('river: 无横向溢出', await page.evaluate(() =>
  document.documentElement.scrollWidth <= window.innerWidth + 1));

// ── 地图 ──
failures.length = 0;
await page.goto(`${BASE}/map.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
const mapData = await page.evaluate(async () => await fetch('data/map.json').then((r) => r.json()));
check('map: 无 404 资源', failures.length === 0, failures.join(', '));
check('map: 顶栏「地图」高亮', await page.evaluate(() =>
  [...document.querySelectorAll('nav li.on')].map((l) => l.textContent.trim()).join() === '地图'));
check('map: 地点数与 map.json 一致',
  (await page.locator('.dot').count()) === mapData.places.length, `${mapData.places.length} 处`);
check('map: 行迹条数与人物一致',
  (await page.locator('.rt[data-route]').count()) === mapData.routes.length + 1,
  `${mapData.routes.length} 条`);
// 坐标只来自手写地名表，落点必须都在画布内
check('map: 所有地点落在画布内', await page.evaluate(() => {
  const svg = document.querySelector('svg.map');
  const [, , w, h] = svg.getAttribute('viewBox').split(' ').map(Number);
  return [...document.querySelectorAll('.dot')].every((d) => {
    const m = /translate\(([-\d.]+),([-\d.]+)\)/.exec(d.getAttribute('transform') ?? '');
    return m && +m[1] >= 0 && +m[1] <= w && +m[2] >= 0 && +m[2] <= h;
  });
}));
// 五条线叠在一起就是一团乱麻，全部模式下不该画路线
check('map: 全部模式不画路线', await page.evaluate(() =>
  [...document.querySelectorAll('.route')].every((r) => parseFloat(getComputedStyle(r).opacity) < 0.02)));
// 同一个人在一地反复出入是常事，名单要去重
check('map: 地点访客名单去重', await page.evaluate(() =>
  [...document.querySelectorAll('[data-panel] .note-i p')].every((p) => {
    const names = p.textContent.split('、').map((s) => s.split(' ×')[0]);
    return new Set(names).size === names.length;
  })));

const longest = mapData.routes.reduce((a, b) => (a.stops.length >= b.stops.length ? a : b));
await page.locator(`.rt[data-route="${longest.id}"]`).click();
await page.waitForTimeout(600);
check('map: 选中行迹后画出连线', await page.evaluate((id) => {
  const r = document.querySelector(`.route[data-route="${id}"]`);
  return !!r && parseFloat(getComputedStyle(r).opacity) > 0.5;
}, longest.id));
check('map: 选中行迹后其余地点压暗', await page.evaluate((n) =>
  document.querySelectorAll('.dot.on').length > 0 &&
  document.querySelectorAll('.dot.on').length <= n &&
  document.querySelectorAll('.dot.off').length > 0, longest.stops.length));
check('map: 右栏换成该人的站点并按年份排', await page.evaluate(() => {
  const stops = [...document.querySelectorAll('[data-panel] .note-i.stop')];
  return stops.length > 1;
}));
check('map: 站点面板给出人物档案入口',
  /^person\.html\?id=.+/.test((await page.locator('[data-panel] .who-link').getAttribute('href')) ?? ''));
check('map: 无横向溢出', await page.evaluate(() =>
  document.documentElement.scrollWidth <= window.innerWidth + 1));

// 旧的写死默认 id 曾导致 /work.html 不带参数时 404，这里守住。放在最后，
// 因为它会重新加载页面、把阅读深度重置。
failures.length = 0;
await page.goto(`${BASE}/work.html`, { waitUntil: 'networkidle' });
await page.waitForTimeout(900);
check('work: 不带 id 时回落到索引首篇', failures.length === 0 &&
  (await page.locator('.paper .row').count()) > 0, failures.join(', '));

await browser.close();
console.log(failed === 0 ? '\nAll checks passed.' : `\n${failed} check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
