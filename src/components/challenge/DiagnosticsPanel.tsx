import type { JudgeDiagnostic, JudgeReport } from '@/judge/types'
import { cn } from '@/lib/cn'
import { useTranslator } from '@/i18n'
import { useSettingsStore } from '@/store/settings'

const MAX_VISIBLE = 60

export function DiagnosticsPanel({
  report,
  running,
  onJump,
}: {
  report: JudgeReport | null
  running: boolean
  onJump: (diagnostic: JudgeDiagnostic) => void
}) {
  const t = useTranslator(useSettingsStore((state) => state.locale))

  if (running) {
    return <Hint>{t('result.running')}</Hint>
  }
  if (!report) {
    return <Hint>{t('result.idle')}</Hint>
  }
  if (report.passed) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 p-4 text-center">
        <div className="text-sm font-medium text-success">{t('result.passed')}</div>
        <div className="text-[11px] text-muted">
          {t('result.duration', { ms: report.durationMs })}
        </div>
      </div>
    )
  }

  const answerErrors = report.errors.filter((item) => item.source === 'answer')
  const testErrors = report.errors.filter((item) => item.source === 'tests')
  const visible = [...answerErrors, ...testErrors].slice(0, MAX_VISIBLE)

  return (
    <div className="h-full overflow-auto p-2">
      <div className="mb-2 flex flex-wrap items-center gap-2 px-1">
        <span className="text-xs font-medium text-danger">
          {t('result.failed', { count: report.errors.length })}
        </span>
        <span className="text-[11px] text-muted">{t('result.duration', { ms: report.durationMs })}</span>
        {Object.keys(report.caseFailures).length ? (
          <span className="text-[11px] text-muted">
            {t('result.caseFailures', { labels: Object.keys(report.caseFailures).join(', ') })}
          </span>
        ) : null}
      </div>

      {report.answerHasModuleSyntax ? (
        <div className="mb-2 rounded-lg border border-warning/40 bg-warning/10 p-2 text-[11px] leading-relaxed text-warning">
          {t('result.moduleSyntax')}
        </div>
      ) : null}

      {answerErrors.length ? (
        <Group title={t('result.answerErrors')}>
          {answerErrors.slice(0, MAX_VISIBLE).map((item, index) => (
            <Item key={`a-${index}`} diagnostic={item} onJump={onJump} />
          ))}
        </Group>
      ) : null}

      {testErrors.length ? (
        <Group title={t('result.testErrors')}>
          {testErrors.slice(0, MAX_VISIBLE).map((item, index) => (
            <Item key={`t-${index}`} diagnostic={item} onJump={onJump} />
          ))}
        </Group>
      ) : null}

      {report.errors.length > visible.length ? (
        <div className="px-2 py-1 text-[10px] text-muted">
          {t('result.truncated', { count: MAX_VISIBLE })}
        </div>
      ) : null}
    </div>
  )
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-2">
      <div className="px-1 py-1 text-[10px] font-medium tracking-wide text-muted uppercase">
        {title}
      </div>
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  )
}

function Item({
  diagnostic,
  onJump,
}: {
  diagnostic: JudgeDiagnostic
  onJump: (diagnostic: JudgeDiagnostic) => void
}) {
  const t = useTranslator(useSettingsStore((state) => state.locale))
  return (
    <button
      type="button"
      onClick={() => onJump(diagnostic)}
      className={cn(
        'flex w-full items-start gap-2 rounded-lg border border-border bg-surface-muted px-2 py-1.5 text-left transition',
        'hover:border-accent/50',
      )}
    >
      <span
        className={cn(
          'mt-0.5 shrink-0 rounded px-1 font-mono text-[10px] leading-4',
          diagnostic.severity === 'error'
            ? 'bg-danger/15 text-danger'
            : 'bg-warning/15 text-warning',
        )}
      >
        TS{diagnostic.code}
      </span>
      <span className="min-w-0 flex-1">
        {diagnostic.caseLabel ? (
          <span className="mr-1.5 rounded bg-accent/10 px-1 font-mono text-[10px] text-accent">
            {diagnostic.caseLabel}
          </span>
        ) : null}
        <span className="text-[11px] leading-relaxed break-words text-fg">
          {diagnostic.message}
        </span>
      </span>
      <span className="shrink-0 font-mono text-[10px] text-muted">
        {t('result.jump')} {diagnostic.line}:{diagnostic.column}
      </span>
    </button>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full items-center justify-center p-4 text-center text-[11px] text-muted">
      {children}
    </div>
  )
}
