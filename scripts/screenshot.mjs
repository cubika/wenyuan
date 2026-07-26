import pw from 'file:///C:/Users/bili1/source/knowledge-atlas/node_modules/playwright/index.js';
const { chromium } = pw;

const url = process.argv[2] ?? 'http://127.0.0.1:5180/a2-xuanzhi-compact.html';
const out = process.argv[3] ?? 'shot.png';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
await page.goto(url, { waitUntil: 'networkidle' });
await page.waitForTimeout(1400);
await page.screenshot({ path: out });
await page.screenshot({ path: out.replace('.png', '-full.png'), fullPage: true });
await browser.close();
console.log('shot ->', out);
