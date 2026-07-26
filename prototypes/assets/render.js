const $ = (sel, root = document) => root.querySelector(sel);

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const STARS = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
const TYPE_LABEL = { poem: '诗', ci: '词', essay: '文章', classic: '典籍' };
/** 顶栏板块 → 体裁。诗、词同属「诗词」板块；人物/长河/地图 还没有数据，顶栏里置灰。 */
const SECTIONS = {
  poem: { label: '诗词', types: ['poem', 'ci'] },
  essay: { label: '文章', types: ['essay'] },
  classic: { label: '典籍', types: ['classic'] },
};

/** 顶栏各项与板块 key 的对应，HTML 里只写中文，映射放在这里。 */
function navItems() {
  return [...document.querySelectorAll('nav li')].map((li) => ({
    li,
    key: Object.keys(SECTIONS).find((k) => SECTIONS[k].label === li.textContent.trim()) ?? null,
  }));
}

/** 模型的长文本用 \n 分段。HTML 会折叠换行，必须显式拆成 <p>。 */
const paras = (s) =>
  String(s ?? '')
    .split(/\n+/)
    .map((t) => t.trim())
    .filter(Boolean);

/** 细读里的一个小节：标签在左，正文在右，段落逐条成 <p>。 */
const block = (label, text) =>
  !text
    ? ''
    : `<section class="blk"><b>${esc(label)}</b><div>${paras(text)
        .map((p) => `<p>${esc(p)}</p>`)
        .join('')}</div></section>`;

/**
 * 把注释挂回原文：按 term 在句中做子串定位并包成可点击的 <span class="n">。
 * 长词先替换，避免「芳甸」被「甸」抢先切开。
 * id 带章号 —— 典籍多章，只用句号会撞车。
 */
function markNotes(line, ci, li) {
  let html = esc(line.text);
  const notes = [...line.notes].sort((a, b) => b.term.length - a.term.length);
  notes.forEach((note, i) => {
    const id = `n${ci}-${li}-${i}`;
    const term = esc(note.term);
    if (!html.includes(term)) return;
    const pin = note.pinyin ? ` ${esc(note.pinyin)}` : '';
    html = html.replace(
      term,
      `<span class="n" id="${id}">${term}<span class="pop"><b>${term}${pin}</b>${esc(note.explain)}</span></span>`,
    );
  });
  return html;
}

/** 诗词：一行一句，换行本身就是作者的断句，逐句成行。 */
function renderVerse(lines, ci) {
  return lines
    .map(
      (line, i) =>
        `<div class="row"><div class="orig">${markNotes(line, ci, i)}</div><div class="tr">${esc(line.translation)}</div></div>`,
    )
    .join('');
}

/**
 * 文章 / 典籍：句子在段内连排，段落才是作者的章法 —— 逐句断行会把
 * 一篇散文排成分行诗。对照也走段级：整段译文读着才连贯，
 * 逐句对照反而把文气切碎。
 */
function renderProse(lines, ci) {
  const groups = [];
  lines.forEach((line, i) => {
    const para = line.para ?? 0;
    const last = groups.at(-1);
    if (last && last.para === para) last.items.push({ line, i });
    else groups.push({ para, items: [{ line, i }] });
  });
  return groups
    .map(
      (g) => `<div class="row para">
        <p class="orig">${g.items.map(({ line, i }) => `<span class="s">${markNotes(line, ci, i)}</span>`).join('')}</p>
        <p class="tr">${g.items.map(({ line }) => esc(line.translation)).join('')}</p>
      </div>`,
    )
    .join('');
}

const VERSE_TYPES = new Set(['poem', 'ci']);

/**
 * 阅读页顶栏：高亮当前作品所属板块，点击回首页对应板块。
 * 读一篇文章时不该还亮着「诗词」，更不该点了没反应。
 */
