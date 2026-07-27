const $ = (sel, root = document) => root.querySelector(sel);

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const STARS = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
const TYPE_LABEL = { poem: '诗', ci: '词', essay: '文章', classic: '典籍' };
/** 顶栏板块 → 体裁。诗、词同属「诗词」板块。 */
const SECTIONS = {
  poem: { label: '诗词', types: ['poem', 'ci'] },
  essay: { label: '文章', types: ['essay'] },
  classic: { label: '典籍', types: ['classic'] },
};

/** 顶栏里指向独立页面的栏目 —— 不是体裁筛选，点了就换页。 */
const PAGES = { 人物: 'people.html', 长河: 'river.html', 地图: 'map.html' };

/** 顶栏各项与板块 key 的对应，HTML 里只写中文，映射放在这里。 */
function navItems() {
  return [...document.querySelectorAll('nav li')].map((li) => ({
    li,
    label: li.textContent.trim(),
    key: Object.keys(SECTIONS).find((k) => SECTIONS[k].label === li.textContent.trim()) ?? null,
  }));
}

/**
 * 顶栏只在这一处绑定，每个页面都把六项全绑一遍。
 *
 * 之前是各页各绑一部分：首页绑体裁筛选、阅读页绑跳转、人物/长河/地图
 * 只绑了自己那一项 —— 于是那三页里的「诗词/文章/典籍」压根没有点击行为，
 * 看着能点，点了没反应。顶栏的状态必须一次算完，不能按页拼。
 *
 * - `activePage`：当前所在的独立页面（人物 / 长河 / 地图）
 * - `activeType`：阅读页当前作品的体裁，用来高亮所属板块
 * - `index`+`onSection`：只有首页给，表示体裁项做就地筛选而不是跳转
 */
function bindNav({ activePage = null, activeType = null, index = null, onSection = null } = {}) {
  navItems().forEach(({ li, label, key }) => {
    const page = PAGES[label];
    if (page) {
      li.classList.remove('off');
      li.classList.toggle('on', label === activePage);
      li.onclick = () => {
        location.href = page;
      };
      return;
    }
    if (!key) {
      li.classList.add('off');
      li.title = '还没做';
      return;
    }
    li.dataset.sec = key;
    if (index) {
      // 首页：就地筛选。空板块置灰 —— 点了没反应比不能点更让人困惑。
      if (index.filter((w) => SECTIONS[key].types.includes(w.type)).length === 0) {
        li.classList.add('off');
        li.title = '这个板块还没有作品';
        return;
      }
      li.classList.remove('off');
      li.onclick = () => onSection(li.classList.contains('on') ? null : { kind: 'section', value: key });
      return;
    }
    li.classList.remove('off');
    li.classList.toggle('on', activeType !== null && SECTIONS[key].types.includes(activeType));
    li.onclick = () => {
      location.href = `home.html?sec=${key}`;
    };
  });
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
      // 限高要按栏目**当前**的起点算。写死 100vh-96px 时，页面还没滚动、
      // 栏目起点在页面中段，底边就被挤到视口外，渐隐提示等于没有。
      if (getComputedStyle(rail).position === 'sticky') {
        const top = Math.max(rail.getBoundingClientRect().top, 76);
        rail.style.maxHeight = `${Math.max(260, Math.round(window.innerHeight - top - 20))}px`;
      } else {
        rail.style.maxHeight = '';
      }
      rail.classList.toggle('scrolls', rail.scrollHeight - rail.clientHeight - rail.scrollTop > 2);
    });
  };
  rails.forEach((rail) => rail.addEventListener('scroll', refreshRailHints));
  window.addEventListener('resize', refreshRailHints);
  window.addEventListener('scroll', refreshRailHints, { passive: true });
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
  bindNav({ activeType: work.type });
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
      <div class="by"><span class="who">${esc(work.author.name)}</span> · ${esc(work.dynasty)}</div>
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
      </div>      <div class="idx">${esc(TYPE_LABEL[work.type])} · ${multi ? `全 ${work.chapters.length} 章` : '单篇'}</div>
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
  linkAuthor(work.author.name).catch(() => undefined);
  const more = mount.querySelector('.l1-more');
  if (more) more.onclick = () => setDepth('L2');
}

/**
 * 把作品页的作者名接到人物页。人物档案是后立的，可能还没有这个人，
 * 查不到就保持纯文本 —— 不能因为缺档案而让阅读页出现死链。
 */
