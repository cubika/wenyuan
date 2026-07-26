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
const indexCount = await page.evaluate(async () =>
  (await fetch('data/index.json').then((r) => r.json())).length);
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
  const eras = new Set(idx.map((w) => w.dynasty));
  return document.querySelectorAll('[data-river] .era').length === eras.size;
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

// ── 阅读页 ──
failures.length = 0;
await page.goto(`${BASE}/work.html`, { waitUntil: 'networkidle' });
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
check('deep: 逐段赏析保留分段', await page.evaluate(async () => {
  const idx = await fetch('data/index.json').then((r) => r.json());
  const w = await fetch(`data/${idx[0].id}.json`).then((r) => r.json());
  const src = w.chapters[0].commentary ?? '';
  const want = src.split(/\n+/).filter((s) => s.trim()).length;
  const blk = [...document.querySelectorAll('.blk')].find(
    (b) => b.querySelector('b')?.textContent === '逐段赏析');
  return want <= 1 || blk?.querySelectorAll('p').length === want;
}));
check('deep: 标签与正文分列（非双栏流式）', await page.evaluate(() => {
  const blk = document.querySelector('.blk');
  if (!blk) return false;
  const { width } = blk.getBoundingClientRect();
  const label = blk.querySelector('b')?.getBoundingClientRect();
  const body = blk.querySelector('div')?.getBoundingClientRect();
  // 标签在左、正文在右，且正文占大头
  return !!label && !!body && body.left > label.right - 1 && body.width > width * 0.6;
}));

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
