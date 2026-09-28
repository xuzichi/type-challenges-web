import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { Challenge, JudgeDiagnostic, JudgeReport } from '@/judge/types'
import { runJudge } from '@/judge/judge'
import { CHALLENGES, CHALLENGE_BY_NO, loadChallenge, neighbours } from '@/lib/data'
import { buildPlaygroundCode, buildPlaygroundUrl, challengeDirUrl, readmeUrl, shareAnswerUrl, solutionsUrl } from '@/lib/urls'
import { autoPushSilently } from '@/lib/syncClient'
import { readmeLocaleLabel } from '@/i18n'
import { cn } from '@/lib/cn'
import { useTranslator } from '@/i18n'
import { useProgressStore } from '@/store/progress'
import { resolveReadmeLocale, useSettingsStore } from '@/store/settings'
import { Badge, Button, ProgressBar } from '@/components/ui'
import { DifficultyBadge } from '@/components/common/DifficultyBadge'
import { Markdown } from '@/components/common/Markdown'
import { DiagnosticsPanel } from '@/components/challenge/DiagnosticsPanel'
import type { EditorHandles } from '@/components/editor/TypeChallengeEditor'

const TypeChallengeEditor = lazy(() =>
  import('@/components/editor/TypeChallengeEditor').then((module) => ({
    default: module.TypeChallengeEditor,
  })),
)

const AUTO_JUDGE_DELAY = 650

export default function ChallengePage() {
  const { slug = '' } = useParams()
  const t = useTranslator(useSettingsStore((state) => state.locale))
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'missing'; challenge?: Challenge }>(
    { status: 'loading' },
  )

  useEffect(() => {
    let alive = true
    setState({ status: 'loading' })
    loadChallenge(slug)
      .then((challenge) => {
        if (!alive) return
        setState(challenge ? { status: 'ready', challenge } : { status: 'missing' })
      })
      .catch(() => {
        if (alive) setState({ status: 'missing' })
      })
    return () => {
      alive = false
    }
  }, [slug])

  if (state.status === 'loading') {
    return <div className="p-8 text-center text-sm text-muted">{t('challenge.loading')}</div>
  }
  if (state.status === 'missing' || !state.challenge) {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <p className="text-sm text-muted">{t('challenge.notFound')}</p>
        <Link to="/" className="text-xs text-accent underline">
          {t('challenge.back')}
        </Link>
      </div>
    )
  }
  return <ChallengeView key={state.challenge.slug} challenge={state.challenge} />
}

