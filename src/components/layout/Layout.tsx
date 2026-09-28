import { NavLink, Outlet } from 'react-router-dom'
import { useEffect } from 'react'
import { CHALLENGES } from '@/lib/data'
import { cn } from '@/lib/cn'
import { useTranslator } from '@/i18n'
import { countPassed, useProgressStore } from '@/store/progress'
import { useSettingsStore } from '@/store/settings'
import { ProgressBar } from '@/components/ui'

export function Layout() {
  const t = useTranslator(useSettingsStore((state) => state.locale))
  const theme = useSettingsStore((state) => state.theme)
  const toggleTheme = useSettingsStore((state) => state.toggleTheme)
  const status = useProgressStore((state) => state.status)
  const passed = countPassed(status)
  const locale = useSettingsStore((state) => state.locale)

  useEffect(() => {
    document.documentElement.dataset.theme = theme
  }, [theme])

  useEffect(() => {
    document.documentElement.lang = locale
  }, [locale])

  return (
    <div className="flex min-h-full flex-col bg-bg text-fg">
      <header className="sticky top-0 z-20 border-b border-border bg-bg/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-[1600px] items-center gap-3 px-4">
          <NavLink to="/" className="flex min-w-0 items-center gap-2.5">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-accent font-mono text-[13px] font-bold text-accent-fg">
              TS
            </span>
            <span className="truncate text-sm font-semibold">{t('app.title')}</span>
          </NavLink>

          <nav className="ml-2 flex items-center gap-1">
            <NavItem to="/" label={t('nav.challenges')} />
            <NavItem to="/progress" label={t('nav.progress')} />
            <NavItem to="/settings" label={t('nav.settings')} />
          </nav>

          <div className="ml-auto flex items-center gap-3">
            <div className="hidden items-center gap-2 sm:flex">
              <span className="text-xs text-muted">
                {t('home.progressSummary', { passed, total: CHALLENGES.length })}
              </span>
              <ProgressBar
                value={passed}
                total={CHALLENGES.length}
                className="w-24"
              />
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              title={theme === 'dark' ? t('theme.toLight') : t('theme.toDark')}
              className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted transition hover:bg-surface-muted hover:text-fg"
            >
              {theme === 'dark' ? '☾' : '☀'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1600px] flex-1 flex-col px-4 py-4">
        <Outlet />
      </main>

      <footer className="border-t border-border px-4 py-3">
        <div className="mx-auto flex w-full max-w-[1600px] flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted">
          <span>{t('app.tagline')}</span>
        </div>
      </footer>
    </div>
  )
}

function NavItem({ to, label }: { to: string; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        cn(
          'rounded-lg px-2.5 py-1.5 text-xs font-medium transition',
          isActive ? 'bg-surface-muted text-fg' : 'text-muted hover:bg-surface-muted hover:text-fg',
        )
      }
    >
      {label}
    </NavLink>
  )
}
