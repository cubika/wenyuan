const $ = (sel, root = document) => root.querySelector(sel);

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const STARS = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
const TYPE_LABEL = { poem: '诗', ci: '词', essay: '文章', classic: '典籍' };

/**
 * 把注释挂回原文：按 term 在句中做子串定位并包成可点击的 <span class="n">。
 * 长词先替换，避免「芳甸」被「甸」抢先切开。
 */
function renderLine(line, lineIndex) {
  let html = esc(line.text);
  const notes = [...line.notes].sort((a, b) => b.term.length - a.term.length);
  notes.forEach((note, i) => {
    const id = `n${lineIndex}-${i}`;
    const term = esc(note.term);
    if (!html.includes(term)) return;
    const pin = note.pinyin ? ` ${esc(note.pinyin)}` : '';
    html = html.replace(
      term,
      `<span class="n" id="${id}">${term}<span class="pop"><b>${term}${pin}</b>${esc(note.explain)}</span></span>`,
    );
  });
  return `<div class="row"><div class="orig">${html}</div><div class="tr">${esc(line.translation)}</div></div>`;
}

function bindReader() {
  document.querySelectorAll('.modes button').forEach((b) => {
    b.onclick = () => {
      document.querySelectorAll('.modes button').forEach((x) => x.classList.remove('on'));
      b.classList.add('on');
      document.body.dataset.mode = b.dataset.m;
    };
  });
  document.querySelectorAll('.n').forEach((n) => {
    n.onclick = (e) => {
      e.stopPropagation();
      const open = n.classList.contains('open');
      document.querySelectorAll('.n').forEach((x) => x.classList.remove('open'));
      if (!open) n.classList.add('open');
    };
  });
  document.onclick = () => document.querySelectorAll('.n').forEach((x) => x.classList.remove('open'));
  document.querySelectorAll('.note-i').forEach((i) => {
    i.onclick = () => {
      const t = document.getElementById(i.dataset.t);
      if (!t) return;
      t.scrollIntoView({ block: 'center', behavior: 'smooth' });
      t.classList.add('flash');
      setTimeout(() => t.classList.remove('flash'), 1100);
    };
  });
  document.querySelectorAll('.lv').forEach((l) => {
    l.onclick = () => {
      document.querySelectorAll('.lv').forEach((x) => x.classList.remove('on'));
      l.classList.add('on');
    };
  });
}