async function linkAuthor(name) {
  const people = await fetch('data/people.json')
    .then((r) => (r.ok ? r.json() : []))
    .catch(() => []);
  const hit = people.find((p) => p.name === name);
  if (!hit) return;
  const href = `person.html?id=${encodeURIComponent(hit.id)}`;
  const who = document.querySelector('.wband-in .who');
  if (who) who.outerHTML = `<a class="who" href="${href}">${esc(name)}</a>`;
  const blk = [...document.querySelectorAll('.deep .blk')].find(
    (b) => b.querySelector('b')?.textContent === '作者',
  );
  const body = blk?.querySelector('div');
  if (body) {
    body.insertAdjacentHTML(
      'beforeend',
      `<p><a class="who-link" href="${href}">读 ${esc(name)} 的人物档案　→</a></p>`,
    );
  }
}

const DYNASTY_ORDER = ['先秦', '秦', '汉', '魏晋', '南北朝', '隋', '唐', '五代', '宋', '元', '明', '清'];

/**
 * 首页长河按朝代分段。分段口径在 build-data 里算好写进索引（`eraName`），
 * 前端不再自己归并 —— 归并规则写两份必然漂。
 */
function eraOf(work) {
  return work.eraName ?? work.dynasty;
}

function renderRiver(index, onPick) {
  const counts = new Map();
  const starts = new Map();
  for (const w of index) {
    const era = eraOf(w);
    counts.set(era, (counts.get(era) ?? 0) + 1);
    starts.set(era, w.eraStart ?? DYNASTY_ORDER.indexOf(era));
  }
  const max = Math.max(...counts.values(), 1);
  const rows = [...counts.entries()].sort((a, b) => (starts.get(a[0]) ?? 0) - (starts.get(b[0]) ?? 0));
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
        return filter.kind === 'dynasty' ? eraOf(w) === filter.value : w.moods.includes(filter.value);
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
  bindNav({ index, onSection: apply });
  renderRiver(index, apply);
  renderMoods(index, apply);

  // 阅读页的顶栏与面包屑用 ?sec= 跳回来，落地就该停在那个板块上。
  const sec = new URLSearchParams(location.search).get('sec');
  apply(sec && SECTIONS[sec] ? { kind: 'section', value: sec } : null);
}

/* ══ 长河 ══ */

/**
 * 按朝代等宽分段，不按公元年线性排 —— 站内跨度两千多年，
 * 真按年份画，先秦一个点之后就是一千多年空白。
 * 空朝代不藏起来：它同时是「这个站还缺什么」的进度条。
 */
export async function renderRiverPage(mount) {
  bindNav({ activePage: '长河' });
  const eras = await fetch('data/eras.json').then((r) => r.json());
  document.title = '长河 — 文渊';
  const total = eras.reduce((n, e) => n + e.works.length, 0);
  const most = Math.max(...eras.map((e) => e.works.length + e.people.length), 1);

  const filled = (e) => e.works.length + e.people.length > 0;

  mount.innerHTML = `
  <div class="crumb"><a href="home.html">首页</a><i>／</i>长河</div>
  <div class="sec-h ppl-h"><h2>长 河</h2><u></u><em>${eras.length} 段 · 收录 ${total} 篇</em></div>
  <div class="riv-lead">从先秦到清，看文学一路在变什么。灰的那几段还没有收录。</div>

  <div class="axis">
    ${eras
      .map(
        (e) => `<a class="ax${filled(e) ? ' has' : ''}" href="#era-${e.id}">
      <b>${esc(e.name)}</b>
      <i style="height:${filled(e) ? 6 + Math.round(((e.works.length + e.people.length) / most) * 26) : 3}px"></i>
      <s>${filled(e) ? `${e.works.length}篇${e.people.length > 0 ? ` · ${e.people.length}人` : ''}` : '—'}</s>
    </a>`,
      )
      .join('')}
  </div>

  ${eras
    .map(
      (e) => `<section class="era-sec${filled(e) ? '' : ' bare'}" id="era-${e.id}">
    <div class="era-h">
      <h3>${esc(e.name)}</h3><span class="era-range">${esc(e.range)}</span><u></u>
      <em>${filled(e) ? `${e.works.length} 篇${e.people.length > 0 ? ` · ${e.people.length} 人` : ''}` : '尚无收录'}</em>
    </div>
    <div class="era-body">
      <p class="era-shift">${esc(e.shift)}</p>
      <div class="era-marks">${e.marks.map((m) => `<span>${esc(m)}</span>`).join('')}</div>
      ${
        e.works.length > 0
          ? `<div class="era-works">${e.works
              .map(
                (w) => `<a class="ew" href="work.html?id=${encodeURIComponent(w.id)}">
        <div class="cat">${esc(w.dynasty)} · ${esc(TYPE_LABEL[w.type])}</div>
        <h4>${esc(w.title)}</h4><div class="by">${esc(w.author)}</div>
      </a>`,
              )
              .join('')}</div>`
          : ''
      }
      ${
        e.people.length > 0
          ? `<div class="era-people">${e.people
              .map(
                (p) => `<a class="ep" href="person.html?id=${encodeURIComponent(p.id)}">
        <b>${esc(p.name)}<s>${esc(p.era)}</s></b><p>${esc(p.hook)}</p>
      </a>`,
              )
              .join('')}</div>`
          : ''
      }
    </div>
  </section>`,
    )
    .join('')}

  <footer>文渊 · 长河　导语只讲流变，站内收录由数据反查</footer>`;
}

