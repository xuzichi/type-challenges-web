/**
 * 判题核心：被浏览器端（`src/judge/*`）和 Node 侧校验脚本（`scripts/verify-judge.mjs`）共用，
 * 因此保持为纯 ESM + JSDoc 类型，不依赖任何运行时（不 import typescript / monaco）。
 *
 * 与上游 type-challenges 的约定保持一致：
 *  - `test-cases.ts` 通过 `import type { ... } from '@type-challenges/utils'` 引入断言工具；
 *  - `template.ts` 从不含 import/export，所以答案是"全局脚本"，测试文件可以直接引用它声明的类型。
 *
 * 浏览器端为了免去模块解析，会把断言工具改成全局声明；
 * 但去掉 import 时必须用空行占位，否则诊断行号会与原始文件错位。
 */

/**
 * @typedef {object} ChallengeTsConfig
 * 每题在 info.yml 里可选覆盖的编译选项（上游只用到 noUncheckedIndexedAccess）。
 *
 * @typedef {'answer' | 'tests'} JudgeSource
 * @typedef {object} CaseEntry
 * @property {string} block
 * @property {number} index
 * @property {string} label
 * @property {number} startLine 1-based，含前导注释（`// @ts-expect-error` 就报在这一行）
 * @property {number} endLine 1-based，闭区间
 * @property {string} code
 */

/**
 * 基础编译选项，刻意对齐上游 `tsconfig.base.json`，但关掉 `noUnusedParameters`：
 * 上游开着它，会让 `type MyPick<T, K> = any` 这类中间态答案报 TS6205/TS6133，
 * 与"测试用例是否通过"无关，只会干扰练习者。判题的正确性完全由
 * `Expect<Equal<...>>` 断言承担。
 *
 * 注意 `lib` 用的是 TypeScript 内部的规范化写法 `lib.esnext.d.ts`：
 * 编译器 API 的 `options.lib` 是按文件名解析的（传 `'esnext'` 会报 TS6231），
 * 只有 `tsc --lib esnext` / tsconfig 才会帮你把短名规范化。
 * 用 `esnext` 而不是 `esnext.full` 是为了与上游一致 —— 不引入 DOM 全局类型，
 * 避免某些题目因多出 DOM 类型而被"蒙对"。
 *
 * `target` / `module` / `moduleResolution` 保持字符串：
 * 浏览器端由 `src/judge/options.ts` 映射成 monaco 的枚举，
 * Node 端由 `ts.convertCompilerOptionsFromJson` 转换，两边共享同一份定义。
 */
export const BASE_COMPILER_OPTIONS = Object.freeze({
  strict: true,
  target: 'esnext',
  module: 'esnext',
  moduleResolution: 'node',
  lib: ['lib.esnext.d.ts'],
  noEmit: true,
  skipLibCheck: true,
  esModuleInterop: true,
  noUnusedLocals: false,
  noUnusedParameters: false,
})

