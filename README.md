# 文渊 Wenyuan

中国古典文学阅读站 —— 唐诗、宋词、古文、典籍，原文与白话对照，点词出注。

**当前阶段**：视觉原型。设计与技术决策见 [docs/DECISIONS.md](docs/DECISIONS.md)。

## 原型

| 页面 | 说明 |
|---|---|
| `prototypes/index.html` | 原型索引 |
| `prototypes/home.html` | 首页：配图横幅、卷首精选、时空长河、心境选读 |
| `prototypes/work.html` | 阅读页：三栏，原文／对照切换，点词出注 |

本地预览：

```bash
cd prototypes && python -m http.server 5180
```

## 命令

```bash
npm install
npm run media:compress   # media/ 下的 png/jpg 压成 webp
node scripts/verify-ui.mjs   # UI 断言（需 http://127.0.0.1:5180 已启动）
```

## 部署

push 到 `main` 后由 `.github/workflows/pages.yml` 自动部署到 GitHub Pages。