function bindWorkNav(type) {
  navItems().forEach(({ li, key }) => {
    if (!key) {
      li.classList.add('off');
      return;
    }
    li.classList.toggle('on', SECTIONS[key].types.includes(type));
    li.onclick = () => {
      location.href = `home.html?sec=${key}`;
    };
  });
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
      // 注释在 L1 下是藏起来的，跳过去之前先切到能看见它的层。
      if (document.body.dataset.depth === 'L1') setDepth('L2');
      t.scrollIntoView({ block: 'center', behavior: 'smooth' });
      t.classList.add('flash');
      setTimeout(() => t.classList.remove('flash'), 1100);
    };
  });
  document.querySelectorAll('.lv').forEach((l) => {
    l.onclick = () => setDepth(l.dataset.depth);
  });
  bindRailHints();
  bindToc();
  setDepth('L2');
}

/**
 * 目录高亮跟着正文走。滚动时只动左栏自身的 scrollTop —— 用 scrollIntoView
 * 会连页面一起滚，跟用户的滚动打架。
 */
function bindToc() {
  const links = [...document.querySelectorAll('.toc')];
  const rail = document.querySelector('.side');
  if (links.length === 0 || !rail) return;
  showChapterNotes(0);
  const io = new IntersectionObserver(
    (entries) => {
      const hit = entries.find((e) => e.isIntersecting);
      if (!hit) return;
      const ci = Number(hit.target.id.replace('ch', '')) - 1;
      showChapterNotes(ci);
      const active = links[ci];
      links.forEach((l) => l.classList.toggle('on', l === active));
      if (!active) return;
      const a = active.getBoundingClientRect();
      const r = rail.getBoundingClientRect();
      if (a.top < r.top) rail.scrollTop += a.top - r.top;
      else if (a.bottom > r.bottom) rail.scrollTop += a.bottom - r.bottom;
    },
    { rootMargin: '-72px 0px -68% 0px' },
  );
  document.querySelectorAll('.ch').forEach((ch) => io.observe(ch));
}

/**
 * 多章时右栏只列当前章的注释。全书 552 条平铺在侧栏里翻不动，
 * 也没人会为了查一个词从头滚到尾。
 */
function showChapterNotes(ci) {
  const box = document.querySelector('.notebox.by-ch');
  if (!box) return;
  let shown = 0;
  box.querySelectorAll('.note-i[data-ch]').forEach((note) => {
    const on = Number(note.dataset.ch) === ci;
    note.hidden = !on;
    note.classList.toggle('first', on && shown === 0);
    if (on) shown += 1;
  });
  const label = box.querySelector('.note-n');
  if (label) label.textContent = `　${shown}`;
  refreshRailHints();
}

/**
 * 两侧 sticky 栏内部滚动的渐隐提示。滚动条已藏起来（免得页面上出现多条），
 * 于是要另给一个「下面还有」的信号；滚到底就撤掉。
 */
let refreshRailHints = () => {};

function bindRailHints() {
  const rails = [...document.querySelectorAll('.side, .aside')];
  refreshRailHints = () => {
    rails.forEach((rail) => {
      rail.classList.toggle('scrolls', rail.scrollHeight - rail.clientHeight - rail.scrollTop > 2);
    });
  };
  rails.forEach((rail) => rail.addEventListener('scroll', refreshRailHints));
  window.addEventListener('resize', refreshRailHints);
  refreshRailHints();
}

/**
 * 三层阅读的唯一开关。CSS 靠 body[data-depth] 决定各区块的显隐，
 * 这里只负责改状态 —— 避免显隐逻辑散落在多处。
 */
function setDepth(depth) {
  document.body.dataset.depth = depth;
  document.querySelectorAll('.lv').forEach((x) => x.classList.toggle('on', x.dataset.depth === depth));
  // L1 会把注释一览收起来，侧栏高度跟着变，渐隐提示要重算。
  refreshRailHints();
  // L1 只给画面和名句，正文的原文/对照切换在这一层没有意义。
  if (depth === 'L3') {
    const compare = document.querySelector('.modes button[data-m="compare"]');
    if (compare && !compare.classList.contains('on')) compare.click();
  }
}