/* ══ 地图 ══ */

/**
 * 写意山河底图：只画黄河、长江与海岸示意，**不画国界**。
 * 一来这套线条才合宣纸调性，二来国界不是这个站该碰的东西。
 * 经纬度全部来自手写的地名表，模型碰不到坐标。
 */
const MAP_BOX = { west: 92, east: 124, south: 17, north: 43 };
const MAP_W = 1070;
const MAP_H = 1000;

const project = (lng, lat) => [
  ((lng - MAP_BOX.west) / (MAP_BOX.east - MAP_BOX.west)) * MAP_W,
  ((MAP_BOX.north - lat) / (MAP_BOX.north - MAP_BOX.south)) * MAP_H,
];

const HUANGHE = [
  [100.2, 34.9], [103.8, 36.1], [106.3, 38.5], [109.5, 40.5], [111.5, 39.5],
  [110.5, 37], [110.3, 35], [112.5, 34.8], [114.3, 34.9], [116.5, 35.8], [118.5, 37.3], [119.2, 37.8],
];
const CHANGJIANG = [
  [100.5, 28.5], [104.6, 28.8], [106.5, 29.6], [108.5, 30.6],
  [111.3, 30.7], [114.3, 30.6], [116, 29.9], [118.8, 32.1], [120.5, 31.8], [121.8, 31.4],
];
const COAST = [
  [124.3, 40], [123.5, 39.8], [121.6, 38.9], [122.1, 40.7], [121, 40.9], [119.6, 39.9],
  [117.8, 39], [118, 38.2], [119, 37.8], [119.9, 37.3], [121.5, 37.6], [122.7, 37.4],
  [120.7, 36.1], [119.5, 35], [119.2, 34.5], [120.5, 33.4], [121.8, 31.4], [121.2, 30.3],
  [121.6, 29.9], [120.7, 28], [119.6, 26.1], [118.1, 24.5], [116.7, 23.4], [114.2, 22.3],
  [111.9, 21.8], [110.3, 20.4],
];
const HAINAN = [[109.3, 19.9], [110.6, 20], [111, 19], [110, 18.2], [108.7, 19.3]];

/**
 * 折线倒角：在每个顶点两侧各留一小段直线，只把拐角磨圆。
 * 直接连中点画曲线会把半岛这类地理特征抹平，倒角能既去掉硬折角又保住形状。
 */
