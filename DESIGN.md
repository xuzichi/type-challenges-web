# type-challenges-web 设计文档

> 一个基于 [type-challenges](https://github.com/type-challenges/type-challenges) 的**纯静态在线练习系统**：
> 浏览器里直接写类型体操，**即时代码判题**，并把进度、题解跳转、跨设备同步都做进去，最终部署在 GitHub Pages 上。
>
> 本文记录的是**已实现并验证过**的设计（不是设想）。验证方式见第 9 节。

---

## 1. 目标与「通过」的定义

上游 type-challenges 本身只是一个题库 + 一个在线判题器（其实没有）：官方站点 `tsch.js.org/<no>/play` 会 302 跳到
TypeScript Playground，把「题面 + 模板 + 测试用例」用 lz-string 压进 URL。真正的类型检查交给 Playground 的默认配置。

所以本系统的核心增量是：**把 tsc 的类型检查搬进页面，当场给出通过/不通过，并且结果可信。**

「通过」的定义因此被明确为一句话：

> 把用户的答案与上游 `test-cases.ts` 放进同一个 TypeScript 程序里编译，
> **两个文件都零 error 级诊断**，就算通过。

这条定义的**可信度**是本项目最关键的工程目标，第 4 节专门说明为什么它成立、边界在哪里。

---

## 2. 上游调研结论（决定了后续所有设计）

| 事实 | 数值/内容 | 对设计的影响 |
| --- | --- | --- |
| 题目目录 | `questions/<00004>-<easy>-<pick>/`，含 `README[.locale].md`、`info.yml`、`template.ts`、`test-cases.ts` | 数据管线的输入格式 |
| 题目数量与难度 | 190 题：warm 1 / easy 13 / medium 104 / hard 55 / extreme 17 | 列表页与进度统计的规模 |
| 题面语言 | 英文 190 份、简体中文 78 份、日文 65、韩文 48、葡语 一部分 | 中文用户需要**回退英文**的策略 |
| 判题方式 | 测试文件用 `Expect<Equal<X, Y>>` 断言；`Expect<T extends true>` 让失败变成**类型错误** | 「零诊断即通过」等价于「所有断言成立」 |
| `@ts-expect-error` | **30 个文件、82 处** | 判题器**必须**上报 TS2578（未使用的指令），否则走捷径的答案会蒙混过关 → 见 4.3 |
| `test-cases.ts` 的 import | 176 处 `import type { Equal, Expect } from '@type-challenges/utils'`，且**只有这一个模块** | 可以安全地把断言工具改成全局注入 |
| `template.ts` | **从无 import/export** | 答案是全局脚本，测试文件能直接引用它声明的类型 |
| 编译选项 | `tsconfig.base.json`: `strict: true`、`lib: ["ESNext"]`、`noUnusedParameters: true` | 需要与浏览器端选项做取舍，见 4.2 |
| 题目级 tsconfig 覆盖 | 只有 2 处；`00925-extreme-assert-array-index` 需要 `noUncheckedIndexedAccess: true` | 必须支持每题覆盖编译选项 |
| 题解 | 不在仓库里，而是 **GitHub issue**（`label:<no> label:answer`，按 reactions 排序） | 「查看题解」只需拼一个 GitHub 搜索 URL，零后端 |
| 上游有没有 Web 判题站 | 没有。`site/` 只是一个静态落地页 | 本系统的价值就在这里 |
| 全量题目数据体积 | `questions/` 共 3.0MB；题面全语言 ≈ 760KB；模板+测试+info ≈ 169KB | 完全可以构建期打包进静态站点 |

另外两个与实现直接相关的技术事实（实测得出，不是推测）：

- `monaco-editor@0.57` 内嵌 **TypeScript 5.9.3**，`tsWorker` 对诊断**零过滤**
  （`getSemanticDiagnostics()` 直通 `languageService`），且 `libFileMap` 自带全部 `lib.*.d.ts`。
- 编译器 API 的 `options.lib` 必须传**内部规范化形式**（`lib.esnext.d.ts`）；传 `'esnext'`
  会得到 `TS6231: Could not resolve the path 'esnext'`。`tsc --lib esnext` 与 tsconfig 会替你规范化，raw API 不会。

---

## 3. 总体架构

```
            构建期（Node，一次性/按需）
  ┌──────────────────────────────────────────────────────────┐
  │ scripts/fetch-challenges.mjs                             │
  │  · 按 scripts/upstream.json 里锁定的 commit 下载 tar.gz   │
  │  · 解析 info.yml / README.<locale>.md / template.ts /    │
  │    test-cases.ts，并按行号算出「用例条目」映射            │
  │  · 产出 src/data/**（提交进仓库）                        │
  └──────────────────────────────────────────────────────────┘
                              │
                              ▼  提交进仓库的静态 JSON（CI 不再联网）
            运行期（浏览器，全静态）
  ┌──────────────────────────────────────────────────────────┐
  │ 列表页   src/data/index.json（轻量索引）                  │
  │ 题目页   import.meta.glob → 只加载这一题的 JSON 分片      │
  ├──────────────────────────────────────────────────────────┤
  │ Monaco 编辑器（answer.ts / tests.ts 两个 ITextModel）     │
  │        │                                                 │
  │        ├─► monaco 自带 TS Worker → 编辑器内实时红波浪线   │
  │        └─► src/judge/judge.ts ── 取两个文件的诊断 ──► 判定 │
  ├──────────────────────────────────────────────────────────┤
  │ localStorage：进度 / 草稿 / 收藏 / 设置                   │
  │ GitHub Gist（用户自带 Token）：跨设备同步                 │
  └──────────────────────────────────────────────────────────┘
```

**没有任何后端。** GitHub Pages 只托管静态文件，因此所有能力都必须在前端闭环 —— 这也是为什么判题必须
在浏览器里做、同步必须用 Gist 而不是自建服务。

---

## 4. 判题设计（核心）

### 4.1 用 Monaco 自带的 TypeScript 语言服务，而不是自己起 tsc

被比较过的三条路线：

| 方案 | 结论 |
| --- | --- |
| **Monaco 自带 TS Worker**（采纳） | 零额外体积（Monaco 无论如何都要加载），同一套 TS 同时提供红波浪线、悬浮类型、自动补全。判题只是「多问一句诊断」。 |
| Monaco + 独立 `typescript` + `@typescript/vfs` Worker | TS 版本可锁、诊断完全可控，但要额外 ~1.5MB gzip，而且要么放弃 Monaco 的实时反馈、要么在页面里维护两份 TS。 |
| CodeMirror 6 + 自建 TS Worker | 体积最省，但悬浮/补全要自己桥接语言服务，工作量最大且容易做得更差。 |

Monaco 路线的**唯一风险**是「诊断是否被过滤」——如果 TS2578 被吞掉，判题就是错的。
这一点被直接读源码验证了：

```js
// monaco-editor/esm/vs/languages/features/typescript/tsWorker.js
async getSemanticDiagnostics(fileName) {
  if (fileNameIsLib(fileName)) return [];
  const diagnostics = this._languageService.getSemanticDiagnostics(fileName);
  return TypeScriptWorker.clearFiles(diagnostics);   // 只是剥离循环引用，没有过滤
}
```

并且我们还显式地把 `diagnosticCodesToIgnore` 清空（Monaco 允许按 code 屏蔽诊断，任何人都可能无意中打开它）。
版本也对齐了：Monaco 0.57 内嵌 TypeScript **5.9.3**，与 `devDependencies` 里锁定的版本一致，
所以 Node 侧的判题语义校验（第 9 节）对浏览器同样成立。

> 顺带一个版本坑：Monaco 0.57 把语言服务 API 从 `monaco.languages.typescript.*` 搬到了顶层
> `monaco.typescript.*`，旧的命名空间只剩一个 `{ deprecated: true }` 类型占位。

### 4.2 编译选项：与上游对齐，但刻意关掉 `noUnusedParameters`

```js
// shared/judge-core.mjs（浏览器与 Node 校验脚本共用同一份定义）
{
  strict: true,
  target: 'esnext', module: 'esnext', moduleResolution: 'node',
  lib: ['lib.esnext.d.ts'],       // 与上游 lib:["ESNext"] 一致：不引入 DOM
  noEmit: true, skipLibCheck: true, esModuleInterop: true,
  noUnusedLocals: false,
  noUnusedParameters: false,      // 相对上游的有意偏离，见下
}
```

- **`lib: ['lib.esnext.d.ts']` 而不是默认的 `esnext.full`**：`full` 会带上 DOM。实测里没有一道题的测试用到
  DOM，但带上 DOM 只会**放宽**判题，理论上存在「多出来的全局类型让错误答案蒙对」的可能。与上游保持一致更安全。
- **`noUnusedParameters` 关闭是刻意的**：上游 `tsconfig.base.json` 开着它，于是最简单的模板
  `type MyPick<T, K> = any` 会报 `TS6205 All type parameters are unused` / `TS6133 'T' is declared but its value is never read`。
  这类报错与「用例是否通过」无关，只会让练习者困惑（尤其在他写到一半时）。
  判题的正确性并不依赖它 —— 依赖的是 `Expect<Equal<…>>` 断言与 4.3 的 TS2578。
- **每题可覆盖**：`00925` 的 `noUncheckedIndexedAccess: true` 会在基础选项之上合并。

### 4.3 TS2578 是本系统正确性的关键

上游测试里大量使用「这里本该报错」的写法：

```ts
type cases = [
  Expect<Equal<Expected1, MyPick<Todo, 'title'>>>,
  Expect<Equal<Expected2, MyPick<Todo, 'title' | 'completed'>>>,
  // @ts-expect-error
  MyPick<Todo, 'title' | 'completed' | 'invalid'>,   // ← 传非法键必须报错
]
```

如果答案过于宽松（例如 `type MyPick<T, K extends PropertyKey> = Pick<T, Extract<K, keyof T>>`），
三个 `Equal` 断言**全部成立**，非法键被静默丢弃 —— 唯一能抓住它的就是「这一行的 `@ts-expect-error` 没被用到」，
也就是 **TS2578**。

因此判题必须**同时取答案文件和测试文件**的诊断，任何一侧有 error 都算失败。
这条结论被固化成了回归测试（`npm run verify:judge` 的第 3 项，见第 9 节）。

### 4.4 两个文件模型与「断言工具全局化」

- `file:///answer.ts` —— 用户答案，可编辑。
- `file:///tests.ts` —— 上游 `test-cases.ts`，只读。
- `file:///type-challenges-utils.d.ts` —— 上游 `utils/index.d.ts` 去掉 `export` 后的**全局**声明，
  通过 `addExtraLib` 注入。

为什么不保留原来的 `import type { Equal, Expect } from '@type-challenges/utils'`：
那需要 Monaco 的 Worker 具备 node 风格的模块解析。**把 `export` 剥掉做成全局脚本声明**
是等价且确定的做法（上游 `utils/index.d.ts` 里只有类型别名，剥掉 `export` 后就是纯全局声明），
既不需要模块解析，也不依赖任何网络或 npm 包。

去 import 时**必须用空行占位**，否则测试文件的行号会整体上移一行，诊断就会指错地方：

```js
export function stripUtilsImport(source) {
  return source.replace(UTILS_IMPORT_RE, (matched) => matched.replace(/[^\n]/g, ''))
}
```

### 4.5 把诊断归因到具体用例

`Expect<Equal<…>>` 的报错是 `TS2344: Type 'false' does not satisfy the constraint 'true'`，
光看这句话不知道**是哪一条用例**挂了。所以构建期会扫描测试文件，把所有
`type <Name> = [ … ]` 顶层元组按顶层逗号切分，算出每条用例的**行号区间**：

```json
{ "block": "cases", "index": 2, "label": "cases #3",
  "startLine": 5, "endLine": 7,
  "code": "MyPick<Todo, 'title' | 'completed' | 'invalid'>" }
```

两个细节：

- 切分必须跟踪 `<>` 泛型深度，否则 `Equal<A, B>` 里的逗号会被误当成用例分隔符（并且要跳过 `=>`，
  它里面的 `>` 不闭合泛型）。同时要跳过字符串/模板字符串/注释。
- 区间**包含条目上方的注释**，因为 TS2578 恰恰报在 `// @ts-expect-error` 那一行。

于是诊断面板能显示「未通过的用例：cases #3」，点击可以跳到对应行。**这是从「能跑」到「好用」的关键一步。**

### 4.6 已知边界（要如实说明）

- **无法检测「用了内置类型」**。题目 00004 要求「不使用 `Pick<T, K>` 自行实现」，但类型层面
  `Pick<T, K>` 与正确实现完全等价，判题器抓不到。上游的 TypeScript Playground 同样抓不到。
  若要做，只能加一层源码文本启发式（例如禁止出现内置名），列为后续可选项。
- **答案里写 import/export 会让判题失效**：那会把答案变成模块，其中的类型不再是全局的，测试文件就「看不见」它。
  前端会检测到并给出明确提示（`detectModuleSyntax`），而不是让用户对着莫名其妙的
  `Cannot find name 'MyPick'` 发呆。
- **`noUnusedLocals` 关掉**意味着「声明了但没用到的类型别名」不会报错。这是有意的，理由同 4.2。
- **判题只在浏览器里跑**，用户改一行 JS 就能绕过所有判题。这不是安全问题 —— 这是自助练习工具，
  没有分数、没有排行榜、没有需要保护的东西。

---

## 5. 数据管线

```bash
npm run data          # 按 scripts/upstream.json 锁定的 ref 重新生成
npm run data -- --ref main            # 临时试跑上游最新
npm run data -- --refresh             # 忽略本地 tar.gz 缓存
```

- **锁定 commit**：`scripts/upstream.json` 里的 `ref` 是一个 commit SHA（MIT 许可）。
  产物提交进仓库，因此 CI 构建**不访问网络**，上游改动不会悄悄改变站点行为；升级上游是一次显式的、可 review 的提交。
- **下载方式**：`https://codeload.github.com/<repo>/tar.gz/<ref>` —— 整个仓库只有 **354KB**，
  一次请求搞定，不需要 GitHub API 的 rate limit（对比：逐文件抓取要 950+ 次请求）。
- **裁掉无关内容**：README 的 `<!--info-header-start-->`/`<!--info-footer-start-->` 区块被剥离
  （标题、难度徽章、跳转链接都由前端自己渲染，才能本地化）；README 里的图片全是 shields.io 绝对地址，
  没有相对链接，不需要改写。
- **产物**：
  | 文件 | 内容 | 体积 |
  | --- | --- | --- |
  | `src/data/index.json` | 题单索引（题号/难度/标签/标题/可用语言） | 列表页同步加载 |
  | `src/data/challenges/<slug>.json` | 单题完整数据（题面 + 模板 + 测试 + 用例行号映射） | 190 个分片，`import.meta.glob` 按需加载 |
  | `src/data/type-challenges-utils.json` | 上游断言工具 `.d.ts` 源码 | 1.2KB |
  | `src/data/upstream.json` | 上游 ref / 许可证 / 生成时间 | 页脚展示 |
  | 合计 | | **约 1.1MB**（190 题，全语言题面） |

---

## 6. 前端架构

```
src/
├── App.tsx                 路由（history + 404.html 兜底，可用 VITE_ROUTER_MODE=hash 切换）
├── main.tsx                入口
├── styles.css              Tailwind v4 + 主题变量 + 题面排版 + 难度配色
├── judge/                  ★ 判题层（唯一与 Monaco 强耦合的地方）
│   ├── types.ts            Challenge / JudgeDiagnostic / JudgeReport
│   ├── options.ts          字符串编译选项 → Monaco 枚举
│   └── judge.ts            模型准备 + 取诊断 + 归一化 + 用例归因
├── components/
│   ├── editor/             monaco-setup.ts（本地 Worker 装配）、TypeChallengeEditor.tsx
│   ├── challenge/          ChallengeCard / FilterBar / DiagnosticsPanel
│   ├── common/             Markdown / DifficultyBadge / ErrorBoundary
│   ├── layout/Layout.tsx   顶栏 + 进度条 + 主题切换
│   └── ui/                 Button / Badge / Card / ProgressBar / Switch
├── pages/                  Home / Challenge / Progress / Settings
├── store/                  settings / progress / sync（zustand + persist）
├── lib/                    data / urls / markdown / gist / sync / syncClient / token / cn
└── i18n/                   messages.ts（中英全文案）/ index.ts
shared/judge-core.mjs       ★ 浏览器与 Node 校验脚本共用的判题核心（纯 ESM + JSDoc）
scripts/                    fetch-challenges / verify-judge / smoke-browser / postbuild
```

几个关键取舍：

- **`shared/judge-core.mjs` 是纯 ESM + JSDoc，不加类型注解**。它同时被 Vite 打包进浏览器、
  被 Node 脚本直接 import。用 `.mjs` 而不是 `.ts`，是为了避免「Node 需要带扩展名、TS 需要
  `allowImportingTsExtensions`」的来回折腾；`tsconfig` 打开 `allowJs` 后，JS 的推导类型照常参与检查。
  （测试用例切分、源码变换这些逻辑只写一份，`npm run verify:judge` 校验的就是浏览器里跑的那份代码。）
- **Monaco 不进主包**。`ChallengePage` 与编辑器组件都是 `React.lazy`，
  `monaco-setup.ts` 只在编辑器模块里 import，因此列表页/进度页/设置页完全不加载 Monaco。
- **编辑器自己管模型生命周期**。`answer.ts` / `tests.ts` 是全局模型，
  题目切换时用 `key={slug}` 强制重挂载并在卸载时 `dispose()`，避免上一题的代码残留。
- **编译选项只应用一次**。`setCompilerOptions` 会通知 Worker 重建程序，所以用一个 key（题目 + tsconfig）
  去重，避免每次渲染都打扰 Worker。
- **`ErrorBoundary` 必须要有**。静态站点没有服务端日志，渲染期抛错 React 会卸载整棵树、
  用户只看到白屏。现在会把错误信息渲染出来，并提供「清空本地数据并刷新」的出口
  （开发期就是这么抓出「`locales` 字段漏生成」这个 bug 的）。

### 状态管理

| Store | 持久化 key | 内容 |
| --- | --- | --- |
| `settings` | `tc:settings:v1` | 界面语言、题面语言、主题、字号、缩略图、自动换行、自动判题 |
| `progress` | `tc:progress:v1` | `status` / `drafts` / `draftUpdatedAt` / `passedAt` / `favorites` / `lastVisited` / `updatedAt` |
| `sync` | `tc:sync:v1` | `gistId` / `lastSyncAt` / `autoPush` |

草稿按 **idle 650ms 去抖**写入，并在页面卸载时兜底补写一次；自动判题复用同一个去抖计时器，
不额外增加 Worker 往返。

GitHub Token **不在 store 里**，单独放在 `src/lib/token.ts`：一个可审计的小模块，
支持「记住」（localStorage）或「仅本次会话」（sessionStorage），并且可以一键清除。

### 国际化

界面语言只有中/英两份完整文案（`src/i18n/messages.ts`，缺失键回退英文再回退键名）。
**题面语言是独立的设置**（可跟随界面，也可指定日/韩/葡），因为上游中文题面只有 78/190，
需要一个明确的回退策略：找不到指定语言就用英文，并在界面上说明「该题暂无中文题面」。

---

## 7. 功能设计

### 7.1 练习主循环

进入题目 → 载入草稿或模板 → 编辑（Monaco 实时给红波浪线）→ 自动判题（去抖）或点「运行检测」→
诊断面板显示失败用例 → 通过则标记 `passed` 并（可选）自动上传 Gist。

### 7.2 进度与草稿

- 状态机只有三档：`todo → attempted → passed`，**只升不降**。改坏已通过的答案不会退回「未通过」。
- localStorage 里存的就是 4.x 的合并单元（见 7.4），所以「导出/导入 JSON」几乎零成本。
- 进度页给出总进度、按难度分布、最近 30 天的通过热力条、最近练习、收藏。

### 7.3 题解与分享

全部是拼 URL，不需要任何后端：

- **查看题解** → `github.com/type-challenges/type-challenges/issues?q=label:<no> label:answer+sort:reactions-+1-desc`（上游约定）。
- **在 Playground 打开** → 前端复刻上游 `formatToCode`（题面注释块 + 答案 + 测试用例 + 页脚），
  用 lz-string 压进 `typescriptlang.org/play#code/…`。比上游多传了 `strict=true`，
  让 Playground 的报错与本站在线判题一致（上游短链不传 strict，比本地开发更宽松）。
- **分享解答 / 复制答案** → 上游 issue 模板 / 剪贴板。

### 7.4 免登录云同步（GitHub Gist）

无后端同步最容易出事的就是「谁覆盖谁」，所以合并规则被写成**单调且可交换**的纯函数
（`shared` 之外的 `src/lib/sync.ts`，`merge(a, b)` 与 `merge(b, a)` 等价）：

| 字段 | 合并规则 |
| --- | --- |
| `status` | 取等级更高者（`passed` > `attempted` > `todo`）—— 拉取永远不会抹掉做过的题 |
| `drafts` | 比较 `draftUpdatedAt`，取更新的那份 |
| `passedAt` | 取**最早**的一次（首次通过时间） |
| `favorites` | 并集 |
| `lastVisited` | 取更近的一次 |

因此「拉取」也是「合并」，用户不需要理解冲突，重复同步也不会丢数据。
Token 由用户自备（建议 Fine-grained 且只勾 `Gists` 权限），只发给 `api.github.com`。

---

## 8. 部署（GitHub Pages）

`.github/workflows/deploy.yml`：

```
push main → checkout → configure-pages（拿 base_path）→ setup-node 22 + npm ci
          → npm run typecheck → npm run verify:judge → npm run build → upload-pages-artifact
          → deploy-pages
```

- **base 路径**三级回退（`vite.config.ts`）：
  `VITE_BASE`（CI 由 `configure-pages` 的 `base_path` 提供）→ `GITHUB_REPOSITORY`（项目页 `/<repo>/`，
  用户页 `/`）→ `/`（本地开发）。仓库改名不需要改代码。
- **SPA 深链**：`scripts/postbuild.mjs` 把 `dist/index.html` 复制成 `dist/404.html`。
  Pages 对未知路径返回它，SPA 在同一 URL 下接管渲染 —— 这是 Pages 上用 history 路由的标准做法。
  **一个必须知道的副作用**：这些深链的 HTTP 状态码就是 404（页面内容却是对的）；
  实测中 5 次深链导航对应 5 个 404 文档请求，静态资源无任何失败。
  如果介意（例如有可用性监控、或希望爬虫/分享卡片拿到 200），
  把构建环境变量 `VITE_ROUTER_MODE=hash` 设为 `hash` 即可无损切到 hash 路由（代价是 URL 里多一个 `#`）。
- **`.nojekyll`**：避免 Pages 的 Jekyll 处理弄丢下划线开头的文件。
- **判题语义回归进 CI**：`npm run verify:judge` 是纯离线的 Node 脚本（用仓库里已固化的数据），
  所以它能作为构建前置门禁 —— 判题错了，站点就不会被发布。

### 体积与加载（实测数据）

用无头 Chrome 打开构建产物、统计真实请求得到（`node .measure.mjs` 那类脚本，数据见下）：

| 资源 | 原始 | gzip | 何时加载 |
| --- | --- | --- | --- |
| `index-*.js`（应用壳） | 327KB | 98KB | 首次进入（任意页面） |
| `index-*.css` | 28KB | 5KB | 同上 |
| `HomePage-*.js` | 7KB | 2KB | 题单页 |
| `editor.api-*.js`（Monaco 核心 API） | 2.7MB | 681KB | 首次进入题目页 |
| 编辑器功能包（被命名为 `toggleHighContrast-*.js`） | 1.2MB | 291KB | 首次进入题目页 |
| `editor-Csy6Iug3.css` + 上述 chunk 的 CSS | 182KB | 26KB | 首次进入题目页 |
| `editor.worker-*.js` | 297KB | 90KB | 首次进入题目页 |
| `codicon-*.ttf` | 150KB | 73KB | 首次进入题目页 |
| `ChallengePage-*.js`（含判题层） | 190KB | 53KB | 首次进入题目页 |
| `ts.worker-*.js`（TypeScript 5.9.3 + 全部 lib.d.ts） | 6.8MB | **1456KB** | 首次判题 |
| 单个题目 JSON 分片 | 3–18KB | 1–4KB | 进入该题 |
| 各语言 tokenizer（abap/julia/scala/…） | — | — | **实测 0 个请求**，Monaco 按需动态 import |

**结论：题单页首屏 gzip ≈ 105KB；首次进入题目页 gzip ≈ 2.8MB（13 个唯一资源），之后全部命中缓存。**
这 2.8MB 里有 1.75MB 是「把完整 TypeScript 编译器放进浏览器」的固有成本（`ts.worker` + `editor.api`）。
`dist/` 目录共约 16MB，但其中 css/html/json worker、其余语言 tokenizer 等都不会被请求。

---

## 9. 质量保障：三层验证

判题「看起来对」和「确实对」差别很大，所以做了三层、都能一条命令复现的验证：

### 9.1 判题语义校验（Node，离线）—— `npm run verify:judge`

用**与 Monaco 相同的 TypeScript 5.9.3** 和一个「照抄 Monaco tsWorker」的 `LanguageServiceHost`，
在 Node 里跑判题算法本身。**20 项断言，当前 20/20 通过**：

1. **全部 190 道题的初始模板都必须判失败**（判题不能太松）；
2. 7 道题的标准答案必须判通过（判题不能太严、行号不能错位）；
3. **「断言全过但绕过 `@ts-expect-error`」的答案必须失败，且失败原因包含 TS2578**（4.3 的关键结论）；
4. 编译选项生效：`lib` 与上游一致、`strict` 开、`noUnusedParameters` 关、`noEmit` 开、
   **DOM 全局类型不可用**、ESNext 内置类型可用、题目级 `noUncheckedIndexedAccess` 覆盖生效；
5. 答案里的 import/export 能被识别；
6. 去掉 utils import 后行号与原始 `test-cases.ts` 对齐。

### 9.2 浏览器端到端冒烟测试 —— `npm run test:browser`

自己拉起 `vite preview` 托管 `dist/`，用本机 Chrome/Edge（`playwright-core` + `channel`，
不下载浏览器）跑真实链路。**13 项断言，当前 13/13 通过**：
深链打开 → Monaco/TS Worker 启动 → 错误答案判失败且归因到用例 → 正确答案判通过且状态变「已通过」
→ **走捷径答案被 TS2578 拦下** → 草稿刷新后仍在 → 题单页渲染 → **切到另一题时编辑器没有上一题残留**
→ 进度页/设置页渲染 → 全程无 JS 报错。

它的价值在于 9.1 覆盖不到的部分：Worker 能不能在真实浏览器里起来、Monaco 的渲染与懒加载分片路径对不对、
模型生命周期对不对、localStorage 的持久化有没有生效。

部署配置也在**线上实测过**：`SMOKE_BASE=https://xuzichi.github.io/type-challenges-web npm run test:browser`
就是拿同一套 14 项断言跑已部署的站点（`scripts/smoke-browser.mjs` 检测到 `SMOKE_BASE` 就不再拉起本地 preview）。
它同时验证了 CI 的 base 路径改写（资源前缀 `/type-challenges-web/`）、深链兜底与判题链路 ——
线上 14/14 通过，其中 5 个 404 全部是预期内的深链文档请求。

### 9.3 类型检查 —— `npm run typecheck`

`tsc --noEmit` 覆盖 `src/`、`shared/`、`vite.config.ts`（strict + noUnusedLocals/Parameters）。

三层合起来是 `npm test`（typecheck + 判题语义），CI 在构建前执行 9.1 与 9.3。

---

## 10. 已知限制与后续路线

**刻意不做**

- 服务端判题 / 账号体系 / 排行榜：与「部署在 GitHub Pages」冲突，且练习题不需要。
- SSR / 预渲染：190 个题目页的 SEO 对本工具价值有限，收益不抵框架成本；
  如果确实需要，可以把页面壳与题面改成构建期预渲染（Vite 之外换 SSG）。

**已知限制**

- 无法检测「题目要求不准用内置类型」这类源码级约束（见 4.6）。
- 上游中文题面只有 78/190；缺失部分靠英文回退，长期需要社区翻译。
- `ts.worker` 1.46MB gzip 是首次判题的固定成本。

**后续可做**

1. **给 Monaco 自建精简入口**：目前用 `monaco-editor` 顶层入口（`esm/vs/index.js`），它会注册全部 80+ 语言的
   tokenizer 并引入整套编辑器功能包。实测语言 tokenizer 都是懒加载（进入题目页 0 个请求），
   所以真正可省的是那个 1.2MB 原始 / 291KB gzip 的功能包。改成
   `monaco-editor/editor/editor.api` + 按需 import 编辑器 contrib + 只注册 typescript language feature，
   预计能把题目页再降 200–300KB gzip —— 代价是要手工维护 ~30 个 contrib 导入清单，
   漏一个就会静默丢功能（比如补全、查找、括号匹配）。因此 v1 刻意不做，列为可选项。
2. **多文件答案**：目前答案必须是单文件全局脚本（与上游一致）。若允许 import，需要引入模块解析。
3. **题解内联**：目前「查看题解」是跳 GitHub。可用 GitHub API 拉取高赞 issue 评论渲染进页面
   （需要处理未登录 rate limit）。
4. **离线 PWA**：数据与 Worker 都可缓存，加 Service Worker 即可完全离线练习。
5. **PR 模式**：允许用户把自己写的题（`info.yml` + README + 测试用例）导出成上游格式，
   一键提 PR 到 type-challenges。

---

## 11. 本地开发

```bash
npm install
npm run dev            # 开发服务器（base=/）
npm run data           # 需要时重新生成题目数据（读取 scripts/upstream.json 的 ref）
npm run typecheck      # 类型检查
npm run verify:judge   # 判题语义回归（离线，快）
npm run build          # 构建 + 生成 404.html
npm run test:browser   # 构建产物的真实浏览器冒烟测试（需本机 Chrome/Edge）
npm test               # typecheck + verify:judge
```

**升级上游题库**：改 `scripts/upstream.json` 的 `ref` → `npm run data` → 跑 `npm test` 与
`npm run test:browser` → review `src/data/**` 的 diff（能直接看到新增/改动了哪些题）→ 提交。
