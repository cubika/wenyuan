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
await page.waitForTimeout(900);
check('home: 无 404 资源', failures.length === 0, failures.join(', '));
check('home: 横幅配图已加载', await page.evaluate(() => {
  const i = document.querySelector('.band img');
  return !!i && i.naturalWidth > 100;
}));
check('home: 精选卡片 6 张', (await page.locator('.pick').count()) === 6);
check('home: 侧栏与精选并排（两栏未塌）', await page.evaluate(() => {
  const a = document.querySelector('.pick-row').getBoundingClientRect();
  const b = document.querySelector('.rail').getBoundingClientRect();
  return b.left > a.right - 5;
}));
check('home: 无横向溢出', await page.evaluate(() =>
  document.documentElement.scrollWidth <= window.innerWidth + 1));
check('home: 不含阅读页区块', (await page.locator('.r-grid').count()) === 0);
check('home: 「读全篇」跳转阅读页',
  (await page.locator('a.btn').first().getAttribute('href')) === 'work.html');

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
check('work: 不含首页精选/长河区块',
  (await page.locator('.pick').count()) === 0 && (await page.locator('.era').count()) === 0);
check('work: 无横向溢出', await page.evaluate(() =>
  document.documentElement.scrollWidth <= window.innerWidth + 1));

// 交互：点词出注
await page.locator('#n1').click();
await page.waitForTimeout(500);
check('work: 点词浮出注释', await page.evaluate(() =>
  parseFloat(getComputedStyle(document.querySelector('#n1 .pop')).opacity) > 0.9));

// 交互：对照模式
await page.locator('.modes button[data-m="compare"]').click();
await page.waitForTimeout(500);
check('work: 对照模式显示译文', await page.evaluate(() =>
  document.querySelector('.row .tr').getBoundingClientRect().height > 10));

// 交互：右栏注释跳转并高亮
await page.locator('.modes button[data-m="orig"]').click();
await page.locator('.note-i[data-t="n3"]').click();
await page.waitForTimeout(400);
check('work: 注释一览可定位高亮', await page.evaluate(() =>
  document.querySelector('#n3').classList.contains('flash')));

// 窄屏回退
await page.setViewportSize({ width: 768, height: 900 });
await page.waitForTimeout(400);
check('work: 窄屏无横向溢出', await page.evaluate(() =>
  document.documentElement.scrollWidth <= window.innerWidth + 1));

await browser.close();
console.log(failed === 0 ? '\nAll checks passed.' : `\n${failed} check(s) failed.`);
process.exit(failed === 0 ? 0 : 1);
