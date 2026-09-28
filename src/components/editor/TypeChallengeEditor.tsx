import { useEffect, useRef, useState } from 'react'
import Editor, { type OnMount } from '@monaco-editor/react'
import type { editor } from 'monaco-editor'
import { monaco } from './monaco-setup'
import { ANSWER_URI, TESTS_URI, applyCompilerOptions, testsModelFor } from '@/judge/judge'
import type { Challenge } from '@/judge/types'
import { cn } from '@/lib/cn'
import { useTranslator } from '@/i18n'
import { useSettingsStore } from '@/store/settings'

export interface EditorHandles {
  answer: editor.IStandaloneCodeEditor | null
  tests: editor.IStandaloneCodeEditor | null
}

interface Props {
  challenge: Challenge
  initialAnswer: string
  onChangeAnswer: (value: string) => void
  onReady: (handles: EditorHandles) => void
  /** 底部面板：测试用例 or 检测结果 */
  bottomTab: 'tests' | 'diagnostics'
  onBottomTabChange: (tab: 'tests' | 'diagnostics') => void
  errorCount: number
  diagnosticCount: number
  bottom: React.ReactNode
}

export function TypeChallengeEditor({
  challenge,
  initialAnswer,
  onChangeAnswer,
  onReady,
  bottomTab,
  onBottomTabChange,
  errorCount,
  diagnosticCount,
  bottom,
}: Props) {
  const t = useTranslator(useSettingsStore((state) => state.locale))
  const theme = useSettingsStore((state) => state.theme)
  const fontSize = useSettingsStore((state) => state.editorFontSize)
  const minimap = useSettingsStore((state) => state.editorMinimap)
  const wordWrap = useSettingsStore((state) => state.editorWordWrap)

  const handlesRef = useRef<EditorHandles>({ answer: null, tests: null })
  const [ready, setReady] = useState(false)

  // 编译选项是全局的（monaco 按语言维护一份），因此每次进入题目都要重新应用；
  // 测试用例模型的内容也只在这一步确定（去掉 utils import，行号保持不变）。
  applyCompilerOptions(challenge)
  testsModelFor(challenge)

  useEffect(() => {
    return () => {
      handlesRef.current = { answer: null, tests: null }
      setReady(false)
      // 离开题目时释放模型，避免下一次进入时残留上一题的代码
      monaco.editor.getModel(monaco.Uri.parse(ANSWER_URI))?.dispose()
      monaco.editor.getModel(monaco.Uri.parse(TESTS_URI))?.dispose()
    }
  }, [challenge.slug])

  // 底部面板切换 tab 后，Monaco 需要重新测量尺寸
  useEffect(() => {
    handlesRef.current.tests?.layout()
  }, [bottomTab, ready])

  const handleAnswerMount: OnMount = (instance) => {
    handlesRef.current.answer = instance
    publish()
  }
  const handleTestsMount: OnMount = (instance) => {
    handlesRef.current.tests = instance
    publish()
  }
  function publish() {
    onReady(handlesRef.current)
    if (handlesRef.current.answer && handlesRef.current.tests) setReady(true)
  }

  const sharedOptions = {
    fontSize,
    minimap: { enabled: minimap },
    wordWrap: (wordWrap ? 'on' : 'off') as 'on' | 'off',
    scrollBeyondLastLine: false,
    automaticLayout: true,
    tabSize: 2,
    fontFamily: 'var(--font-mono)',
    fontLigatures: true,
    renderLineHighlight: 'line' as const,
    smoothScrolling: true,
    padding: { top: 12, bottom: 16 },
    scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center gap-2 border-b border-border bg-surface-muted px-3 py-1">
        <span className="text-[11px] font-medium tracking-wide text-muted">
          {t('challenge.answer')}
        </span>
        <span className="text-[10px] text-muted">TypeScript · strict</span>
      </div>
      <div className="min-h-[180px] flex-1">
        <Editor
          language="typescript"
          path={ANSWER_URI}
          defaultValue={initialAnswer}
          theme={theme === 'dark' ? 'vs-dark' : 'vs'}
          onMount={handleAnswerMount}
          onChange={(value) => onChangeAnswer(value ?? '')}
          options={sharedOptions}
        />
      </div>

      <div className="flex h-[42%] min-h-[150px] flex-col border-t border-border">
        <div className="flex items-center gap-1 border-b border-border bg-surface-muted px-2">
          <BottomTab
            active={bottomTab === 'tests'}
            onClick={() => onBottomTabChange('tests')}
            label={t('challenge.tests')}
            badge={errorCount > 0 ? errorCount : undefined}
            tone="danger"
          />
          <BottomTab
            active={bottomTab === 'diagnostics'}
            onClick={() => onBottomTabChange('diagnostics')}
            label={t('challenge.diagnostics')}
            badge={diagnosticCount > 0 ? diagnosticCount : undefined}
            tone={errorCount > 0 ? 'danger' : 'neutral'}
          />
          <span className="ml-auto pr-1 text-[10px] text-muted">
            {t('challenge.readonly')}
          </span>
        </div>

        <div className={cn('min-h-0 flex-1', bottomTab === 'tests' ? 'block' : 'hidden')}>
          <Editor
            language="typescript"
            path={TESTS_URI}
            theme={theme === 'dark' ? 'vs-dark' : 'vs'}
            onMount={handleTestsMount}
            options={{
              ...sharedOptions,
              readOnly: true,
              domReadOnly: true,
              cursorStyle: 'line-thin' as const,
              contextmenu: false,
              renderValidationDecorations: 'on' as const,
              occurrencesHighlight: 'off' as const,
              selectionHighlight: false,
            }}
          />
        </div>
        <div className={cn('min-h-0 flex-1', bottomTab === 'diagnostics' ? 'block' : 'hidden')}>
          {bottom}
        </div>
      </div>
    </div>
  )
}

function BottomTab({
  active,
  onClick,
  label,
  badge,
  tone,
}: {
  active: boolean
  onClick: () => void
  label: string
  badge?: number
  tone: 'danger' | 'neutral'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'relative -mb-px inline-flex items-center gap-1.5 border-b-2 px-2.5 py-1.5 text-xs transition',
        active ? 'border-accent text-fg' : 'border-transparent text-muted hover:text-fg',
      )}
    >
      {label}
      {badge !== undefined ? (
        <span
          className={cn(
            'rounded px-1 text-[10px] leading-4',
            tone === 'danger' ? 'bg-danger/15 text-danger' : 'bg-surface text-muted',
          )}
        >
          {badge}
        </span>
      ) : null}
    </button>
  )
}

