# type-challenges-web

> 基于 [type-challenges](https://github.com/type-challenges/type-challenges) 的**纯静态在线练习系统**：
> 在浏览器里直接写类型体操，**即时代码判题**，进度与草稿本地保存、可选同步到私有 Gist，一键部署到 GitHub Pages。
>
> 详细设计（判题原理、数据管线、部署细节、验证方式、已知限制）见 **[DESIGN.md](./DESIGN.md)**。

## 特点

- **真判题，不是跳转**：把用户答案与上游 `test-cases.ts` 放进同一个 TypeScript 程序编译，零 error 即通过。
  用的是 Monaco 内置的 TypeScript 5.9.3 语言服务，因此编辑器里的红波浪线、悬浮类型提示、自动补全都免费。
- **不会误判**：上游测试里有 82 处 `// @ts-expect-error`，用来表达「这里本该报错」。
  判题器把 **TS2578（未使用的 @ts-expect-error）** 也算作失败，所以「类型断言全过但把非法输入悄悄吞掉」
  的走捷径答案会被抓住 —— 这条结论有回归测试兜底。
- **诊断归因到用例**：构建期就为每条测试用例算好行号区间，失败时直接告诉你「`cases #3` 没过」，点击可跳转。
- **190 道题全量离线可用**：题目数据按 commit 锁定、构建期固化进仓库，部署后 CI 不依赖上游。
- **零后端**：进度/草稿/收藏存 localStorage；跨设备同步用你自己的 GitHub Token 写私有 Gist。
- **中文优先**：界面中英双语；题面优先中文（78/190 有中文），缺失时明确回退英文并给出提示。

## 快速开始

```bash
npm install
npm run dev          # http://localhost:5173
```

## 常用命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 本地开发 |
| `npm run build` | 构建到 `dist/`（并生成 GitHub Pages 需要的 `404.html`） |
| `npm run preview` | 本地预览构建产物 |
| `npm test` | 类型检查 + 判题语义回归（快、离线） |
| `npm run test:browser` | 构建产物的真实浏览器冒烟测试（需先 `npm run build`，用本机 Chrome/Edge） |
| `SMOKE_BASE=<url> npm run test:browser` | 拿同一套断言跑**已部署的站点**（不拉起本地 preview） |
| `npm run data` | 拉取/更新上游题库（读取 `scripts/upstream.json` 里锁定的 commit） |
| `npm run verify:judge` | 单独跑判题语义回归（190 题模板必须全判失败等 20 项断言） |

## 部署到 GitHub Pages

1. 在 GitHub 上新建一个仓库，把本项目推上去（默认分支 `main`）。
2. 仓库 **Settings → Pages → Build and deployment → Source** 选 **GitHub Actions**。
3. 推送即自动部署（`.github/workflows/deploy.yml`）。CI 会先跑类型检查与判题语义回归，
   通过后才构建并发布。
4. 部署完成后访问 `https://<用户名>.github.io/<仓库名>/`。

`base` 路径会自动适配：CI 用 `actions/configure-pages` 提供的 `base_path`
（项目页是 `/<仓库名>`，用户页 `<用户名>.github.io` 是 `/`），因此**改仓库名不需要动代码**。

深链（例如 `https://…/<仓库名>/challenge/00004-easy-pick`）依靠构建时生成的 `404.html` 兜底。
**注意**：这些深链的 HTTP 状态码就是 `404`（页面内容却是对的）—— 这是 GitHub Pages 静态托管的固有行为。
如果介意（可用性监控、爬虫或分享卡片拿到 404），把构建环境变量 `VITE_ROUTER_MODE` 设为 `hash`，
即可无损切到 hash 路由（URL 形如 `…/#/challenge/00004-easy-pick`）。

部署完可以用同一套端到端断言直接验证线上：

```bash
SMOKE_BASE=https://<用户名>.github.io/<仓库名> npm run test:browser
```

## 目录结构

```
src/judge/        判题层：模型准备、取诊断、归因到用例
src/components/   编辑器（Monaco）、题面、筛选、诊断面板、UI 原子件
src/pages/        题单 / 题目 / 进度 / 设置
src/store/        zustand + persist：设置、进度、同步元信息
src/lib/          数据加载、URL 构造、Markdown、Gist 同步、Token 保管
src/i18n/         中英文案
src/data/         构建期生成的题库数据（提交进仓库）
shared/           浏览器与 Node 校验脚本共用的判题核心
scripts/          数据生成、判题语义校验、浏览器冒烟测试、构建后处理
```

## 验证

判题「看起来对」和「确实对」差别很大，所以这里有三层可复现的验证：

1. **判题语义回归**（`npm run verify:judge`，离线）：用与 Monaco 相同的 TypeScript 5.9.3 和一个
   照抄 Monaco `tsWorker` 的语言服务宿主，在 Node 里断言 —— 全部 190 道题的初始模板必须判失败、
   标准答案必须判通过、绕过 `@ts-expect-error` 的答案必须被 TS2578 拦下、编译选项与行号映射正确。
2. **浏览器端到端**（`npm run test:browser`）：真实 Chrome 里跑通「深链打开 → 判题 → 通过 →
   走捷径被拦下 → 草稿刷新仍在 → 无 JS 报错」。
3. **类型检查**（`npm run typecheck`）：`tsc --noEmit`，strict。

## 题库来源与许可

题库来自 [type-challenges/type-challenges](https://github.com/type-challenges/type-challenges)，
以 **MIT** 许可使用。`src/data/**` 是该仓库某个**锁定 commit** 的快照，
提交号记在 `scripts/upstream.json` 与生成的 `src/data/upstream.json` 里，页脚也会显示。
许可全文与归属说明见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

升级题库：改 `scripts/upstream.json` 的 `ref` → `npm run data` → 跑 `npm test` 与
`npm run test:browser` → review `src/data/**` 的 diff → 提交。
