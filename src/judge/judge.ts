import * as monaco from 'monaco-editor'
import {
  buildJudgeSources,
  detectModuleSyntax,
  findEntryForLine,
  offsetToPosition,
  toGlobalUtilsDts,
} from '@shared/judge-core.mjs'
import utilsJson from '@/data/type-challenges-utils.json'
import { toMonacoCompilerOptions } from './options'
import type { Challenge, DiagnosticSeverity, JudgeDiagnostic, JudgeReport } from './types'

export const ANSWER_URI = 'file:///answer.ts'
export const TESTS_URI = 'file:///tests.ts'
export const UTILS_URI = 'file:///type-challenges-utils.d.ts'

const utilsSource = (utilsJson as { source: string }).source

let utilsLibRegistered = false
/** 已应用的编译选项标识（题目 + tsconfig 覆盖），避免每次渲染都重设一次。 */
let appliedOptionsKey: string | null = null

function typescriptDefaults() {
  return monaco.typescript.typescriptDefaults
}

/**
 * 断言工具（`@type-challenges/utils`）在上游测试文件里是 import 进来的；
 * 这里改写成全局声明注入，免去模块解析，同时保证与上游类型定义完全一致。
 */
function ensureUtilsLib(): void {
  if (utilsLibRegistered) return
  typescriptDefaults().addExtraLib(toGlobalUtilsDts(utilsSource), UTILS_URI)
  utilsLibRegistered = true
}

/** 应用基础编译选项 + 题目级覆盖。每次进入题目都要调用，因为选项是全局的。 */
export function applyCompilerOptions(challenge: Challenge | undefined): void {
  ensureUtilsLib()
  const key = `${challenge?.slug ?? ''}:${JSON.stringify(challenge?.tsconfig ?? {})}`
  if (key === appliedOptionsKey) return
  appliedOptionsKey = key
  typescriptDefaults().setCompilerOptions(toMonacoCompilerOptions(challenge?.tsconfig))
  typescriptDefaults().setDiagnosticsOptions({
    noSemanticValidation: false,
    noSyntaxValidation: false,
    onlyVisible: false,
    // 明确清空：monaco 允许按 code 屏蔽诊断，而 TS2578（未使用的 @ts-expect-error）
    // 正是判题的关键依据，任何屏蔽都会让走捷径的答案蒙混过关。
    diagnosticCodesToIgnore: [],
  })
}

/** 测试文件在编译器里看到的内容：去掉 utils import（空行占位，行号不变）。 */
export function testsSourceFor(challenge: Challenge): string {
  return buildJudgeSources({ tests: challenge.tests, answer: '' }, { utilsSource }).testsSource
}

export function testsModelFor(challenge: Challenge): monaco.editor.ITextModel {
  const uri = monaco.Uri.parse(TESTS_URI)
  const source = testsSourceFor(challenge)
  const existing = monaco.editor.getModel(uri)
  if (existing) {
    if (existing.getValue() !== source) existing.setValue(source)
    return existing
  }
  return monaco.editor.createModel(source, 'typescript', uri)
}

export function answerModel(): monaco.editor.ITextModel | undefined {
  return monaco.editor.getModel(monaco.Uri.parse(ANSWER_URI)) ?? undefined
}

function flattenMessage(messageText: unknown): string {
  if (typeof messageText === 'string') return messageText
  if (messageText && typeof messageText === 'object' && 'messageText' in messageText) {
    const chain = messageText as { messageText: string; next?: unknown }
    const parts = [chain.messageText]
    let next = chain.next
    while (next) {
      const node = next as { messageText: string; next?: unknown }
      parts.push(node.messageText)
      next = node.next
    }
    return parts.join('\n')
  }
  return String(messageText)
}

const SEVERITIES: Record<number, DiagnosticSeverity> = {
  1: 'error',
  0: 'warning',
  2: 'info',
  3: 'hint',
}

type WorkerDiagnostic = monaco.typescript.Diagnostic

function normalize(
  diagnostics: WorkerDiagnostic[],
  source: JudgeDiagnostic['source'],
  text: string,
  cases: Challenge['cases'],
): JudgeDiagnostic[] {
  return diagnostics.map((diagnostic) => {
    const position = offsetToPosition(text, diagnostic.start ?? 0)
    const entry = source === 'tests' ? findEntryForLine(cases, position.line) : undefined
    return {
      source,
      code: Number(diagnostic.code),
      severity: SEVERITIES[diagnostic.category] ?? 'error',
      line: position.line,
      column: position.column,
      message: flattenMessage(diagnostic.messageText),
      caseLabel: entry?.label,
    }
  })
}

export class JudgeUnavailableError extends Error {}

/**
 * 跑一次判题：拿 monaco 自带的 TypeScript 语言服务对「答案 + 测试用例」求诊断，
 * 零 error 即通过。
 *
 * 关键点：诊断必须**两个文件都取**。上游测试里有几十处 `// @ts-expect-error`，
 * 它们靠"这里本该报错"来表达断言；如果答案把这些非法输入悄悄吞掉，
 * 就会产生 TS2578，我们必须把它算作失败。
 */
export async function runJudge(challenge: Challenge, answerSource: string): Promise<JudgeReport> {
  const started = performance.now()
  const answer = answerModel()
  if (!answer) throw new JudgeUnavailableError('答案编辑器尚未就绪')

  const tests = testsModelFor(challenge)
  if (answer.getValue() !== answerSource) answer.setValue(answerSource)

  const getWorker = await monaco.typescript.getTypeScriptWorker()
  const client = await getWorker(tests.uri)

  const [answerSyntax, answerSemantic, testsSyntax, testsSemantic, optionDiagnostics] =
    await Promise.all([
      client.getSyntacticDiagnostics(ANSWER_URI),
      client.getSemanticDiagnostics(ANSWER_URI),
      client.getSyntacticDiagnostics(TESTS_URI),
      client.getSemanticDiagnostics(TESTS_URI),
      client.getCompilerOptionsDiagnostics(ANSWER_URI),
    ])

  const testsText = tests.getValue()
  const diagnostics = [
    ...normalize(answerSyntax, 'answer', answerSource, challenge.cases),
    ...normalize(answerSemantic, 'answer', answerSource, challenge.cases),
    ...normalize(testsSyntax, 'tests', testsText, challenge.cases),
    ...normalize(testsSemantic, 'tests', testsText, challenge.cases),
    // 编译选项层面的诊断（例如 lib 配错）单独归到答案侧，避免被忽略
    ...normalize(optionDiagnostics, 'answer', answerSource, challenge.cases),
  ]

  const errors = diagnostics.filter((diagnostic) => diagnostic.severity === 'error')
  const caseFailures: Record<string, number> = {}
  for (const error of errors) {
    if (!error.caseLabel) continue
    caseFailures[error.caseLabel] = (caseFailures[error.caseLabel] ?? 0) + 1
  }

  return {
    passed: errors.length === 0,
    errors,
    diagnostics,
    caseFailures,
    answerHasModuleSyntax: detectModuleSyntax(answerSource),
    durationMs: Math.round(performance.now() - started),
  }
}
