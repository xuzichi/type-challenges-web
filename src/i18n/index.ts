import { useMemo } from 'react'
import type { Locale, ReadmeLocale } from '@/judge/types'
import { MESSAGES, translate } from './messages'

export type Translate = (key: string, vars?: Record<string, string | number>) => string

/** 按系统语言猜一个默认界面语言。 */
export function detectLocale(): Locale {
  if (typeof navigator === 'undefined') return 'zh-CN'
  const language = (navigator.languages?.[0] ?? navigator.language ?? '').toLowerCase()
  return language.startsWith('zh') ? 'zh-CN' : 'en'
}

/** 界面语言名称，用于语言选择器。 */
export const LOCALE_LABELS: Record<Locale, string> = {
  'zh-CN': '简体中文',
  en: 'English',
}

const README_LOCALE_LABELS: Record<ReadmeLocale, string> = {
  en: 'English',
  'zh-CN': '简体中文',
  ja: '日本語',
  ko: '한국어',
  'pt-BR': 'Português',
}

export function readmeLocaleLabel(locale: ReadmeLocale): string {
  return README_LOCALE_LABELS[locale] ?? locale
}

export const TYPED_LOCALES = Object.keys(MESSAGES) as Locale[]

/** 取某个语言的翻译函数（非 React 环境也能用）。 */
export function createTranslator(locale: Locale): Translate {
  return (key, vars) => translate(locale, key, vars)
}

/** React 里取翻译函数。 */
export function useTranslator(locale: Locale): Translate {
  return useMemo(() => createTranslator(locale), [locale])
}