export async function renderWork(mount) {
  const wanted = new URLSearchParams(location.search).get('id');
  // 不写死默认 id —— 作品增删或改名后，写死的兜底会直接 404。
  const id = wanted ?? (await fetch('data/index.json').then((r) => r.json()))[0]?.id;
  if (!id) throw new Error('data/index.json 是空的，先跑 npm run import');
  const work = await fetch(`data/${id}.json`).then((r) => {
    if (!r.ok) throw new Error(`找不到作品 ${id}`);
    return r.json();
  });

  document.title = `${work.title} · ${work.author.name} — 文渊`;
  bindWorkNav(work.type);
  const hero = work.media.hero;
  const chapter = work.chapters[0];
  const multi = work.chapters.length > 1;
  const verse = VERSE_TYPES.has(work.type);
  const sec = Object.keys(SECTIONS).find((k) => SECTIONS[k].types.includes(work.type));

  const allNotes = [];
  work.chapters.forEach((ch, ci) =>
    ch.lines.forEach((line, li) =>
      line.notes.forEach((note, ni) => allNotes.push({ ...note, ch: ci, id: `n${ci}-${li}-${ni}` })),
    ),
  );

  const chapterLabel = (ch) => ch.title ?? `第 ${ch.index} 章`;

  /**
   * 典籍逐章成节：章题 + 正文 + 本章细读。
   * 大意与赏析挂在各章下面，而不是全书攒成一坨 —— 读完一章就该能就地深入。
   */
  const renderChapter = (ch, ci) => `
      <section class="ch" id="ch${ci + 1}">
        ${multi ? `<div class="ch-h"><h2>${esc(chapterLabel(ch))}</h2><u></u><em>${ch.lines.length} 句</em></div>` : ''}
        <div class="paper${verse ? '' : ' prose'}">
          ${verse ? renderVerse(ch.lines, ci) : renderProse(ch.lines, ci)}
          ${ci === work.chapters.length - 1 ? `<div class="seal">${esc(work.title.slice(0, 2))}</div>` : ''}
        </div>
        ${
          multi
            ? `<div class="deep ch-deep"><div class="deep-in">
          ${block('大意', ch.summary)}
          ${block('赏析', ch.commentary)}
        </div></div>`
            : ''
        }
      </section>`;

  mount.innerHTML = `
  <div class="crumb"><a href="home.html">首页</a><i>／</i><a href="home.html${sec ? `?sec=${sec}` : ''}">${esc(TYPE_LABEL[work.type])}</a><i>／</i>${esc(work.dynasty)}<i>／</i>${esc(work.title)}</div>

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
      <div class="box lvbox">
        <div class="box-t">阅 读 深 度</div>
        <div class="lv" data-depth="L1"><i>L1</i><p>一眼　只看画面与名句</p></div>
        <div class="lv on" data-depth="L2"><i>L2</i><p>通读　原文与白话对照</p></div>
        <div class="lv" data-depth="L3"><i>L3</i><p>深读　注释全开 + 细读</p></div>
      </div>
      <div class="idx">${esc(TYPE_LABEL[work.type])} · ${multi ? `全 ${work.chapters.length} 章` : '单篇'}</div>
      ${
        multi
          ? `<div class="box tocbox">
        <div class="box-t">目 录　${work.chapters.length}</div>
        ${work.chapters
          .map((ch, ci) => `<a class="toc" href="#ch${ci + 1}">${esc(chapterLabel(ch))}</a>`)
          .join('')}
      </div>`
          : ''
      }
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

      <div class="l1">
        ${work.famousLines
          .map(
            (f) =>
              `<blockquote class="fl"><p>${esc(f.text)}</p><cite>${esc(f.translation)}</cite></blockquote>`,
          )
          .join('')}
        <button class="btn ghost l1-more">继 续 读 全 篇　→</button>
      </div>

      <div class="modes"><button class="on" data-m="orig">原 文</button><button data-m="compare">对 照</button></div>
      ${work.chapters.map(renderChapter).join('')}

      <div class="deep"><div class="deep-in">
        <h3>细 读</h3>
        ${multi ? '' : block('大意', chapter.summary)}
        ${multi ? '' : block('逐段赏析', chapter.commentary)}
        ${block('时代背景', work.overview.background)}
        ${block('核心', work.overview.coreIdea)}
        ${block('结构', work.overview.structure)}
        ${block('艺术手法', work.overview.artistry)}
        ${block('影响与流传', work.overview.legacy)}
        ${
          work.overview.readingPath?.length
            ? block('阅读路线', work.overview.readingPath.join('\n'))
            : ''
        }
        ${block(
          '作者',
          `${work.author.name}${work.author.era ? `（${work.author.era}）` : ''}\n${work.author.bio}`,
        )}
      </div></div>

      ${
        work.famousLines.some((f) => f.note)
          ? `<div class="deep"><div class="deep-in">
        <h3>名 句 精 讲</h3>
        ${work.famousLines
          .filter((f) => f.note)
          .map(
            (f) =>
              `<section class="blk jiang"><b>${esc(f.text)}</b><div>${paras(f.note)
                .map((p) => `<p>${esc(p)}</p>`)
                .join('')}</div></section>`,
          )
          .join('')}
      </div></div>`
          : ''
      }
    </div>

    <aside class="aside">
      <div class="box">
        <div class="box-t">名 句</div>
        ${work.famousLines.map((f) => `<div class="note-i"><b>${esc(f.text)}</b><p>${esc(f.translation)}</p></div>`).join('')}
      </div>
      <div class="box notebox${multi ? ' by-ch' : ''}">
        <div class="box-t">${multi ? '本 章 注 释' : `注 释 一 览　${allNotes.length}`}<b class="note-n"></b></div>
        ${allNotes
          .map(
            (n) =>
              `<div class="note-i" data-t="${n.id}" data-ch="${n.ch}"><b>${esc(n.term)}${n.pinyin ? `<s>${esc(n.pinyin)}</s>` : ''}</b><p>${esc(n.explain)}</p></div>`,
          )
          .join('')}
      </div>
    </aside>
  </div>
  <footer>文渊 · 阅读页　内容由导入流水线生成</footer>`;

  bindReader();
  const more = mount.querySelector('.l1-more');
  if (more) more.onclick = () => setDepth('L2');
}

