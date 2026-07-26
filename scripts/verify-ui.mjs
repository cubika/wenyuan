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
  const norm = (d) => ORDER.find((era) => d.includes(era)) ?? d;
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
  ['人物', '长河', '地图'].every((t) =>
    [...document.querySelectorAll('nav li')].find((l) => l.textContent.trim() === t)
      ?.classList.contains('off'))));

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
