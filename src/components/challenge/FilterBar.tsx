import { DIFFICULTY_ORDER, ALL_TAGS, COUNTS_BY_DIFFICULTY, CHALLENGES } from '@/lib/data'
import type { ChallengeStatus } from '@/store/progress'
import { countPassed, useProgressStore } from '@/store/progress'
import { useTranslator } from '@/i18n'
import { useSettingsStore } from '@/store/settings'
import { Button } from '@/components/ui'
import { cn } from '@/lib/cn'

export interface Filters {
  q: string
  difficulty: string
  status: string
  tag: string
}

export const EMPTY_FILTERS: Filters = { q: '', difficulty: '', status: '', tag: '' }

const STATUSES: ChallengeStatus[] = ['todo', 'attempted', 'passed']

export function FilterBar({
  filters,
  onChange,
  shown,
}: {
  filters: Filters
  onChange: (next: Filters) => void
  shown: number
}) {
  const t = useTranslator(useSettingsStore((state) => state.locale))
  const status = useProgressStore((state) => state.status)
  const favorites = useProgressStore((state) => state.favorites)
  const passed = countPassed(status)

  const patch = (part: Partial<Filters>) => onChange({ ...filters, ...part })
  const isFiltered =
    filters.q !== '' || filters.difficulty !== '' || filters.status !== '' || filters.tag !== ''

  const statusCounts: Record<string, number> = {
    todo: CHALLENGES.length - passed,
    attempted: Object.values(status).filter((value) => value === 'attempted').length,
    passed,
    favorite: favorites.length,
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={filters.q}
          onChange={(event) => patch({ q: event.target.value })}
          placeholder={t('home.searchPlaceholder')}
          className="h-9 min-w-[220px] flex-1 rounded-lg border border-border bg-bg px-3 text-sm text-fg placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <span className="text-xs text-muted">{t('home.showing', { shown, total: CHALLENGES.length })}</span>
        {isFiltered ? (
          <Button size="sm" variant="ghost" onClick={() => onChange(EMPTY_FILTERS)}>
            {t('home.clearFilters')}
          </Button>
        ) : null}
      </div>

      <Row label={t('home.filterDifficulty')}>
        <Chip
          active={filters.difficulty === ''}
          onClick={() => patch({ difficulty: '' })}
          label={`${t('home.all')} ${CHALLENGES.length}`}
        />
        {DIFFICULTY_ORDER.map((difficulty) => (
          <Chip
            key={difficulty}
            active={filters.difficulty === difficulty}
            onClick={() => patch({ difficulty })}
            label={`${t(`difficulty.${difficulty}`)} ${COUNTS_BY_DIFFICULTY[difficulty] ?? 0}`}
          />
        ))}
      </Row>

      <Row label={t('home.filterStatus')}>
        <Chip
          active={filters.status === ''}
          onClick={() => patch({ status: '' })}
          label={t('home.all')}
        />
        {STATUSES.map((value) => (
          <Chip
            key={value}
            active={filters.status === value}
            onClick={() => patch({ status: value })}
            label={`${t(`status.${value}`)} ${statusCounts[value] ?? 0}`}
          />
        ))}
        <Chip
          active={filters.status === 'favorite'}
          onClick={() => patch({ status: 'favorite' })}
          label={`★ ${t('status.favorite')} ${favorites.length}`}
        />
      </Row>

      <Row label={t('home.filterTags')}>
        <select
          value={filters.tag}
          onChange={(event) => patch({ tag: event.target.value })}
          className="h-7 rounded-md border border-border bg-bg px-2 text-xs text-fg focus:border-accent focus:outline-none"
        >
          <option value="">{t('home.all')}</option>
          {ALL_TAGS.map((tag) => (
            <option key={tag} value={tag}>
              #{tag}
            </option>
          ))}
        </select>
        {filters.tag ? (
          <span className="text-[11px] text-muted">
            #{filters.tag} · {CHALLENGES.filter((item) => item.tags.includes(filters.tag)).length}
          </span>
        ) : null}
      </Row>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="w-14 shrink-0 text-[11px] text-muted">{label}</span>
      {children}
    </div>
  )
}

function Chip({
  active,
  onClick,
  label,
}: {
  active: boolean
  onClick: () => void
  label: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md border px-2 py-0.5 text-[11px] transition',
        active
          ? 'border-accent/50 bg-accent/10 text-accent'
          : 'border-border bg-surface-muted text-muted hover:text-fg',
      )}
    >
      {label}
    </button>
  )
}
