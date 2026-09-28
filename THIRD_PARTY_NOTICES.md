# 第三方内容与许可

## type-challenges（题目内容）

本项目的题库内容（题面 `README*.md`、模板 `template.ts`、测试用例 `test-cases.ts`
以及断言工具 `utils/index.d.ts`）来自开源项目
[type-challenges/type-challenges](https://github.com/type-challenges/type-challenges)，
以 **MIT** 许可使用。

- 快照 commit：`0b0b0b18bcb7ac42dc22ce26ffb438231d4754b1`（见 `scripts/upstream.json`）
- 该 commit 下的题目数据由 `scripts/fetch-challenges.mjs` 生成到 `src/data/**` 并随仓库分发
- 题目的著作权归各位出题人所有，出题人信息保留在每题数据与页面上（`info.yml` 的 `author` 字段）

以下是上游项目的许可全文：

```
MIT License

Copyright (c) 2020 Anthony Fu <https://github.com/antfu>

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## 运行时依赖

所有依赖均为 MIT 或同等宽松许可，其中体积占比较大的两个：

| 依赖 | 许可 | 用途 |
| --- | --- | --- |
| [monaco-editor](https://github.com/microsoft/monaco-editor) | MIT | 代码编辑器；其内嵌的 TypeScript 语言服务（TypeScript 5.9.3，Apache-2.0）同时承担在线判题 |
| [TypeScript](https://github.com/microsoft/TypeScript) | Apache-2.0 | 类型检查（经由 monaco-editor 内嵌分发） |

完整清单见 `package.json` 与各自的 `node_modules/<pkg>/LICENSE`。
