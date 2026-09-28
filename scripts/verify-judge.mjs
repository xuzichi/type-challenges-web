#!/usr/bin/env node
/**
 * 判题语义回归测试（离线、Node 侧）。
 *
 * 浏览器端的判题完全依赖 monaco 自带的 TypeScript 语言服务，
 * 而 monaco 0.57 内置的正是 TypeScript 5.9.3（与 devDependencies 锁定版本一致）。
 * 因此这里用同一个 TypeScript 版本 + 一个"照抄 monaco tsWorker"的 LanguageServiceHost，
 * 就能在 Node 里验证判题算法本身是否正确：
 *
 *   1. 全部 190 道题的初始模板都必须判为失败（否则判题太松）；
 *   2. 若干题的标准答案必须判为通过（否则判题太严 / 行号错位）；
 *   3. "类型断言全过、但绕过了 `@ts-expect-error`" 的走捷径答案必须被判为失败，
 *      且失败原因正是 TS2578（未使用的 @ts-expect-error 指令）—— 这是本系统最关键的正确性保证；
 *   4. 基础编译选项与每题 tsconfig 覆盖生效（lib 只含 ESNext、noUncheckedIndexedAccess 等）。
 *
 * 用法：npm run verify:judge
 */
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import {
  BASE_COMPILER_OPTIONS,
  buildJudgeSources,
  detectModuleSyntax,
  findEntryForLine,
  offsetToPosition,
  resolveCompilerOptions,
} from '../shared/judge-core.mjs'

const require = createRequire(import.meta.url)
const ts = require('typescript')

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const DATA_DIR = path.join(ROOT, 'src', 'data')
const CHALLENGES_DIR = path.join(DATA_DIR, 'challenges')
const TS_LIB_DIR = path.join(path.dirname(require.resolve('typescript/package.json')), 'lib')

const ANSWER_URI = 'file:///answer.ts'
const TESTS_URI = 'file:///tests.ts'
const UTILS_URI = 'file:///type-challenges-utils.d.ts'

const upstreamUtils = JSON.parse(
  fs.readFileSync(path.join(DATA_DIR, 'type-challenges-utils.json'), 'utf8'),
).source

/** @type {{ total: number, failed: string[] }} */
const results = { total: 0, failed: [] }

function check(name, ok, detail) {
  results.total++
  if (!ok) {
    results.failed.push(name)
    console.log(`✖ ${name}${detail ? `\n    ${detail}` : ''}`)
  }
  return ok
}

function loadChallenge(slug) {
  return JSON.parse(fs.readFileSync(path.join(CHALLENGES_DIR, `${slug}.json`), 'utf8'))
}

function loadAllChallenges() {
  return fs
    .readdirSync(CHALLENGES_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => JSON.parse(fs.readFileSync(path.join(CHALLENGES_DIR, file), 'utf8')))
}

/** 读取虚拟文件：内存优先，其次视为 typescript 自带的 lib。 */
function readVirtual(files, fileName) {
  if (files.has(fileName)) return files.get(fileName)
  const candidate = path.join(TS_LIB_DIR, path.basename(fileName))
  if (fs.existsSync(candidate)) return fs.readFileSync(candidate, 'utf8')
  return undefined
}

/** 与 monaco tsWorker 的 LanguageServiceHost 行为对齐。 */
function createService(files, compilerOptions) {
  const host = {
    getScriptFileNames: () => [...files.keys()],
    getScriptVersion: () => '1',
    getScriptSnapshot: (fileName) => {
      const text = readVirtual(files, fileName)
      return text === undefined ? undefined : ts.ScriptSnapshot.fromString(text)
    },
    getCurrentDirectory: () => '',
    getCompilationSettings: () => compilerOptions,
    getDefaultLibFileName: (options) => ts.getDefaultLibFileName(options),
    fileExists: (fileName) => readVirtual(files, fileName) !== undefined,
    readFile: (fileName) => readVirtual(files, fileName),
  }
  return ts.createLanguageService(host)
}

/**
 * 把共享的字符串型选项转换成 TypeScript 编译器要的数值型选项。
 * `lib` 已经是内部规范化形式（lib.esnext.d.ts），不能走 convertCompilerOptionsFromJson
 * —— 那里会把它当成非法名字报 TS6046。
 */