const DYNASTY_ORDER = ['先秦', '秦', '汉', '魏晋', '南北朝', '隋', '唐', '五代', '宋', '元', '明', '清'];
/** 春秋、战国在长河里都算先秦，否则并排三根只差一个词的柱子。 */
const DYNASTY_ALIAS = { 春秋: '先秦', 战国: '先秦' };

/** 把「北宋」「初唐」「东汉」归到主朝代，长河不该被细分朝代打散。 */
function normalizeDynasty(d) {
  const alias = Object.keys(DYNASTY_ALIAS).find((k) => d.includes(k));
  if (alias) return DYNASTY_ALIAS[alias];
  const hit = DYNASTY_ORDER.find((era) => d.includes(era));
  return hit ?? d;
}

function renderRiver(index, onPick) {
  const counts = new Map();
  for (const w of index) {
    const era = normalizeDynasty(w.dynasty);
    counts.set(era, (counts.get(era) ?? 0) + 1);
  }
  const max = Math.max(...counts.values(), 1);
  const rows = [...counts.entries()].sort(
    (a, b) => DYNASTY_ORDER.indexOf(a[0]) - DYNASTY_ORDER.indexOf(b[0]),
  );
  const host = document.querySelector('[data-river]');
  if (!host) return;
  host.innerHTML = rows
    .map(
      ([era, n]) =>
        `<div class="era" data-era="${esc(era)}"><b>${esc(era)}</b><span class="bar"><i style="width:${Math.round((n / max) * 100)}%"></i></span><s>${n}</s></div>`,
    )
    .join('');
  host.querySelectorAll('.era').forEach((el) => {
    el.onclick = () =>
      onPick(el.classList.contains('on') ? null : { kind: 'dynasty', value: el.dataset.era });
  });
}