function polyline(points, close = false) {
  const pts = points.map(([lng, lat]) => project(lng, lat));
  const n = (p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
  if (pts.length < 3) {
    return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${n(p)}`).join(' ');
  }
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  const R = 0.26;
  const loop = close ? [...pts, pts[0]] : pts;
  let d = `M${n(close ? lerp(loop[0], loop[1], R) : loop[0])}`;
  for (let i = 1; i < loop.length - 1; i += 1) {
    d += ` L${n(lerp(loop[i], loop[i - 1], R))} Q${n(loop[i])} ${n(lerp(loop[i], loop[i + 1], R))}`;
  }
  if (!close) return `${d} L${n(loop[loop.length - 1])}`;
  const last = loop[loop.length - 1];
  return `${d} L${n(lerp(last, loop[loop.length - 2], R))} Q${n(last)} ${n(lerp(last, loop[1], R))} Z`;
}

export async function renderMap(mount) {
  bindNav({ activePage: '地图' });
  const data = await fetch('data/map.json').then((r) => r.json());
  document.title = '地图 — 文渊';
  const { places, routes } = data;

  const byId = new Map(places.map((p) => [p.id, p]));
  const most = Math.max(...places.map((p) => p.events.length), 1);

  /** 同一个人在一地反复出入是常事，列名单要去重，否则「刘禹锡、刘禹锡、刘禹锡」。 */
  const visitors = (place) => {
    const times = new Map();
    for (const e of place.events) times.set(e.name, (times.get(e.name) ?? 0) + 1);
    return [...times.entries()].map(([name, n]) => (n > 1 ? `${name} ×${n}` : name)).join('、');
  };

  const dots = places
    .map((p) => {
      const [x, y] = project(p.lng, p.lat);
      const r = 4 + Math.round((p.events.length / most) * 5);
      return `<g class="dot" data-place="${esc(p.id)}" transform="translate(${x.toFixed(1)},${y.toFixed(1)})">
        <circle class="halo" r="${r + 9}"></circle>
        <circle class="pin" r="${r}"></circle>
        <text x="${r + 6}" y="5">${esc(p.name)}</text>
      </g>`;
    })
    .join('');

  const routePaths = routes
    .map((route) => {
      const pts = route.stops.map((s) => byId.get(s.place)).filter(Boolean);
      if (pts.length < 2) return '';
      const d = polyline(pts.map((p) => [p.lng, p.lat]));
      return `<path class="route" data-route="${esc(route.id)}" d="${d}"></path>`;
    })
    .join('');

  mount.innerHTML = `
  <div class="crumb"><a href="home.html">首页</a><i>／</i>地图</div>
  <div class="sec-h ppl-h"><h2>地 图</h2><u></u><em>${routes.length} 条行迹 · ${places.length} 处</em></div>
  <div class="riv-lead">古人的路是走出来的。选一位，看他这一生被贬到过多远。</div>

  <div class="map-grid">
    <aside class="side">
      <div class="box">
        <div class="box-t">行 迹</div>
        <div class="rt on" data-route="all"><b>全部</b><s>${places.length} 处</s></div>
        ${routes
          .map(
            (r) =>
              `<div class="rt" data-route="${esc(r.id)}"><b>${esc(r.name)}</b><s>${r.stops.length} 站</s></div>`,
          )
          .join('')}
      </div>
      <div class="box legend">
        <div class="box-t">读 图</div>
        <p>线条只画黄河、长江与海岸走向，不是行政地图。</p>
        <p>点的大小按这里发生过多少事。</p>
      </div>
    </aside>

    <div class="map-wrap">
      <svg viewBox="0 0 ${MAP_W} ${MAP_H}" class="map" preserveAspectRatio="xMidYMid meet">
        <path class="water" d="${polyline(COAST)}"></path>
        <path class="water" d="${polyline(HAINAN, true)}"></path>
        <path class="river" d="${polyline(HUANGHE)}"></path>
        <path class="river" d="${polyline(CHANGJIANG)}"></path>
        <g class="routes">${routePaths}</g>
        <g class="dots">${dots}</g>
      </svg>
    </div>

    <aside class="aside">
      <div class="box" data-panel></div>
    </aside>
  </div>
  <footer>文渊 · 地图　坐标取自站内地名表，行迹由人物年表串成</footer>`;

  bindMap(mount, data, byId, visitors);
}

function bindMap(mount, data, byId, visitors) {
  const panel = mount.querySelector('[data-panel]');
  const svg = mount.querySelector('svg.map');

  const showAll = () => {
    svg.dataset.route = 'all';
    mount.querySelectorAll('.dot').forEach((d) => d.classList.remove('off', 'on'));
    mount.querySelectorAll('.route').forEach((r) => r.classList.remove('on'));
    panel.innerHTML = `<div class="box-t">全 部 地 点　${data.places.length}</div>${data.places
      .map(
        (p) =>
          `<div class="note-i" data-jump="${esc(p.id)}"><b>${esc(p.name)}<s>${esc(p.today)}</s></b><p>${esc(
            visitors(p),
          )}</p></div>`,
      )
      .join('')}`;
    bindJump();
    refreshRailHints();
  };

  /** 选中一个人：他走过的地方亮起，其余压暗，右栏换成按年份排的站点。 */
  const showRoute = (id) => {
    const route = data.routes.find((r) => r.id === id);
    if (!route) return showAll();
    svg.dataset.route = id;
    const stops = new Set(route.stops.map((s) => s.place));
    mount.querySelectorAll('.dot').forEach((d) => {
      const on = stops.has(d.dataset.place);
      d.classList.toggle('on', on);
      d.classList.toggle('off', !on);
    });
    mount.querySelectorAll('.route').forEach((r) => r.classList.toggle('on', r.dataset.route === id));
    panel.innerHTML = `<div class="box-t">${esc(route.name)} 的行迹　${route.stops.length}</div>${route.stops
      .map((s, i) => {
        const place = byId.get(s.place);
        return `<div class="note-i stop" data-jump="${esc(s.place)}">
        <b><i>${i + 1}</i>${esc(place?.name ?? s.place)}<s>${esc(s.label)}</s></b>
        <p>${esc(s.title)}</p></div>`;
      })
      .join('')}
      <a class="who-link" href="person.html?id=${encodeURIComponent(route.id)}">读 ${esc(route.name)} 的人物档案　→</a>`;
    bindJump();
    refreshRailHints();
  };

  const bindJump = () => {
    panel.querySelectorAll('[data-jump]').forEach((el) => {
      el.onclick = () => {
        const dot = mount.querySelector(`.dot[data-place="${el.dataset.jump}"]`);
        if (!dot) return;
        mount.querySelectorAll('.dot').forEach((d) => d.classList.remove('flash'));
        dot.classList.add('flash');
      };
    });
  };

  mount.querySelectorAll('.rt').forEach((el) => {
    el.onclick = () => {
      mount.querySelectorAll('.rt').forEach((x) => x.classList.remove('on'));
      el.classList.add('on');
      if (el.dataset.route === 'all') showAll();
      else showRoute(el.dataset.route);
    };
  });
  mount.querySelectorAll('.dot').forEach((el) => {
    el.onclick = () => {
      const place = data.places.find((p) => p.id === el.dataset.place);
      if (!place) return;
      panel.innerHTML = `<div class="box-t">${esc(place.name)}　${esc(place.today)}</div>${place.events
        .map(
          (e) =>
            `<a class="note-i" href="person.html?id=${encodeURIComponent(e.person)}"><b>${esc(e.name)}<s>${e.year}</s></b><p>${esc(e.title)}</p></a>`,
        )
        .join('')}`;
      refreshRailHints();
    };
  });
  bindJump();
  bindRailHints();
  showAll();
}

/* ══ 人物 ══ */

/** 人物列表按生年排，本身就是一条时间线。 */
export async function renderPeople(mount) {
  bindNav({ activePage: '人物' });
  const people = await fetch('data/people.json').then((r) => r.json());
  document.title = '人物 — 文渊';
  mount.innerHTML = `
  <div class="crumb"><a href="home.html">首页</a><i>／</i>人物</div>
  <div class="sec-h ppl-h"><h2>人 物</h2><u></u><em>${people.length} 位</em></div>
  ${
    people.length === 0
      ? '<div class="empty">还没有人物档案，先跑 npm run people。</div>'
      : `<div class="ppl">${people
          .map(
            (p) => `<a class="pcard" href="person.html?id=${encodeURIComponent(p.id)}">
      ${p.hero ? `<i class="thumb" style="background-image:url(${esc(p.hero)})"></i>` : ''}
      <div class="cat">${esc(p.dynasty)}<s>${esc(p.era)}</s></div>
      <h3>${esc(p.name)}</h3>
      <q>${esc(p.hook)}</q>
      <div class="ptags">${p.traits.slice(0, 3).map((t) => `<span>${esc(t)}</span>`).join('')}</div>
      <div class="pworks">${
        p.works.length > 0
          ? `站内 ${p.works.length} 篇 · ${p.works.map((w) => esc(w.title)).join('、')}`
          : '站内暂无作品'
      }</div>
    </a>`,
          )
          .join('')}</div>`
  }
  <footer>文渊 · 人物　档案由导入流水线生成</footer>`;
}

const RELATION_HINT = {
  师友: '师友',
  同僚: '同僚',
  亲属: '亲属',
  门生: '门生',
  政敌: '政敌',
  知音: '知音',
  后世追随: '后世',
};

export async function renderPerson(mount) {
  bindNav({ activePage: '人物' });
  const wanted = new URLSearchParams(location.search).get('id');
  // 不写死默认 id —— 人物增删或改名后，写死的兜底会直接 404。
  const id = wanted ?? (await fetch('data/people.json').then((r) => r.json()))[0]?.id;
  if (!id) throw new Error('data/people.json 是空的，先跑 npm run people');
  const p = await fetch(`data/people/${id}.json`).then((r) => {
    if (!r.ok) throw new Error(`找不到人物 ${id}`);
    return r.json();
  });

  document.title = `${p.name} · ${p.dynasty} — 文渊`;
  const inSite = new Map((p.works ?? []).map((w) => [w.title, w.id]));

  mount.innerHTML = `
  <div class="crumb"><a href="home.html">首页</a><i>／</i><a href="people.html">人物</a><i>／</i>${esc(p.dynasty)}<i>／</i>${esc(p.name)}</div>

  <section class="wband">
    ${p.media.hero ? `<img src="${esc(p.media.hero)}" alt="${esc(p.name)} 意境图">` : ''}
    <div class="wband-in">
      <h1>${esc(p.name)}</h1>
      <div class="by">${esc(p.dynasty)} · ${esc(p.era)}${p.aka.length > 0 ? `　${p.aka.map(esc).join('　')}` : ''}</div>
      <div class="tags">${p.traits.map((t) => `<span>${esc(t)}</span>`).join('')}</div>
    </div>
  </section>

  <div class="r-grid">
    <aside class="side">
      <div class="idx">人物 · ${(p.works ?? []).length > 0 ? `站内 ${p.works.length} 篇` : '站内暂无作品'}</div>
      <div class="kv"><span>朝代</span><b>${esc(p.dynasty)}</b></div>
      <div class="kv"><span>生卒</span><b>${esc(p.era)}</b></div>
      ${p.aka.length > 0 ? `<div class="kv"><span>别称</span><b>${p.aka.map(esc).join('<br>')}</b></div>` : ''}
      <div class="kv"><span>年表</span><b>${p.timeline.length} 节点</b></div>
      <div class="kv"><span>交游</span><b>${p.circle.length} 位</b></div>
      ${
        p.media.hero
          ? `<div class="figbox">
        <img src="${esc(p.media.hero)}" alt="${esc(p.name)} 配图">
        <figcaption>人物意境图 · 只出意境不画人像</figcaption>
      </div>`
          : ''
      }
    </aside>

    <div class="main">
      <div class="lead">${esc(p.hook)}</div>

      <div class="deep-in plain">
        ${block('小传', p.bio)}
      </div>

      <div class="sec-h life-h"><h2>生 平</h2><u></u><em>${p.timeline.length} 个节点</em></div>
      <ol class="life">
        ${p.timeline
          .map(
            (t) => `<li>
          <i>${esc(t.label)}</i>
          <div><b>${esc(t.title)}</b><p>${esc(t.detail)}</p></div>
        </li>`,
          )
          .join('')}
      </ol>

      ${
        p.circle.length > 0
          ? `<div class="sec-h"><h2>交 游</h2><u></u><em>${p.circle.length} 位</em></div>
      <div class="circle">
        ${p.circle
          .map(
            (c) => `<div class="cc"><b>${esc(c.name)}<s>${esc(RELATION_HINT[c.relation] ?? c.relation)}</s></b><p>${esc(c.note)}</p></div>`,
          )
          .join('')}
      </div>`
          : ''
      }
    </div>

    <aside class="aside">
      <div class="box">
        <div class="box-t">代 表 作　${p.masterpieces.length}</div>
        ${p.masterpieces
          .map((m) => {
            const wid = m.workId ?? inSite.get(m.title);
            const body = `<b>${esc(m.title)}${wid ? '<s>站内可读</s>' : ''}</b><p>${esc(m.note)}</p>`;
            return wid
              ? `<a class="note-i" href="work.html?id=${encodeURIComponent(wid)}">${body}</a>`
              : `<div class="note-i plain">${body}</div>`;
          })
          .join('')}
      </div>
      ${
        (p.works ?? []).length > 0
          ? `<div class="box">
        <div class="box-t">站 内 作 品　${p.works.length}</div>
        ${p.works
          .map(
            (w) =>
              `<a class="note-i" href="work.html?id=${encodeURIComponent(w.id)}"><b>${esc(w.title)}<s>${esc(TYPE_LABEL[w.type])}</s></b></a>`,
          )
          .join('')}
      </div>`
          : ''
      }
    </aside>
  </div>
  <footer>文渊 · 人物　档案由导入流水线生成</footer>`;

  bindRailHints();
}