function toCompilerOptions(override) {
  const { lib, ...rest } = resolveCompilerOptions(override)
  const converted = ts.convertCompilerOptionsFromJson(rest, '')
  if (converted.errors.length) {
    throw new Error(
      `编译选项转换失败: ${converted.errors
        .map((error) => ts.flattenDiagnosticMessageText(error.messageText, ' '))
        .join('; ')}`,
    )
  }
  return { ...converted.options, lib }
}

/**
 * 完整跑一遍判题，返回结构化结果（与浏览器端 `src/judge/judge.ts` 的语义一致）。
 */
function judge(challenge, answer) {
  const sources = buildJudgeSources({ ...challenge, answer }, { utilsSource: upstreamUtils })
  const options = toCompilerOptions(challenge.tsconfig)

  const files = new Map([
    [ANSWER_URI, sources.answerSource],
    [TESTS_URI, sources.testsSource],
    [UTILS_URI, sources.utilsSource],
  ])
  const service = createService(files, options)

  /** @type {import('typescript').Diagnostic[]} */
  const raw = [
    ...service.getSyntacticDiagnostics(ANSWER_URI),
    ...service.getSemanticDiagnostics(ANSWER_URI),
    ...service.getSyntacticDiagnostics(TESTS_URI),
    ...service.getSemanticDiagnostics(TESTS_URI),
    ...service.getCompilerOptionsDiagnostics(),
  ]

  const diagnostics = raw.map((diagnostic) => {
    const source = diagnostic.file?.fileName === ANSWER_URI ? sources.answerSource : sources.testsSource
    const where = diagnostic.file?.fileName === ANSWER_URI ? 'answer' : 'tests'
    const position = offsetToPosition(source, diagnostic.start ?? 0)
    const entry =
      where === 'tests' ? findEntryForLine(challenge.cases, position.line) : undefined
    return {
      where,
      code: diagnostic.code,
      category: diagnostic.category,
      line: position.line,
      column: position.column,
      message: ts.flattenDiagnosticMessageText(diagnostic.messageText, ' '),
      caseLabel: entry?.label,
    }
  })

  const errors = diagnostics.filter((diagnostic) => diagnostic.category === 1)
  /** @type {Record<string, number>} */
  const caseFailures = {}
  for (const error of errors) {
    if (!error.caseLabel) continue
    caseFailures[error.caseLabel] = (caseFailures[error.caseLabel] ?? 0) + 1
  }

  return {
    passed: errors.length === 0,
    errors,
    caseFailures,
    answerHasModuleSyntax: detectModuleSyntax(answer),
    options,
  }
}

function describeErrors(errors, limit = 3) {
  return errors
    .slice(0, limit)
    .map((error) => `${error.where}:${error.line}:${error.column} TS${error.code} ${error.message}`)
    .join('\n    ')
}

// ---------------------------------------------------------------- 1. 初始模板必须全部失败
const challenges = loadAllChallenges()
const templateUnexpectedlyPassing = []
for (const challenge of challenges) {
  const report = judge(challenge, challenge.template)
  if (report.passed) templateUnexpectedlyPassing.push(challenge.slug)
}
check(
  `全部 ${challenges.length} 道题的初始模板都判为失败`,
  templateUnexpectedlyPassing.length === 0,
  templateUnexpectedlyPassing.length
    ? `以下模板竟然通过：${templateUnexpectedlyPassing.join(', ')}`
    : undefined,
)

// ---------------------------------------------------------------- 2. 标准答案必须通过
const solutions = [
  ['00013-warm-hello-world', 'type HelloWorld = string'],
  ['00004-easy-pick', 'type MyPick<T, K extends keyof T> = { [P in K]: T[P] }'],
  ['00007-easy-readonly', 'type MyReadonly<T> = { readonly [K in keyof T]: T[K] }'],
  [
    '00011-easy-tuple-to-object',
    'type TupleToObject<T extends readonly (string | number | symbol)[]> = { [K in T[number]]: K }',
  ],
  [
    '00002-medium-return-type',
    'type MyReturnType<T> = T extends (...args: any[]) => infer R ? R : never',
  ],
  [
    '00003-medium-omit',
    'type MyOmit<T, K extends keyof T> = { [P in keyof T as P extends K ? never : P]: T[P] }',
  ],
  ['00009-medium-deep-readonly', `type DeepReadonly<T> = {
    readonly [K in keyof T]: T[K] extends Record<string, unknown> | readonly unknown[] ? DeepReadonly<T[K]> : T[K]
  }`],
]
for (const [slug, answer] of solutions) {
  const report = judge(loadChallenge(slug), answer)
  check(
    `标准答案通过：${slug}`,
    report.passed,
    report.passed ? undefined : describeErrors(report.errors),
  )
}

