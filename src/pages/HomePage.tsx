import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CHALLENGES, CHALLENGE_BY_SLUG, DIFFICULTY_ORDER, UPSTREAM } from '@/lib/data'
import type { ChallengeMeta } from '@/judge/types'
import { ChallengeCard } from '@/components/challenge/ChallengeCard'
import { EMPTY_FILTERS, FilterBar, type Filters } from '@/components/challenge/FilterBar'
import { buttonClass, Card } from '@/components/ui'
import { useTranslator } from '@/i18n'
import { useProgressStore } from '@/store/progress'
import { useSettingsStore } from '@/store/settings'

export default function HomePage() {
  const t = useTranslator(useSettingsStore((state) => state.locale))
  const [searchParams, setSearchParams] = useSearchParams()
  const status = useProgressStore((state) => state.status)
  const favorites = useProgressStore((state) => state.favorites)
  const lastVisited = useProgressStore((state) => state.lastVisited)

  const filters: Filters = {
    q: searchParams.get('q') ?? '',
    difficulty: searchParams.get('d') ?? '',
    status: searchParams.get('s') ?? '',
    tag: searchParams.get('t') ?? '',
  }

  const setFilters = (next: Filters) => {
    const params = new URLSearchParams()
    if (next.q) params.set('q', next.q)
    if (next.difficulty) params.set('d', next.difficulty)
    if (next.status) params.set('s', next.status)
    if (next.tag) params.set('t', next.tag)
    setSearchParams(params, { replace: true })
  }

  const filtered = useMemo(() => {
    const query = filters.q.trim().toLowerCase()
    return CHALLENGES.filter((challenge) => {
      if (filters.difficulty && challenge.difficulty !== filters.difficulty) return false
      if (filters.tag && !challenge.tags.includes(filters.tag)) return false
      if (filters.status === 'favorite') {
        if (!favorites.includes(challenge.slug)) return false
      } else if (filters.status) {
        if ((status[challenge.slug] ?? 'todo') !== filters.status) return false
      }
      if (query) {
        const haystack = [
          String(challenge.no),
          challenge.slug,
          challenge.titles.en ?? '',
          challenge.titles['zh-CN'] ?? '',
          ...challenge.tags,
        ]
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(query)) return false
      }
      return true
    })
  }, [filters.q, filters.difficulty, filters.status, filters.tag, favorites, status])

  const groups = useMemo(() => {
    if (filters.difficulty) return [{ difficulty: filters.difficulty, items: filtered }]
    return DIFFICULTY_ORDER.map((difficulty) => ({
      difficulty,
      items: filtered.filter((item) => item.difficulty === difficulty),
    })).filter((group) => group.items.length > 0)
  }, [filtered, filters.difficulty])

  const resume = lastVisited ? CHALLENGE_BY_SLUG.get(lastVisited.slug) : undefined
  const isFiltered = JSON.stringify(filters) !== JSON.stringify(EMPTY_FILTERS)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-lg font-semibold">{t('app.title')}</h1>
        <p className="text-xs text-muted">{t('app.tagline')}</p>
      </div>

      {resume && !isFiltered ? <ResumeCard challenge={resume} at={lastVisited?.at} /> : null}

      <FilterBar filters={filters} onChange={setFilters} shown={filtered.length} />

      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted">{t('home.empty')}</Card>
      ) : (
        groups.map((group) => (
          <section key={group.difficulty} className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <h2 className="text-xs font-medium tracking-wide text-muted uppercase">
                {t(`difficulty.${group.difficulty}`)}
              </h2>
              <span className="text-[11px] text-muted">
                {group.items.length} / {CHALLENGES.length}
              </span>
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {group.items.map((challenge) => (
                <ChallengeCard key={challenge.slug} challenge={challenge} />
              ))}
            </div>
          </section>
        ))
      )}

      <p className="pt-2 text-[11px] text-muted">
        {t('home.upstream', {
          repo: UPSTREAM.repo,
          ref: (UPSTREAM.ref ?? '').slice(0, 7),
        })}{' '}
        ·{' '}
        <a
          className="text-accent underline"
          href={UPSTREAM.sourceUrl}
          target="_blank"
          rel="noreferrer"
        >
          {UPSTREAM.license}
        </a>
      </p>
    </div>
  )
}

function ResumeCard({ challenge, at }: { challenge: ChallengeMeta; at?: string }) {
  const t = useTranslator(useSettingsStore((state) => state.locale))
  const locale = useSettingsStore((state) => state.locale)
  return (
    <Card className="flex flex-wrap items-center gap-3 border-accent/30 bg-accent/5 p-3">
      <div className="min-w-0">
        <div className="text-[11px] text-muted">{t('home.resume')}</div>
        <div className="truncate text-sm font-medium">
          #{challenge.no} {challenge.titles[locale] ?? challenge.titles.en}
        </div>
        {at ? (
          <div className="text-[11px] text-muted">
            {t('home.resumeHint')} · {new Date(at).toLocaleString()}
          </div>
        ) : null}
      </div>
      <Link
        to={`/challenge/${challenge.slug}`}
        className={buttonClass('primary', 'sm', 'ml-auto')}
      >
        {t('action.next')}
      </Link>
    </Card>
  )
}