export async function renderWork(mount) {
  const id = new URLSearchParams(location.search).get('id') ?? 'chun-jiang-hua-yue-ye';
  const work = await fetch(`data/${id}.json`).then((r) => {
    if (!r.ok) throw new Error(`找不到作品 ${id}`);
    return r.json();
  });

  document.title = `${work.title} · ${work.author.name} — 文渊`;
  const hero = work.media.hero ?? 'media/chunjiang-hero.webp';
  const chapter = work.chapters[0];
  const multi = work.chapters.length > 1;

  const allNotes = [];
  work.chapters.forEach((ch, ci) =>
    ch.lines.forEach((line, li) =>
      line.notes.forEach((note, ni) => allNotes.push({ ...note, id: `n${ci === 0 ? li : `${ci}-${li}`}-${ni}` })),
    ),
  );

  mount.innerHTML = `
  <div class="crumb"><a href="home.html">首页</a><i>／</i><a href="home.html">${esc(TYPE_LABEL[work.type])}</a><i>／</i>${esc(work.dynasty)}<i>／</i>${esc(work.title)}</div>

  <section class="wband">
    <img src="${esc(hero)}" alt="${esc(work.title)} 意境图">
    <div class="wband-in">
      <h1>${esc(work.title)}</h1>
      <div class="by">${esc(work.author.name)} · ${esc(work.dynasty)}</div>
      <div class="tags">${work.themes.map((t) => `<span>${esc(t)}</span>`).join('')}<span>难度 ${STARS(work.overview.difficulty)}</span></div>
    </div>
  </section>

  <div class="r-grid">
    <aside class="side">
      <div class="idx">${esc(TYPE_LABEL[work.type])} · ${multi ? `全 ${work.chapters.length} 章` : '单篇'}</div>
      <div class="kv"><span>朝代</span><b>${esc(work.dynasty)}</b></div>
      <div class="kv"><span>心境</span><b>${work.moods.map(esc).join(' · ')}</b></div>
      <div class="kv"><span>难度</span><b>${STARS(work.overview.difficulty)}</b></div>
      <div class="kv"><span>字数</span><b>${work.chapters.reduce((n, c) => n + c.lines.reduce((m, l) => m + l.text.length, 0), 0)}</b></div>
      <div class="kv"><span>注释</span><b>${allNotes.length} 条</b></div>
      <div class="figbox">
        <img src="${esc(hero)}" alt="本篇配图">
        <figcaption>本篇配图 · 依原文意象生成</figcaption>
      </div>
    </aside>

    <div class="main">
      <div class="lead">${esc(work.hook)}</div>
      <div class="modes"><button class="on" data-m="orig">原 文</button><button data-m="compare">对 照</button></div>
      <div class="paper">
        ${chapter.lines.map((line, i) => renderLine(line, i)).join('')}
        <div class="seal">${esc(work.title.slice(0, 2))}</div>
      </div>

      <div class="deep"><div class="deep-in">
        <h3>细 读</h3>
        <p><b>大意</b>　${esc(chapter.summary)}</p>
        <p><b>时代背景</b>　${esc(work.overview.background)}</p>
        <p><b>核心</b>　${esc(work.overview.coreIdea)}</p>
        <p><b>结构</b>　${esc(work.overview.structure)}</p>
        <p><b>作者</b>　${esc(work.author.name)}${work.author.era ? `（${esc(work.author.era)}）` : ''}　${esc(work.author.bio)}</p>
      </div></div>
    </div>

    <aside class="aside">
      <div class="box">
        <div class="box-t">名 句</div>
        ${work.famousLines.map((f) => `<div class="note-i"><b>${esc(f.text)}</b><p>${esc(f.translation)}</p></div>`).join('')}
      </div>
      <div class="box">
        <div class="box-t">注 释 一 览　${allNotes.length}</div>
        ${allNotes
          .map(
            (n) =>
              `<div class="note-i" data-t="${n.id}"><b>${esc(n.term)}${n.pinyin ? `<s>${esc(n.pinyin)}</s>` : ''}</b><p>${esc(n.explain)}</p></div>`,
          )
          .join('')}
      </div>
      <div class="box">
        <div class="box-t">阅 读 深 度</div>
        <div class="lv"><i>L1</i><p>只看名句与画面</p></div>
        <div class="lv on"><i>L2</i><p>原文 + 白话对照</p></div>
        <div class="lv"><i>L3</i><p>注释 · 背景 · 赏析</p></div>
      </div>
    </aside>
  </div>
  <footer>文渊 · 阅读页　内容由导入流水线生成</footer>`;

  bindReader();
}

export async function renderHome(mount) {
  const index = await fetch('data/index.json').then((r) => r.json());
  const lead = index[0];
  if (!lead) return;
  const hero = lead.hero ?? 'media/chunjiang-hero.webp';

  const bandTxt = $('.band-txt', mount) ?? mount;
  $('.band img', mount).src = hero;
  bandTxt.querySelector('h1.verse').innerHTML = lead.lead.text
    .split(/(?<=[，。！？])/)
    .filter(Boolean)
    .map((s) => `<span>${esc(s)}</span>`)
    .join('');
  bandTxt.querySelector('.gloss').textContent = lead.lead.translation;
  bandTxt.querySelector('.src').textContent = `${lead.author}《${lead.title}》· ${lead.dynasty}`;
  bandTxt.querySelector('a.btn').href = `work.html?id=${encodeURIComponent(lead.id)}`;

  $('.pick-row', mount).innerHTML = index
    .map(
      (w) => `<a class="pick" href="work.html?id=${encodeURIComponent(w.id)}">
        ${w.hero ? `<i class="thumb" style="background-image:url(${esc(w.hero)})"></i>` : ''}
        <div class="cat">${esc(w.dynasty)} · ${esc(TYPE_LABEL[w.type])}</div>
        <h3>${esc(w.title)}</h3><div class="by">${esc(w.author)}</div>
        <q>${esc(w.lead.text)}</q></a>`,
    )
    .join('');
}
