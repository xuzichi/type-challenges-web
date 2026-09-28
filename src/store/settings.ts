import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { Locale, ReadmeLocale } from '@/judge/types'
import { detectLocale } from '@/i18n'

export type Theme = 'dark' | 'light'

/** 题面语言：'auto' 跟随界面语言，也可以直接指定上游存在的某一种。 */
export type QuestionLocale = 'auto' | ReadmeLocale

export interface SettingsState {
  locale: Locale
  questionLocale: QuestionLocale
  theme: Theme
  editorFontSize: number
  editorMinimap: boolean
  editorWordWrap: boolean
  autoJudge: boolean
  setLocale: (locale: Locale) => void
  setQuestionLocale: (locale: QuestionLocale) => void
  setTheme: (theme: Theme) => void
  toggleTheme: () => void
  setEditorFontSize: (size: number) => void
  setEditorMinimap: (value: boolean) => void
  setEditorWordWrap: (value: boolean) => void
  setAutoJudge: (value: boolean) => void
}

export const SETTINGS_STORAGE_KEY = 'tc:settings:v1'

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      locale: detectLocale(),
      questionLocale: 'auto',
      theme: 'dark',
      editorFontSize: 14,
      editorMinimap: false,
      editorWordWrap: true,
      autoJudge: true,
      setLocale: (locale) => set({ locale }),
      setQuestionLocale: (questionLocale) => set({ questionLocale }),
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === 'dark' ? 'light' : 'dark' }),
      setEditorFontSize: (editorFontSize) =>
        set({ editorFontSize: Math.min(24, Math.max(10, Math.round(editorFontSize))) }),
      setEditorMinimap: (editorMinimap) => set({ editorMinimap }),
      setEditorWordWrap: (editorWordWrap) => set({ editorWordWrap }),
      setAutoJudge: (autoJudge) => set({ autoJudge }),
    }),
    { name: SETTINGS_STORAGE_KEY, version: 1 },
  ),
)

/** 解析出该题真正使用的题面语言，找不到指定/对应语言时回退英文。 */
export function resolveReadmeLocale(
  available: readonly ReadmeLocale[],
  preferred: QuestionLocale,
): ReadmeLocale {
  if (preferred !== 'auto' && available.includes(preferred)) return preferred
  if (preferred === 'auto') {
    const ui = useSettingsStore.getState().locale
    if (available.includes(ui)) return ui
  }
  return available.includes('en') ? 'en' : (available[0] ?? 'en')
}
