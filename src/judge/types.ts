/**
 * 判题相关的公共类型。
 *
 * `Challenge` 的结构由 `scripts/fetch-challenges.mjs` 生成，字段与上游
 * `questions/<slug>/` 目录一一对应。
 */

export type Difficulty = 'warm' | 'easy' | 'medium' | 'hard' | 'extreme' | 'pending'

export type Locale = 'zh-CN' | 'en'

/** 上游 README 可能存在其它语言，界面只提供中英切换，其余仅在题面上按需回退。 */
export type ReadmeLocale = 'en' | 'zh-CN' | 'ja' | 'ko' | 'pt-BR'

export interface ChallengeMeta {
  no: number
  slug: string
  difficulty: Difficulty
  tags: string[]
  related: number[]
  /** 题号对应的本地化标题；缺失时回退到 en。 */
  titles: Partial<Record<ReadmeLocale, string>>
  /** 该题拥有哪些语言的题面。 */
  locales: ReadmeLocale[]
}

/** 测试文件里一条被断言的用例（由 scripts/fetch-challenges.mjs 预计算）。 */
export interface CaseEntry {
  block: string
  index: number
  label: string
  startLine: number
  endLine: number
  code: string
}

export interface Challenge extends ChallengeMeta {
  author?: { name?: string; github?: string; email?: string }
  /** 题目级编译选项覆盖（上游只用到 noUncheckedIndexedAccess）。 */
  tsconfig?: Record<string, unknown>
  readmes: Partial<Record<ReadmeLocale, string>>
  template: string
  tests: string
  cases: CaseEntry[]
}

export type DiagnosticSeverity = 'error' | 'warning' | 'info' | 'hint'

/** 归一化后的单条诊断，两个文件（答案 / 测试）共用同一结构。 */
export interface JudgeDiagnostic {
  source: 'answer' | 'tests'
  code: number
  severity: DiagnosticSeverity
  /** 1-based */
  line: number
  /** 1-based */
  column: number
  message: string
  /** 命中的用例标签（仅测试文件中的诊断会有）。 */
  caseLabel?: string
}

export interface JudgeReport {
  passed: boolean
  errors: JudgeDiagnostic[]
  diagnostics: JudgeDiagnostic[]
  /** 用例标签 -> 错误数量，用于"第几条用例没过"。 */
  caseFailures: Record<string, number>
  /** 答案里出现了 import/export，会导致测试文件看不到它声明的类型。 */
  answerHasModuleSyntax: boolean
  /** 本次判题耗时（毫秒）。 */
  durationMs: number
}
