# 文渊 Wenyuan

中国古典文学阅读站 —— 唐诗、宋词、古文、典籍，原文与白话对照，点词出注。

线上：<https://cubika.github.io/wenyuan/>
需求与设计决策：[docs/DECISIONS.md](docs/DECISIONS.md)

## 结构

```
data/raw/            原文投入口，丢一个 txt 进来即可
data/works/          作品流水线产物（结构化 JSON），进版本库
data/people/         人物档案（生平年表 / 交游 / 代表作），进版本库
data/eras.json       长河的十二段朝代导语，进版本库
data/places.json     地图的地名表（手写，坐标是硬事实，模型只能从中挑）
packages/schema/     Zod 契约 + 跨字段校验
packages/pipeline/   导入流水线（切分 → 识别 → 译注 → 导读 → 出图）
prototypes/          静态站点，运行时读 data/*.json
```

## 导入一篇作品

```bash
npm install
npm run import -- data/raw/chunjiang-huayueye.txt   # 生成 data/works/<id>.json
npm run media  -- data/works/<id>.json              # 依 AI 写的 prompt 出图并压成 webp
npm run people                                       # 从作品里扫作者，逐位立人物档案
npm run media  -- data/people/<id>.json --person     # 人物意境图（不画人像）
npm run eras                                         # 长河的十二段朝代导语（一次生成即可）
node scripts/build-data.mjs                          # 同步进站点并生成索引
```

`import` 会**按 hash 跳过未改动的章节**，改几句重跑不会全量烧 token；`--force` 强制全量。

## 开发

```bash
npm run typecheck                       # 全量 tsc --noEmit
npm run test                            # vitest（schema 契约 + 人物/长河校验 + pipeline 切分）
npm run check                           # 上面两个

cd prototypes && python -m http.server 5180
node scripts/verify-ui.mjs              # 114 项 UI 断言（需 dev server）
node scripts/verify-ui.mjs https://cubika.github.io/wenyuan   # 也可跑线上
```

`npm run media -- <json> --force` 里的 `--force` 会被 npm 自己吃掉，重出图要直接调
`node --experimental-strip-types packages/pipeline/src/cliMedia.ts <json> --force`。

## 约定

- 相对导入带 `.ts` 后缀；`verbatimModuleSyntax` 要求类型导入用 `import type`
- 严格模式开 `noUncheckedIndexedAccess`，索引访问要判空
- 不使用 `any`
- 只给需要解释的代码写注释

## 架构约束

- **所有 `@github/copilot-sdk` 调用只能在 `packages/pipeline/src/copilot/client.ts`**。该 SDK 文档与实际类型不一致（文档写 `defineTool({name})`，实际是 `defineTool(name, {})`），版本升级只改这一个文件。
- **AI 只能通过 emit 工具交付**，不解析自由文本 JSON。校验失败时把逐条错误当作**工具返回值**回灌给模型，在同一会话内自修复。
- **切分不交给 AI**。模型做切分又慢又会漏字改字；正则切完再喂给 AI 逐块解析。
- **原文一字不改**是硬校验。`annotate` 会逐句比对模型返回的 `text` 与投入的原文，不一致就打回。
- **段落归属由切分算，不问模型**。`Line.para` 在 `segment` 阶段写死并覆盖模型返回值 —— 文章要按段连排，段落信息一旦在切分时丢掉就补不回来。段号不进 content hash，改分段不会让译注缓存全部落空。
- **章题以原文为准**。模型逐章独立作业，让它「整理」标题会得到各章格式互不相同的结果；原文自带篇名就用原文，没有篇名才让模型拟。
- **人物是独立实体**。作品里的 `author.bio` 围着那一篇写，换到人物页就偏题；人物单独立档，姓名是自然主键，id 以已有档案为准不能漂。名下作品由 works 反查，不信模型填的 `workId`。
- **「站内有什么」永远反查，绝不写进 AI 文本**。长河的朝代导语只讲这个时期文学在变什么，schema 层禁止出现书名号与站内作者名 —— 挂了钩就得跟着每次新增作品重写。
- **文案要去 AI 味**。忌「不是 A，而是 B」「不仅…更…」这类对仗式总结句连用，忌套话，忌句式雷同。约束写在 `stages/voice.ts`，各阶段共用。
- **地图不画国界**，只画水系与海岸走向；地名坐标全部来自手写的 `data/places.json`，模型只能从表里挑 id。
- **顶栏在一处绑完**。`bindNav` 一次算完六项的状态与行为，不按页拼。曾经是各页各绑一部分，人物/长河/地图 三页的体裁项没绑点击，看着能点、点了没反应。
- **看截图一律派 subagent**，不要读进主上下文。详见 [AGENTS.md](AGENTS.md)。
- **注释的 `term` 必须是原句连续子串**。前端靠子串定位挂高亮，锚不上的注释等于废注，schema 层直接拒绝。
- **名句必须逐字出自原文**（忽略标点），防止模型凭印象编造。
- **出图 prompt 由读过原文的模型产出**，不套模板 —— 这是配图质量的关键。风格锚按体裁固定；**主体必须在画面右侧、左侧留白**，因为站点的标题固定压在图片左边。
- **图片必须串行生成**，且只提交 webp。GitHub Pages 不解析 Git LFS 指针，体积得靠压缩控住。

## Git

直接提交 `main`，不走 PR。每轮改动经确认后即推送，GitHub Actions 自动部署到 Pages。

推送前先跑：

```bash
npm run check                 # typecheck + test
node scripts/verify-ui.mjs    # UI 断言
```

