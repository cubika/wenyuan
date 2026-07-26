# AGENTS.md

给在这个仓库里干活的 AI 助手看的操作约定。项目本身的需求与设计决策见
[docs/DECISIONS.md](docs/DECISIONS.md)，工程约定见 [README.md](README.md)。

## 图片一律用 subagent 读，不要读进主上下文

**这条最容易犯，也最费上下文。**

截图、配图、任何 `.png` / `.webp` 文件，**禁止**直接用 `view` 工具打开 —— 一张
1366×768 的截图会吃掉大量上下文，而绝大多数时候只需要一句话的结论。

正确做法：派一个 subagent 去看，让它用文字回报。

```
task(agent_type="explore", prompt="""
用 view 工具打开 <绝对路径>，回答：
1. 版式有没有明显问题（错位、溢出、重叠、留白失衡）
2. <本次改动关注的具体点>
只回文字结论，不要贴图。
""")
```

出图流水线本来就有这条规矩：**生成的图片不读入 AI 对话上下文，只报路径和体积**
（见 DECISIONS 十一）。看截图同理。

## 验证优先用断言，其次才是看图

`node scripts/verify-ui.mjs` 有近百项 UI 断言，能机器判定的事就别用眼睛判定。
改了版式先想「这条能不能写成断言」，写成断言既省上下文，也防以后回归。

真要看效果时才截图，且照上一条派 subagent 看。

## 每轮改动的收尾

推送前必须跑通：

```bash
npm run check                 # typecheck + test
node scripts/verify-ui.mjs    # UI 断言，需要先起 dev server
```

直接提交 `main`，不走 PR。经用户确认后再推。

## 文案要去 AI 味

站内所有 AI 生成的文字（译文、注释、赏析、导读、人物小传、朝代导语）都受
`packages/pipeline/src/stages/voice.ts` 里的 VOICE 约束管。忌「不是 A，而是 B」
「不仅…更…」这类对仗式总结句连用，忌套话，忌句式雷同。改 prompt 时别绕过它。

## 「站内有什么」永远反查

人物页的名下作品、长河页的朝代收录，一律从 `data/works` / `data/people` 反查，
**绝不写进 AI 生成的文本**。写进去了，加一篇作品就得重写一遍。
schema 层有闸门挡着（见 `packages/schema/src/era.ts`），别绕过。