// ------------------------------------------------- 3. 绕过 @ts-expect-error 的答案必须失败（TS2578）
const bypass = {
  slug: '00004-easy-pick',
  label: '断言全过但绕过 @ts-expect-error（TS2578）',
  // Pick<T, Extract<K, keyof T>> 能满足全部 Equal 断言，'invalid' 被静默丢弃，
  // 于是测试里那行 `// @ts-expect-error` 变成"未使用"，只有 TS2578 能拦住它。
  answer: 'type MyPick<T, K extends PropertyKey> = Pick<T, Extract<K, keyof T>>',
}
const bypassReport = judge(loadChallenge(bypass.slug), bypass.answer)
check(`${bypass.label} 判为失败`, !bypassReport.passed, describeErrors(bypassReport.errors))
check(
  `${bypass.label} 失败原因包含 TS2578`,
  bypassReport.errors.some((error) => error.code === 2578),
  `实际错误：${describeErrors(bypassReport.errors)}`,
)
check(
  `${bypass.label} 归因到具体用例`,
  Object.keys(bypassReport.caseFailures).length > 0,
  `caseFailures=${JSON.stringify(bypassReport.caseFailures)}`,
)

// ---------------------------------------------------------------- 4. 编译选项
const baseOptions = judge(loadChallenge('00004-easy-pick'), 'type MyPick<T, K> = any').options
check(
  'lib 使用规范化形式并与上游一致',
  JSON.stringify(baseOptions.lib) === JSON.stringify(BASE_COMPILER_OPTIONS.lib),
  `lib=${JSON.stringify(baseOptions.lib)}`,
)
check('strict 已开启', baseOptions.strict === true)
check('noUnusedParameters 关闭（避免中间态答案误报）', baseOptions.noUnusedParameters === false)
check('noEmit 已开启', baseOptions.noEmit === true)
check(
  'DOM 全局类型不可用（与上游 lib: ["ESNext"] 对齐）',
  !judge(loadChallenge('00004-easy-pick'), 'type D = Document').passed,
  'Document 竟然解析成功了，说明 lib 里混进了 DOM',
)
check(
  'ESNext 内置类型可用',
  judge(loadChallenge('00013-warm-hello-world'), 'type P = Promise<Awaited<string>>\ntype HelloWorld = string')
    .passed,
)

const indexChallenge = loadChallenge('00925-extreme-assert-array-index')
check(
  '题目级 tsconfig 覆盖被应用（00925: noUncheckedIndexedAccess）',
  indexChallenge.tsconfig?.noUncheckedIndexedAccess === true &&
    resolveCompilerOptions(indexChallenge.tsconfig).noUncheckedIndexedAccess === true,
)

// ---------------------------------------------------------------- 5. 模块语法检测
check(
  '检测出答案中的 import/export（会导致测试文件看不到类型）',
  detectModuleSyntax("import type { X } from './x'\ntype A = X") &&
    !detectModuleSyntax('type MyPick<T, K extends keyof T> = { [P in K]: T[P] }'),
)

// ---------------------------------------------------------------- 6. 行号对齐
const pickChallenge = loadChallenge('00004-easy-pick')
check(
  '去掉 utils import 后行号与原始 test-cases.ts 对齐',
  pickChallenge.cases[0].startLine === 3 &&
    pickChallenge.cases.at(-1).endLine === 7 &&
    pickChallenge.cases.at(-1).code.startsWith('MyPick<Todo'),
  `cases=${JSON.stringify(pickChallenge.cases.map((entry) => [entry.label, entry.startLine, entry.endLine]))}`,
)

// ---------------------------------------------------------------- 汇总
const failing = results.failed.length
console.log(
  `\n${failing ? '✖' : '✔'} 判题语义校验：${results.total - failing}/${results.total} 通过` +
    `（TS ${ts.version}，${challenges.length} 道题）`,
)
process.exit(failing ? 1 : 0)
