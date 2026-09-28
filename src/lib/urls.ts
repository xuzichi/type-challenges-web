import { compressToEncodedURIComponent } from 'lz-string'
import type { Challenge, Locale } from '@/judge/types'
import { UPSTREAM } from './data'

export const TYPESCRIPT_PLAYGROUND = 'https://www.typescriptlang.org/play'

/** 上游文件在 GitHub 上的地址（固定在数据快照对应的 commit）。 */
export function upstreamFileUrl(path: string): string {
  return `https://github.com/${UPSTREAM.repo}/blob/${UPSTREAM.ref}/${path}`
}

export function readmeUrl(challenge: Challenge, locale: string): string {
  const suffix = locale === 'en' ? '' : `.${locale}`
  return upstreamFileUrl(`questions/${challenge.slug}/README${suffix}.md`)
}

export function challengeDirUrl(challenge: Challenge): string {
  return `https://github.com/${UPSTREAM.repo}/tree/${UPSTREAM.ref}/questions/${challenge.slug}`
}

/** 上游约定：题解都发在带 `answer` 标签的 issue 里，按 reactions 排序。 */
export function solutionsUrl(no: number): string {
  return `https://github.com/${UPSTREAM.repo}/issues?q=${encodeURIComponent(
    `label:${no} label:answer`,
  )}+sort%3Areactions-%2B1-desc`
}

/** 分享解答：走上游的 issue 模板，直接带上题号标题。 */
export function shareAnswerUrl(no: number, title: string, locale: Locale): string {
  const template = locale === 'zh-CN' ? '1-answer.zh-CN.md' : '0-answer.md'
  const labels = locale === 'zh-CN' ? 'answer,zh-CN' : 'answer,en'
  return `https://github.com/${UPSTREAM.repo}/issues/new?labels=${encodeURIComponent(
    labels,
  )}&template=${template}&title=${encodeURIComponent(`${no} - ${title}`)}`
}

const TEXT: Record<
  Locale,
  {
    question: string
    viewOnGithub: string
    share: string
    solutions: string
    more: string
    codeStart: string
    testCases: string
    furtherSteps: string
    difficulties: Record<string, string>
  }
> = {
  'zh-CN': {
    question: '题目',
    viewOnGithub: '在 Github 上查看：',
    share: '分享你的解答：',
    solutions: '查看解答：',
    more: '更多题目：',
    codeStart: '你的代码',
    testCases: '测试用例',
    furtherSteps: '下一步',
    difficulties: {
      warm: '热身',
      easy: '简单',
      medium: '中等',
      hard: '困难',
      extreme: '地狱',
      pending: '待定',
    },
  },
  en: {
    question: 'Question',
    viewOnGithub: 'View on GitHub: ',
    share: 'Share your solutions: ',
    solutions: 'View solutions: ',
    more: 'More Challenges: ',
    codeStart: 'Your Code Here',
    testCases: 'Test Cases',
    furtherSteps: 'Further Steps',
    difficulties: {
      warm: 'warm-up',
      easy: 'easy',
      medium: 'medium',
      hard: 'hard',
      extreme: 'extreme',
      pending: 'pending',
    },
  },
}

function toCommentBlock(text: string): string {
  return `/*\n${text
    .trim()
    .split('\n')
    .map((line) => (line.trim() ? `  ${line}`.trimEnd() : ''))
    .join('\n')}\n*/\n`
}

function toDivider(text: string): string {
  return `\n/* _____________ ${text} _____________ */\n`
}

function resolveTitle(challenge: Challenge, locale: Locale): string {
  return challenge.titles[locale] ?? challenge.titles.en ?? challenge.slug
}

/**
 * 生成与上游 `pnpm generate` 等价的单文件版本，用于「在 Playground 打开」/ 分享。
 * 上游用 `https://tsch.js.org/<no>/play` 跳转到 TypeScript Playground，
 * 我们在这里直接把整题（题面注释 + 答案 + 测试用例）压进 URL，不依赖短链服务。
 */
export function buildPlaygroundCode(
  challenge: Challenge,
  answer: string,
  locale: Locale,
): string {
  const text = TEXT[locale]
  const title = resolveTitle(challenge, locale)
  const readme = challenge.readmes[locale] ?? challenge.readmes.en ?? ''
  const author = challenge.author?.name
    ? `${challenge.author.name}${challenge.author.github ? ` (@${challenge.author.github})` : ''}`
    : 'unknown'
  const difficulty = text.difficulties[challenge.difficulty] ?? challenge.difficulty
  const tags = challenge.tags.map((tag) => `#${tag}`).join(' ')
  const siteUrl = typeof window === 'undefined' ? '' : `${window.location.origin}${import.meta.env.BASE_URL}`

  const header =
    `${challenge.no} - ${title}\n` +
    '-------\n' +
    `by ${author} #${difficulty} ${tags}\n\n` +
    `### ${text.question}\n\n` +
    `${readme}\n\n` +
    `> ${text.viewOnGithub}${upstreamFileUrl(`questions/${challenge.slug}/README.md`)}`

  const footer =
    `\n\n` +
    `> ${text.share}${shareAnswerUrl(challenge.no, title, locale)}\n` +
    `> ${text.solutions}${solutionsUrl(challenge.no)}\n` +
    `> ${text.more}${siteUrl}`

  return (
    toCommentBlock(header) +
    toDivider(text.codeStart) +
    `\n${(answer || challenge.template).trim()}\n` +
    toDivider(text.testCases) +
    `${challenge.tests.trim()}\n` +
    toDivider(text.furtherSteps) +
    toCommentBlock(footer)
  )
}

/**
 * 构造 TypeScript Playground 链接。
 * 显式带上 `strict=true` 与题目的 tsconfig 覆盖，让 Playground 里的报错与本站在线判题一致
 * （上游短链不传 strict，默认比本地开发宽松）。
 */
export function buildPlaygroundUrl(code: string, tsconfig?: Record<string, unknown>): string {
  const config: Record<string, string> = { strict: 'true' }
  for (const [key, value] of Object.entries(tsconfig ?? {})) {
    config[key] = String(value)
  }
  const query = Object.entries(config)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&')
  return `${TYPESCRIPT_PLAYGROUND}?${query}#code/${compressToEncodedURIComponent(code)}`
}