function renderMoods(index, onPick) {
  const counts = new Map();
  for (const w of index) {
    for (const m of w.moods) counts.set(m, (counts.get(m) ?? 0) + 1);
  }
  const host = document.querySelector('[data-moods]');
  if (!host) return;
  host.innerHTML = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([m, n]) => `<button class="mood" data-mood="${esc(m)}">${esc(m)}<s>${n}</s></button>`)
    .join('');
  host.querySelectorAll('.mood').forEach((el) => {
    el.onclick = () =>
      onPick(el.classList.contains('on') ? null : { kind: 'mood', value: el.dataset.mood });
  });
}

function renderPicks(index, filter) {
  const list = !filter
    ? index
    : index.filter((w) => {
        if (filter.kind === 'section') return SECTIONS[filter.value].types.includes(w.type);
        return filter.kind === 'dynasty'
          ? normalizeDynasty(w.dynasty) === filter.value
          : w.moods.includes(filter.value);
      });
  const host = $('.pick-row');
  host.innerHTML =
    list.length === 0
      ? '<div class="empty">这一格还没有作品。</div>'
      : list
          .map(
            (w) => `<a class="pick" href="work.html?id=${encodeURIComponent(w.id)}">
        ${w.hero ? `<i class="thumb" style="background-image:url(${esc(w.hero)})"></i>` : ''}
        <div class="cat">${esc(w.dynasty)} · ${esc(TYPE_LABEL[w.type])}</div>
        <h3>${esc(w.title)}</h3><div class="by">${esc(w.author)}</div>
        <q>${esc(w.lead.text)}</q></a>`,
          )
          .join('');
  const label = $('[data-pick-count]');
  if (label) label.textContent = filter ? `${list.length} / ${index.length} 篇` : `${index.length} 篇`;
}

/**
 * 首页顶栏板块：就地筛选，不跳页。空板块与还没做的栏目置灰，
 * 点了没反应比不能点更让人困惑。
 */
function renderNav(index, onPick) {
  navItems().forEach(({ li, key }) => {
    const count = key ? index.filter((w) => SECTIONS[key].types.includes(w.type)).length : 0;
    if (count === 0) {
      li.classList.add('off');
      li.title = key ? '这个板块还没有作品' : '还没做';
      return;
    }
    li.dataset.sec = key;
    li.onclick = () => {
      const on = li.classList.contains('on');
      onPick(on ? null : { kind: 'section', value: key });
    };
  });
}

/** 单一筛选条件：三处入口互斥，同时亮着两个筛选器会让人搞不清看到的是什么。 */
function applyFilter(index, filter) {
  document.querySelectorAll('nav li[data-sec]').forEach((li) =>
    li.classList.toggle('on', filter?.kind === 'section' && li.dataset.sec === filter.value));
  document.querySelectorAll('[data-river] .era').forEach((el) =>
    el.classList.toggle('on', filter?.kind === 'dynasty' && el.dataset.era === filter.value));
  document.querySelectorAll('[data-moods] .mood').forEach((el) =>
    el.classList.toggle('on', filter?.kind === 'mood' && el.dataset.mood === filter.value));
  renderPicks(index, filter);
  const url = filter?.kind === 'section' ? `?sec=${filter.value}` : location.pathname;
  history.replaceState(null, '', url);
}

export async function renderHome(mount) {
  const index = await fetch('data/index.json').then((r) => r.json());
  const lead = index[0];
  if (!lead) return;
  const hero = lead.hero;

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

  const apply = (filter) => applyFilter(index, filter);
  renderNav(index, apply);
  renderRiver(index, apply);
  renderMoods(index, apply);

  // 阅读页的顶栏与面包屑用 ?sec= 跳回来，落地就该停在那个板块上。
  const sec = new URLSearchParams(location.search).get('sec');
  apply(sec && SECTIONS[sec] ? { kind: 'section', value: sec } : null);
}

