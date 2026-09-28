import { Link } from 'react-router-dom'
import type { ChallengeMeta } from '@/judge/types'
import { DifficultyBadge } from '@/components/common/DifficultyBadge'
import { cn } from '@/lib/cn'
import { useTranslator } from '@/i18n'
import { useProgressStore } from '@/store/progress'
import { useSettingsStore, resolveReadmeLocale } from '@/store/settings'

export function ChallengeCard({ challenge }: { challenge: ChallengeMeta }) {
  const locale = useSettingsStore((state) => state.locale)
  const questionLocale = useSettingsStore((state) => state.questionLocale)
  const t = useTranslator(locale)

  const status = useProgressStore((state) => state.status[challenge.slug] ?? 'todo')
  const favorite = useProgressStore((state) => state.favorites.includes(challenge.slug))
  const toggleFavorite = useProgressStore((state) => state.toggleFavorite)

  const title = challenge.titles[locale] ?? challenge.titles.en ?? challenge.slug
  const readmeLocale = resolveReadmeLocale(challenge.locales, questionLocale)

  return (
    <Link
      to={`/challenge/${challenge.slug}`}
      className={cn(
        'group relative flex flex-col gap-2 rounded-xl border border-border bg-surface p-3 transition',
        'hover:border-accent/50 hover:bg-surface-muted',
        status === 'passed' && 'border-success/30',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-[11px] text-muted">#{challenge.no}</span>
        <DifficultyBadge difficulty={challenge.difficulty} />
        {readmeLocale !== 'en' ? (
          <span className="text-[10px] text-muted">
            {readmeLocale === 'zh-CN' ? '中文' : readmeLocale}
          </span>
        ) : null}
        <div className="ml-auto flex items-center gap-1.5">
          {status === 'passed' ? (
            <span title={t('status.passed')} className="text-xs text-success">
              ✓
            </span>
          ) : status === 'attempted' ? (
            <span title={t('status.attempted')} className="text-xs text-warning">
              ●
            </span>
          ) : null}
          <button
            type="button"
            title={favorite ? t('action.unfavorite') : t('action.favorite')}
            onClick={(event) => {
              event.preventDefault()
              event.stopPropagation()
              toggleFavorite(challenge.slug)
            }}
            className={cn(
              'grid h-5 w-5 place-items-center rounded text-xs transition',
              favorite ? 'text-warning' : 'text-muted/60 hover:text-muted',
            )}
          >
            {favorite ? '★' : '☆'}
          </button>
        </div>
      </div>

      <div className="text-sm leading-5 font-medium text-fg group-hover:text-accent">{title}</div>

      {challenge.tags.length ? (
        <div className="flex flex-wrap gap-1">
          {challenge.tags.slice(0, 4).map((tag) => (
            <span
              key={tag}
              className="rounded border border-border bg-surface-muted px-1 text-[10px] leading-4 text-muted"
            >
              #{tag}
            </span>
          ))}
        </div>
      ) : null}
    </Link>
  )
}
