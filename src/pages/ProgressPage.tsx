import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { CHALLENGES, CHALLENGE_BY_SLUG, DIFFICULTY_ORDER } from '@/lib/data'
import { countPassed, useProgressStore } from '@/store/progress'
import { useTranslator } from '@/i18n'
import { useSettingsStore } from '@/store/settings'
import { Badge, buttonClass, Card, ProgressBar } from '@/components/ui'
import { DifficultyBadge } from '@/components/common/DifficultyBadge'

export default function ProgressPage() {
  const locale = useSettingsStore((state) => state.locale)
  const t = useTranslator(locale)
  const status = useProgressStore((state) => state.status)
  const draftUpdatedAt = useProgressStore((state) => state.draftUpdatedAt)
  const favorites = useProgressStore((state) => state.favorites)
  const passedAt = useProgressStore((state) => state.passedAt)

  const passed = countPassed(status)
  const attempted = Object.values(status).filter((value) => value === 'attempted').length

  const recent = useMemo(
    () =>
      Object.entries(draftUpdatedAt)
        .sort((a, b) => (a[1] < b[1] ? 1 : -1))
        .slice(0, 8)
        .map(([slug, at]) => ({ challenge: CHALLENGE_BY_SLUG.get(slug), at }))
        .filter((item) => item.challenge),
    [draftUpdatedAt],
  )

  const byDifficulty = DIFFICULTY_ORDER.map((difficulty) => {
    const items = CHALLENGES.filter((item) => item.difficulty === difficulty)
    const solved = items.filter((item) => status[item.slug] === 'passed').length
    return { difficulty, total: items.length, solved }
  })

  /** 最近 30 天每天通过的题数，做一个简单的热力条 */
  const recentDays = useMemo(() => {
    const days: { date: string; count: number }[] = []
    const today = new Date()
    for (let offset = 29; offset >= 0; offset--) {
      const date = new Date(today)
      date.setDate(today.getDate() - offset)
      const key = date.toISOString().slice(0, 10)
      days.push({ date: key, count: 0 })
    }
    const index = new Map(days.map((day, position) => [day.date, position]))
    for (const at of Object.values(passedAt)) {
      const position = index.get(at.slice(0, 10))
      if (position !== undefined) days[position].count += 1
    }
    return days
  }, [passedAt])

  const maxDay = Math.max(1, ...recentDays.map((day) => day.count))

  if (passed + attempted === 0) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center">
        <p className="text-sm text-muted">{t('progress.none')}</p>
        <Link to="/" className="text-xs text-accent underline">
          {t('nav.challenges')}
        </Link>
      </div>
    )
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 pb-10">
      <h1 className="text-lg font-semibold">{t('progress.title')}</h1>

      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">{t('progress.overall')}</span>
          <span className="text-xs text-muted">
            {t('home.progressSummary', { passed, total: CHALLENGES.length })}
          </span>
        </div>
        <ProgressBar value={passed} total={CHALLENGES.length} />
        <div className="flex gap-2 text-[11px] text-muted">
          <span>{t('status.passed')}: {passed}</span>
          <span>·</span>
          <span>{t('status.attempted')}: {attempted}</span>
        </div>
        <div className="flex items-end gap-0.5 pt-1" title={t('progress.recent')}>
          {recentDays.map((day) => (
            <div
              key={day.date}
              title={`${day.date} · ${day.count}`}
              className="h-6 flex-1 rounded-sm bg-accent/25"
              style={{ opacity: day.count === 0 ? 0.15 : 0.3 + (day.count / maxDay) * 0.7 }}
            />
          ))}
        </div>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="text-sm font-medium">{t('progress.byDifficulty')}</h2>
        {byDifficulty.map((item) => (
          <div key={item.difficulty} className="flex items-center gap-3">
            <DifficultyBadge difficulty={item.difficulty} className="w-16 justify-center" />
            <ProgressBar value={item.solved} total={item.total} className="flex-1" />
            <span className="w-16 text-right text-[11px] text-muted">
              {item.solved} / {item.total}
            </span>
          </div>
        ))}
      </Card>

      {recent.length ? (
        <Card className="flex flex-col gap-2 p-4">
          <h2 className="text-sm font-medium">{t('progress.recent')}</h2>
          {recent.map(({ challenge, at }) =>
            challenge ? (
              <Link
                key={challenge.slug}
                to={`/challenge/${challenge.slug}`}
                className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs transition hover:bg-surface-muted"
              >
                <span className="font-mono text-[11px] text-muted">#{challenge.no}</span>
                <span className="truncate">{challenge.titles[locale] ?? challenge.titles.en}</span>
                {status[challenge.slug] === 'passed' ? <Badge tone="success">✓</Badge> : null}
                <span className="ml-auto shrink-0 text-[10px] text-muted">
                  {new Date(at).toLocaleDateString()}
                </span>
              </Link>
            ) : null,
          )}
        </Card>
      ) : null}

      {favorites.length ? (
        <Card className="flex flex-col gap-2 p-4">
          <h2 className="text-sm font-medium">{t('progress.favorites')}</h2>
          <div className="flex flex-wrap gap-1.5">
            {favorites.map((slug) => {
              const challenge = CHALLENGE_BY_SLUG.get(slug)
              if (!challenge) return null
              return (
                <Link
                  key={slug}
                  to={`/challenge/${slug}`}
                  className="rounded-md border border-border bg-surface-muted px-2 py-0.5 text-[11px] text-muted transition hover:text-accent"
                >
                  #{challenge.no} {challenge.titles[locale] ?? challenge.titles.en}
                </Link>
              )
            })}
          </div>
        </Card>
      ) : null}

      <Card className="flex flex-wrap items-center gap-3 p-4 text-[11px] text-muted">
        <span>{t('progress.syncedHint')}</span>
        <Link to="/settings" className={buttonClass('outline', 'sm', 'ml-auto')}>
          {t('progress.openSettings')}
        </Link>
      </Card>
    </div>
  )
}