function ChallengeView({ challenge }: { challenge: Challenge }) {
  const locale = useSettingsStore((state) => state.locale)
  const questionLocale = useSettingsStore((state) => state.questionLocale)
  const autoJudge = useSettingsStore((state) => state.autoJudge)
  const setAutoJudge = useSettingsStore((state) => state.setAutoJudge)
  const t = useTranslator(locale)

  const setDraft = useProgressStore((state) => state.setDraft)
  const markAttempted = useProgressStore((state) => state.markAttempted)
  const markPassed = useProgressStore((state) => state.markPassed)
  const resetChallenge = useProgressStore((state) => state.resetChallenge)
  const visit = useProgressStore((state) => state.visit)
  const status = useProgressStore((state) => state.status[challenge.slug] ?? 'todo')
  const favorite = useProgressStore((state) => state.favorites.includes(challenge.slug))
  const toggleFavorite = useProgressStore((state) => state.toggleFavorite)

  const [report, setReport] = useState<JudgeReport | null>(null)
  const [running, setRunning] = useState(false)
  const [bottomTab, setBottomTab] = useState<'tests' | 'diagnostics'>('tests')
  const [mobileView, setMobileView] = useState<'description' | 'editor'>('editor')
  const [copied, setCopied] = useState(false)

  const handlesRef = useRef<EditorHandles>({ answer: null, tests: null })
  const timerRef = useRef<number | undefined>(undefined)
  const runIdRef = useRef(0)
  // 重置/切换题面时不要把它当成"用户编辑"，否则草稿会被立刻写回
  const suppressChangeRef = useRef(false)
  const initialAnswerRef = useRef(useProgressStore.getState().drafts[challenge.slug])
  const initialAnswer = initialAnswerRef.current ?? challenge.template

  const readmeLocale = resolveReadmeLocale(challenge.locales, questionLocale)
  const readme = challenge.readmes[readmeLocale] ?? challenge.readmes.en ?? ''
  const title = challenge.titles[locale] ?? challenge.titles.en ?? challenge.slug
  const { prev, next } = useMemo(() => neighbours(challenge.slug), [challenge.slug])

  useEffect(() => {
    visit(challenge.slug)
  }, [challenge.slug, visit])

  const answerText = useCallback(
    () => handlesRef.current.answer?.getValue() ?? initialAnswer,
    [initialAnswer],
  )

  const judgeNow = useCallback(
    async (answer: string, focusResults: boolean) => {
      const runId = ++runIdRef.current
      setRunning(true)
      if (focusResults) setBottomTab('diagnostics')
      try {
        const result = await runJudge(challenge, answer)
        if (runIdRef.current !== runId) return
        setReport(result)
        if (result.passed) {
          const firstTime = useProgressStore.getState().status[challenge.slug] !== 'passed'
          markPassed(challenge.slug)
          if (firstTime) autoPushSilently()
        } else {
          markAttempted(challenge.slug)
        }
      } catch (error) {
        console.error('[type-challenges-web] 判题失败', error)
      } finally {
        if (runIdRef.current === runId) setRunning(false)
      }
    },
    [challenge, markAttempted, markPassed],
  )

  const handleChangeAnswer = useCallback(
    (value: string) => {
      if (suppressChangeRef.current) {
        suppressChangeRef.current = false
        return
      }
      window.clearTimeout(timerRef.current)
      timerRef.current = window.setTimeout(() => {
        setDraft(challenge.slug, value)
        if (useSettingsStore.getState().autoJudge) void judgeNow(value, false)
      }, AUTO_JUDGE_DELAY)
    },
    [challenge.slug, judgeNow, setDraft],
  )

  // 离开页面时把还没落盘的草稿补上
  useEffect(() => {
    return () => {
      window.clearTimeout(timerRef.current)
      const editor = handlesRef.current.answer
      if (editor) {
        const value = editor.getValue()
        if (value !== initialAnswer) useProgressStore.getState().setDraft(challenge.slug, value)
      }
    }
  }, [challenge.slug, initialAnswer])

  const jumpTo = useCallback((diagnostic: JudgeDiagnostic) => {
    const target =
      diagnostic.source === 'answer' ? handlesRef.current.answer : handlesRef.current.tests
    if (!target) return
    if (diagnostic.source === 'tests') setBottomTab('tests')
    window.requestAnimationFrame(() => {
      target.revealLineInCenter(diagnostic.line)
      target.setPosition({ lineNumber: diagnostic.line, column: diagnostic.column })
      target.focus()
    })
  }, [])

  const onReset = useCallback(() => {
    if (!window.confirm(t('action.resetConfirm'))) return
    suppressChangeRef.current = true
    resetChallenge(challenge.slug)
    handlesRef.current.answer?.setValue(challenge.template)
    setReport(null)
  }, [challenge.slug, challenge.template, resetChallenge, t])

  const onCopy = useCallback(() => {
    void navigator.clipboard
      .writeText(answerText())
      .then(() => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      })
      .catch(() => undefined)
  }, [answerText])

  const onOpenPlayground = useCallback(() => {
    const code = buildPlaygroundCode(challenge, answerText(), locale)
    window.open(buildPlaygroundUrl(code, challenge.tsconfig), '_blank', 'noopener')
  }, [answerText, challenge, locale])

  const related = challenge.related
    .map((no) => CHALLENGE_BY_NO.get(no))
    .filter((item): item is NonNullable<typeof item> => Boolean(item))

  const statusMap = useProgressStore((state) => state.status)
  const passedCount = Object.values(statusMap).filter((value) => value === 'passed').length
  const errorCount = report?.errors.length ?? 0

  return (
    <div className="flex h-[calc(100dvh-8.5rem)] min-h-[560px] flex-col gap-2">
      <header className="flex flex-wrap items-center gap-2">
        <Link
          to="/"
          className="rounded-lg border border-border px-2 py-1 text-xs text-muted transition hover:bg-surface-muted hover:text-fg"
        >
          ← {t('challenge.back')}
        </Link>
        <span className="font-mono text-xs text-muted">#{challenge.no}</span>
        <h1 className="truncate text-sm font-semibold">{title}</h1>
        <DifficultyBadge difficulty={challenge.difficulty} />
        <StatusPill status={status} />
        <button
          type="button"
          onClick={() => toggleFavorite(challenge.slug)}
          title={favorite ? t('action.unfavorite') : t('action.favorite')}
          className={cn('text-sm transition', favorite ? 'text-warning' : 'text-muted hover:text-fg')}
        >
          {favorite ? '★' : '☆'}
        </button>

        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-2 md:flex">
            <span className="text-[11px] text-muted">
              {t('home.progressSummary', { passed: passedCount, total: CHALLENGES.length })}
            </span>
            <ProgressBar value={passedCount} total={CHALLENGES.length} className="w-20" />
          </div>
          {prev ? (
            <Link
              to={`/challenge/${prev.slug}`}
              title={t('action.prev')}
              className="rounded-lg border border-border px-2 py-1 text-xs text-muted transition hover:text-fg"
            >
              ‹
            </Link>
          ) : null}
          {next ? (
            <Link
              to={`/challenge/${next.slug}`}
              title={t('action.next')}
              className="rounded-lg border border-border px-2 py-1 text-xs text-muted transition hover:text-fg"
            >
              ›
            </Link>
          ) : null}
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface p-2">
        <Button variant="primary" size="sm" onClick={() => void judgeNow(answerText(), true)} disabled={running}>
          {running ? t('action.running') : t('action.run')}
        </Button>
        <label className="flex items-center gap-1.5 text-[11px] text-muted">
          <input
            type="checkbox"
            className="accent-[var(--tc-accent)]"
            checked={autoJudge}
            onChange={(event) => setAutoJudge(event.target.checked)}
          />
          {t('result.autoJudge')}
        </label>

        <span className="mx-1 hidden h-4 w-px bg-border sm:block" />

        <Button size="xs" variant="ghost" onClick={onOpenPlayground}>
          {t('action.openPlayground')}
        </Button>
        <a
          className="rounded-md px-2 py-1 text-[11px] text-muted transition hover:bg-surface-muted hover:text-fg"
          href={solutionsUrl(challenge.no)}
          target="_blank"
          rel="noreferrer"
        >
          {t('action.viewSolutions')}
        </a>
        <a
          className="rounded-md px-2 py-1 text-[11px] text-muted transition hover:bg-surface-muted hover:text-fg"
          href={challengeDirUrl(challenge)}
          target="_blank"
          rel="noreferrer"
        >
          {t('action.viewOnGithub')}
        </a>
        <a
          className="rounded-md px-2 py-1 text-[11px] text-muted transition hover:bg-surface-muted hover:text-fg"
          href={shareAnswerUrl(challenge.no, title, locale)}
          target="_blank"
          rel="noreferrer"
        >
          {t('action.shareAnswer')}
        </a>

        <div className="ml-auto flex items-center gap-1">
          <Button size="xs" variant="ghost" onClick={onCopy}>
            {copied ? t('action.copied') : t('action.copy')}
          </Button>
          <Button size="xs" variant="ghost" onClick={onReset}>
            {t('action.reset')}
          </Button>
          <div className="flex items-center gap-1 lg:hidden">
            <Button
              size="xs"
              variant={mobileView === 'description' ? 'primary' : 'ghost'}
              onClick={() => setMobileView('description')}
            >
              {t('challenge.viewDescription')}
            </Button>
            <Button
              size="xs"
              variant={mobileView === 'editor' ? 'primary' : 'ghost'}
              onClick={() => setMobileView('editor')}
            >
              {t('challenge.viewEditor')}
            </Button>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 gap-3">
        <aside
          className={cn(
            'min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface lg:flex lg:w-[380px] xl:w-[460px]',
            mobileView === 'description' ? 'flex flex-1' : 'hidden',
          )}
        >
          <div className="flex items-center gap-2 border-b border-border bg-surface-muted px-3 py-1.5">
            <span className="text-[11px] font-medium text-muted">{t('challenge.description')}</span>
            {challenge.locales.length > 1 ? (
              <select
                value={readmeLocale}
                onChange={(event) =>
                  useSettingsStore.getState().setQuestionLocale(event.target.value as typeof questionLocale)
                }
                className="ml-auto h-6 rounded-md border border-border bg-bg px-1.5 text-[11px]"
              >
                {challenge.locales.map((item) => (
                  <option key={item} value={item}>
                    {readmeLocaleLabel(item)}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-3">
            {locale === 'zh-CN' && readmeLocale !== 'zh-CN' ? (
              <p className="mb-2 rounded-lg border border-border bg-surface-muted p-2 text-[11px] text-muted">
                {t('challenge.noChineseReadme')}
              </p>
            ) : null}
            <Markdown markdown={readme} />

            {challenge.tags.length ? (
              <div className="mt-4 flex flex-wrap gap-1">
                {challenge.tags.map((tag) => (
                  <Link
                    key={tag}
                    to={`/?t=${encodeURIComponent(tag)}`}
                    className="rounded border border-border bg-surface-muted px-1.5 py-0.5 text-[10px] text-muted hover:text-accent"
                  >
                    #{tag}
                  </Link>
                ))}
              </div>
            ) : null}

            {related.length ? (
              <div className="mt-4">
                <div className="mb-1 text-[10px] tracking-wide text-muted uppercase">
                  {t('challenge.related')}
                </div>
                <div className="flex flex-col gap-1">
                  {related.map((item) => (
                    <Link
                      key={item.slug}
                      to={`/challenge/${item.slug}`}
                      className="truncate text-[11px] text-accent hover:underline"
                    >
                      #{item.no} {item.titles[locale] ?? item.titles.en}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px] text-muted">
              {challenge.author?.name ? (
                <span>
                  {t('challenge.author')}: {challenge.author.name}
                  {challenge.author.github ? ` (@${challenge.author.github})` : ''}
                </span>
              ) : null}
              <a className="text-accent hover:underline" href={readmeUrl(challenge, readmeLocale)} target="_blank" rel="noreferrer">
                README ↗
              </a>
            </div>
          </div>
        </aside>

        <section
          className={cn(
            'min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-surface',
            mobileView === 'editor' ? 'block' : 'hidden lg:block',
          )}
        >
          <Suspense
            fallback={
              <div className="grid h-full place-items-center text-xs text-muted">
                {t('common.loading')}
              </div>
            }
          >
            <TypeChallengeEditor
              challenge={challenge}
              initialAnswer={initialAnswer}
              onChangeAnswer={handleChangeAnswer}
              onReady={(handles) => {
                handlesRef.current = handles
              }}
              bottomTab={bottomTab}
              onBottomTabChange={setBottomTab}
              errorCount={errorCount}
              diagnosticCount={report?.diagnostics.length ?? 0}
              bottom={<DiagnosticsPanel report={report} running={running} onJump={jumpTo} />}
            />
          </Suspense>
        </section>
      </div>
    </div>
  )
}

function StatusPill({ status }: { status: 'todo' | 'attempted' | 'passed' }) {
  const t = useTranslator(useSettingsStore((state) => state.locale))
  if (status === 'passed') return <Badge tone="success">✓ {t('status.passed')}</Badge>
  if (status === 'attempted') return <Badge tone="warning">{t('status.attempted')}</Badge>
  return null
}
