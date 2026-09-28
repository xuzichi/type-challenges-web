import { useState } from 'react'
import type { Locale, ReadmeLocale } from '@/judge/types'
import { TYPED_LOCALES, LOCALE_LABELS, readmeLocaleLabel, useTranslator } from '@/i18n'
import { cn } from '@/lib/cn'
import { gistUrl } from '@/lib/gist'
import { pullProgress, pushProgress, testConnection } from '@/lib/syncClient'
import { clearToken, readToken, writeToken } from '@/lib/token'
import { normalizeSnapshot } from '@/lib/sync'
import { emptySnapshot, useProgressStore } from '@/store/progress'
import { useSettingsStore, type QuestionLocale } from '@/store/settings'
import { useSyncStore } from '@/store/sync'
import { Button, Card, Switch } from '@/components/ui'

export default function SettingsPage() {
  const locale = useSettingsStore((state) => state.locale)
  const t = useTranslator(locale)
  const settings = useSettingsStore()

  const progress = useProgressStore()
  const sync = useSyncStore()

  const [tokenState, setTokenState] = useState(() => readToken())
  const [status, setStatus] = useState<{ tone: 'ok' | 'error' | 'info'; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const updateToken = (token: string, remember: boolean) => {
    setTokenState({ token, remember })
    writeToken(token, remember)
  }

  const withBusy = async (action: () => Promise<string>) => {
    setBusy(true)
    setStatus(null)
    try {
      setStatus({ tone: 'ok', text: await action() })
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      setStatus({ tone: 'error', text: t('sync.testFail', { message }) })
    } finally {
      setBusy(false)
    }
  }

  const exportProgress = () => {
    const payload = JSON.stringify(progress.snapshot(), null, 2)
    const blob = new Blob([payload], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `type-challenges-progress-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const importProgress = async (file: File) => {
    try {
      const parsed: unknown = JSON.parse(await file.text())
      const snapshot = normalizeSnapshot(parsed)
      if (!snapshot) throw new Error('bad format')
      progress.replace(snapshot)
      setStatus({ tone: 'ok', text: t('settings.imported', { count: Object.keys(snapshot.status).length }) })
    } catch {
      setStatus({ tone: 'error', text: t('settings.importFailed') })
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 pb-10">
      <h1 className="text-lg font-semibold">{t('settings.title')}</h1>
      {status ? (
        <div
          className={cn(
            'rounded-lg border px-3 py-2 text-xs',
            status.tone === 'ok'
              ? 'border-success/40 bg-success/10 text-success'
              : status.tone === 'error'
                ? 'border-danger/40 bg-danger/10 text-danger'
                : 'border-border bg-surface-muted text-muted',
          )}
        >
          {status.text}
        </div>
      ) : null}

      <Card className="flex flex-col gap-4 p-4">
        <h2 className="text-sm font-medium">{t('settings.appearance')}</h2>
        <Row label={t('settings.theme')}>
          <div className="flex gap-1">
            {(['dark', 'light'] as const).map((theme) => (
              <Button
                key={theme}
                size="sm"
                variant={settings.theme === theme ? 'primary' : 'outline'}
                onClick={() => settings.setTheme(theme)}
              >
                {theme === 'dark' ? t('settings.themeDark') : t('settings.themeLight')}
              </Button>
            ))}
          </div>
        </Row>
        <Row label={t('settings.language')}>
          <select
            value={locale}
            onChange={(event) => settings.setLocale(event.target.value as Locale)}
            className="h-8 rounded-lg border border-border bg-bg px-2 text-xs"
          >
            {TYPED_LOCALES.map((item) => (
              <option key={item} value={item}>
                {LOCALE_LABELS[item]}
              </option>
            ))}
          </select>
        </Row>
        <Row label={t('settings.questionLanguage')}>
          <select
            value={settings.questionLocale}
            onChange={(event) =>
              settings.setQuestionLocale(event.target.value as QuestionLocale)
            }
            className="h-8 rounded-lg border border-border bg-bg px-2 text-xs"
          >
            <option value="auto">{t('settings.followUi')}</option>
            {(['zh-CN', 'en', 'ja', 'ko', 'pt-BR'] as ReadmeLocale[]).map((item) => (
              <option key={item} value={item}>
                {readmeLocaleLabel(item)}
              </option>
            ))}
          </select>
        </Row>
      </Card>

      <Card className="flex flex-col gap-4 p-4">
        <h2 className="text-sm font-medium">{t('settings.editor')}</h2>
        <Row label={t('settings.editorFontSize')}>
          <input
            type="range"
            min={10}
            max={24}
            value={settings.editorFontSize}
            onChange={(event) => settings.setEditorFontSize(Number(event.target.value))}
            className="w-40 accent-[var(--tc-accent)]"
          />
          <span className="w-8 text-xs text-muted">{settings.editorFontSize}</span>
        </Row>
        <Switch
          checked={settings.editorMinimap}
          onChange={settings.setEditorMinimap}
          label={t('settings.editorMinimap')}
        />
        <Switch
          checked={settings.editorWordWrap}
          onChange={settings.setEditorWordWrap}
          label={t('settings.editorWordWrap')}
        />
        <Switch
          checked={settings.autoJudge}
          onChange={settings.setAutoJudge}
          label={t('settings.autoJudge')}
          hint={t('settings.autoJudgeHint')}
        />
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="text-sm font-medium">{t('settings.data')}</h2>
        <p className="text-[11px] text-muted">{t('settings.storageHint')}</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={exportProgress}>
            {t('settings.export')}
          </Button>
          <label className="inline-flex h-8 cursor-pointer items-center rounded-md border border-border bg-surface px-2.5 text-xs hover:bg-surface-muted">
            {t('settings.import')}
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void importProgress(file)
                event.target.value = ''
              }}
            />
          </label>
          <Button
            size="sm"
            variant="danger"
            onClick={() => {
              if (!window.confirm(t('settings.clearConfirm'))) return
              progress.replace(emptySnapshot())
              setStatus({ tone: 'info', text: t('settings.cleared') })
            }}
          >
            {t('settings.clear')}
          </Button>
        </div>
      </Card>

      <Card className="flex flex-col gap-3 p-4">
        <h2 className="text-sm font-medium">{t('sync.title')}</h2>
        <p className="text-[11px] leading-relaxed text-muted">{t('sync.desc')}</p>

        <Row label={t('sync.token')}>
          <input
            type="password"
            value={tokenState.token}
            placeholder={t('sync.tokenPlaceholder')}
            onChange={(event) => updateToken(event.target.value, tokenState.remember)}
            className="h-8 min-w-[220px] flex-1 rounded-lg border border-border bg-bg px-2 font-mono text-xs"
          />
        </Row>
        <Switch
          checked={tokenState.remember}
          onChange={(remember) => updateToken(tokenState.token, remember)}
          label={t('sync.rememberToken')}
          hint={t('sync.tokenHint')}
        />

        <div className="flex flex-wrap gap-2">
          <Button
            size="sm"
            disabled={busy || !tokenState.token}
            onClick={() =>
              void withBusy(async () => {
                const viewer = await testConnection()
                return t('sync.testOk', { login: viewer.login })
              })
            }
          >
            {t('sync.test')}
          </Button>
          <Button
            size="sm"
            variant="primary"
            disabled={busy || !tokenState.token}
            onClick={() =>
              void withBusy(async () => {
                const result = await pushProgress()
                return `${t('sync.pushed', { at: new Date(result.updatedAt).toLocaleString() })}`
              })
            }
          >
            {t('sync.push')}
          </Button>
          <Button
            size="sm"
            disabled={busy || !tokenState.token}
            onClick={() =>
              void withBusy(async () => {
                const result = await pullProgress()
                if (!result.merged) return t('sync.never')
                return t('sync.pulled', { at: new Date(result.updatedAt).toLocaleString() })
              })
            }
          >
            {t('sync.pull')}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              clearToken()
              setTokenState({ token: '', remember: false })
              sync.setGistId(undefined)
              setStatus({ tone: 'info', text: t('sync.forgotten') })
            }}
          >
            {t('sync.forget')}
          </Button>
        </div>

        <Switch
          checked={sync.autoPush}
          onChange={sync.setAutoPush}
          label={t('sync.auto')}
        />

        <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted">
          <span>
            {t('sync.lastSync', {
              at: sync.lastSyncAt ? new Date(sync.lastSyncAt).toLocaleString() : t('sync.never'),
            })}
          </span>
          {sync.gistId ? (
            <a className="text-accent hover:underline" href={gistUrl(sync.gistId)} target="_blank" rel="noreferrer">
              {t('sync.gist')} ↗
            </a>
          ) : null}
        </div>
      </Card>
    </div>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="w-32 shrink-0 text-xs text-muted">{label}</span>
      <div className="flex flex-1 items-center gap-2">{children}</div>
    </div>
  )
}
