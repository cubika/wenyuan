# 文渊 Wenyuan

中国古典文学阅读站 —— 唐诗、宋词、古文、典籍，原文与白话对照，点词出注。

线上：<https://cubika.github.io/wenyuan/>
需求与设计决策：[docs/DECISIONS.md](docs/DECISIONS.md)

## 结构

```
data/raw/            原文投入口，丢一个 txt 进来即可
data/works/          流水线产物（结构化 JSON），进版本库
packages/schema/     Zod 契约 + 跨字段校验
packages/pipeline/   导入流水线（切分 → 识别 → 译注 → 导读 → 出图）
prototypes/          静态站点，运行时读 data/*.json
```

## 导入一篇作品

```bash
npm install
npm run import -- data/raw/chunjiang-huayueye.txt   # 生成 data/works/<id>.json
npm run media  -- data/works/<id>.json              # 依 AI 写的 prompt 出图并压成 webp
node scripts/build-data.mjs                          # 同步进站点并生成索引
```

`import` 会**按 hash 跳过未改动的章节**，改几句重跑不会全量烧 token；`--force` 强制全量。

## 开发

```bash
npm run typecheck                       # 全量 tsc --noEmit
npm run test                            # vitest（schema 单测）
npm run check                           # 上面两个

cd prototypes && python -m http.server 5180
node scripts/verify-ui.mjs              # 20 项 UI 断言（需 dev server）
node scripts/verify-ui.mjs https://cubika.github.io/wenyuan   # 也可跑线上
```

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
- **注释的 `term` 必须是原句连续子串**。前端靠子串定位挂高亮，锚不上的注释等于废注，schema 层直接拒绝。
- **名句必须逐字出自原文**（忽略标点），防止模型凭印象编造。
- **出图 prompt 由读过原文的模型产出**，不套模板 —— 这是配图质量的关键。风格锚按体裁固定，构图强制一侧留白给压字。
- **图片必须串行生成**，且只提交 webp。GitHub Pages 不解析 Git LFS 指针，体积得靠压缩控住。

## Git

不直接提交 `main`，走 `feature/<desc>` 分支。
