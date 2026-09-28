import type { Difficulty } from '@/judge/types'
import { cn } from '@/lib/cn'
import { useTranslator } from '@/i18n'
import { useSettingsStore } from '@/store/settings'

export function DifficultyBadge({
  difficulty,
  className,
}: {
  difficulty: Difficulty
  className?: string
}) {
  const t = useTranslator(useSettingsStore((state) => state.locale))
  return (
    <span
      className={cn(
        'tc-diff inline-flex items-center rounded-md border px-1.5 py-0.5 text-[11px] leading-4 font-medium',
        `tc-diff-${difficulty}`,
        className,
      )}
    >
      {t(`difficulty.${difficulty}`)}
    </span>
  )
}