/** 上游断言工具的 import 语句。 */
export const UTILS_IMPORT_RE =
  /^[ \t]*import\s+(?:type\s+)?\{[^}]*\}\s*from\s*['"]@type-challenges\/utils['"];?[ \t]*\r?\n?/m

/** @param {string} source */
export function hasUtilsImport(source) {
  return UTILS_IMPORT_RE.test(source)
}

/** 删除断言工具的 import，但用空行占位以保持行号稳定。@param {string} source */
export function stripUtilsImport(source) {
  return source.replace(UTILS_IMPORT_RE, (matched) => matched.replace(/[^\n]/g, ''))
}

/** 把 `export type X = ...` 改写成全局脚本声明。@param {string} source */
export function toGlobalUtilsDts(source) {
  return source.replace(/^[ \t]*export\s+/gm, '')
}

/**
 * 组装交给 TypeScript 的源码。
 * @param {{ tests: string, answer: string }} challenge
 * @param {{ utilsSource: string }} upstream
 */
export function buildJudgeSources(challenge, upstream) {
  return {
    answerSource: challenge.answer,
    // 无论上游是否写了 import，都统一替换为等价长度的空行
    testsSource: stripUtilsImport(challenge.tests),
    utilsSource: toGlobalUtilsDts(upstream.utilsSource),
  }
}

/** 合并基础选项与题目覆盖项。@param {ChallengeTsConfig | undefined} override */
export function resolveCompilerOptions(override) {
  return { ...BASE_COMPILER_OPTIONS, ...(override ?? {}) }
}

/**
 * 检测答案里是否出现了 import/export —— 那会让答案变成模块，
 * 其中的类型就不再是全局的，测试文件会"看不见"它们，需要给出明确提示。
 * @param {string} answer
 */
export function detectModuleSyntax(answer) {
  return /^[ \t]*(?:import|export)\b/m.test(answer)
}

/**
 * 扫描源码，找出所有形如 `type Name = [ ... ]` 的顶层元组声明，
 * 并把其中以逗号分隔的"用例条目"切分出来，用于把诊断映射回具体用例。
 *
 * 条目范围包含它前方的注释（例如 `// @ts-expect-error`），
 * 因为"未使用的 @ts-expect-error 指令"(TS2578) 就报在注释那一行。
 *
 * @param {string} source
 * @returns {CaseEntry[]}
 */
export function extractCaseEntries(source) {
  const lineStarts = computeLineStarts(source)
  /** @param {number} offset */
  const toLine = (offset) => {
    let lo = 0
    let hi = lineStarts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (lineStarts[mid] <= offset) lo = mid
      else hi = mid - 1
    }
    return lo + 1
  }

  /** @type {CaseEntry[]} */
  const entries = []
  const blockRe = /^[ \t]*(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*=\s*\[/gm
  let match
  while ((match = blockRe.exec(source)) !== null) {
    const blockName = match[1]
    const open = source.lastIndexOf('[', match.index + match[0].length)
    if (open < 0) continue
    const close = scanMatching(source, open, '[', ']')
    if (close < 0) continue

    const parts = splitTopLevel(source, open + 1, close)
    parts.forEach((part, index) => {
      const codeStart = skipLeadingTrivia(source, part.start, part.end)
      entries.push({
        block: blockName,
        index,
        label: parts.length > 1 ? `${blockName} #${index + 1}` : blockName,
        startLine: toLine(part.start),
        endLine: toLine(part.end),
        code: source.slice(codeStart, part.end).trim(),
      })
    })

    blockRe.lastIndex = close + 1
  }
  return entries
}

/**
 * 给定行号，返回它所属的用例条目；落在用例之外时返回 undefined。
 * @param {CaseEntry[]} entries
 * @param {number} line 1-based
 */
export function findEntryForLine(entries, line) {
  /** @type {CaseEntry | undefined} */
  let hit
  for (const entry of entries) {
    if (line >= entry.startLine && line <= entry.endLine) hit = entry
  }
  return hit
}

/**
 * 把字符偏移转成 1-based 的行/列。
 * @param {string} source
 * @param {number} offset
 */
export function offsetToPosition(source, offset) {
  let line = 1
  let lineStart = 0
  const limit = Math.max(0, Math.min(offset, source.length))
  for (let i = 0; i < limit; i++) {
    if (source.charCodeAt(i) === 10) {
      line++
      lineStart = i + 1
    }
  }
  return { line, column: limit - lineStart + 1 }
}

/** @param {string} source */
function computeLineStarts(source) {
  const starts = [0]
  for (let i = 0; i < source.length; i++) {
    if (source.charCodeAt(i) === 10) starts.push(i + 1)
  }
  return starts
}

/**
 * @param {string} source
 * @param {number} start
 * @param {number} end
 */
function skipLeadingTrivia(source, start, end) {
  let i = start
  while (i < end) {
    const ch = source[i]
    if (ch === '/' && source[i + 1] === '/') {
      while (i < end && source[i] !== '\n') i++
    } else if (ch === '/' && source[i + 1] === '*') {
      i += 2
      while (i < end && !(source[i] === '*' && source[i + 1] === '/')) i++
      i += 2
    } else if (/\s/.test(ch)) {
      i++
    } else {
      break
    }
  }
  return Math.min(i, end)
}

/**
 * 从 open 位置的 openChar 出发，跳过字符串与注释，返回配对的 closeChar 下标。
 * @param {string} source
 * @param {number} open
 * @param {string} openChar
 * @param {string} closeChar
 */
function scanMatching(source, open, openChar, closeChar) {
  let depth = 0
  for (let i = open; i < source.length; i++) {
    const step = skipNonCode(source, i)
    if (step > i) {
      i = step - 1
      continue
    }
    const ch = source[i]
    if (ch === openChar) depth++
    else if (ch === closeChar) {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

/**
 * 按顶层逗号切分 [start, end)，同时跟踪 `<>` 泛型参数列表 ——
 * `Equal<A, B>` 里的逗号不是条目分隔符。
 * @param {string} source
 * @param {number} start
 * @param {number} end
 */
function splitTopLevel(source, start, end) {
  /** @type {{start: number, end: number}[]} */
  const parts = []
  let depth = 0
  let angle = 0
  let partStart = start
  let i = start
  while (i < end) {
    const step = skipNonCode(source, i)
    if (step > i) {
      i = step
      continue
    }
    const ch = source[i]
    if (ch === '=' && source[i + 1] === '>') {
      // 箭头函数类型 `(x: T) => U`，这里的 `>` 不闭合泛型
      i += 2
      continue
    }
    if (ch === '[' || ch === '{' || ch === '(') depth++
    else if (ch === ']' || ch === '}' || ch === ')') depth--
    else if (ch === '<') angle++
    else if (ch === '>') angle = Math.max(0, angle - 1)
    else if (ch === ',' && depth === 0 && angle === 0) {
      parts.push({ start: partStart, end: i })
      partStart = i + 1
    }
    i++
  }
  if (partStart < end) parts.push({ start: partStart, end })

  // 舍去纯空白/纯注释的空条目（例如尾随逗号）
  return parts.filter((part) => skipLeadingTrivia(source, part.start, part.end) < part.end)
}

/**
 * 如果 source[i] 处开始的是字符串/模板字符串/注释，返回其结束后的下标；否则返回 i。
 * @param {string} source
 * @param {number} i
 */
function skipNonCode(source, i) {
  const ch = source[i]
  if (ch === '/' && source[i + 1] === '/') {
    let j = i + 2
    while (j < source.length && source[j] !== '\n') j++
    return j
  }
  if (ch === '/' && source[i + 1] === '*') {
    let j = i + 2
    while (j < source.length && !(source[j] === '*' && source[j + 1] === '/')) j++
    return Math.min(j + 2, source.length)
  }
  if (ch === '"' || ch === "'" || ch === '`') {
    let j = i + 1
    while (j < source.length) {
      if (source[j] === '\\') {
        j += 2
        continue
      }
      if (source[j] === ch) return j + 1
      j++
    }
    return source.length
  }
  return i
}
