/**
 * 题单与题目的静态数据。
 *
 * - `index.json` 是轻量索引，列表页直接同步导入；
 * - 每题的完整数据（题面 Markdown + 模板 + 测试用例 + 用例行号映射）拆成独立文件，
 *   由 Vite 的 `import.meta.glob` 变成按需加载的分片，进入某道题时只加载这一题。
 */
import type { Challenge, ChallengeMeta } from '@/judge/types'
import indexJson from '@/data/index.json'
import upstreamJson from '@/data/upstream.json'

export interface UpstreamInfo {
  repo: string
  ref: string
  refHint?: string
  license: string
  sourceUrl: string
  generatedAt: string
  challengeCount: number
}

export const UPSTREAM: UpstreamInfo = upstreamJson as UpstreamInfo

export const CHALLENGES: ChallengeMeta[] = indexJson.challenges as ChallengeMeta[]

export const DIFFICULTY_ORDER = ['warm', 'easy', 'medium', 'hard', 'extreme'] as const

export const CHALLENGE_BY_SLUG = new Map(CHALLENGES.map((item) => [item.slug, item]))
export const CHALLENGE_BY_NO = new Map(CHALLENGES.map((item) => [item.no, item]))

const challengeModules = import.meta.glob<{ default: Challenge }>('../data/challenges/*.json')

export async function loadChallenge(slug: string): Promise<Challenge | undefined> {
  const key = `../data/challenges/${slug}.json`
  const loader = challengeModules[key]
  if (!loader) return undefined
  const module = await loader()
  return module.default
}

/** 全部标签，按出现次数排序，用于筛选栏。 */
export const ALL_TAGS: string[] = (() => {
  const counts = new Map<string, number>()
  for (const challenge of CHALLENGES) {
    for (const tag of challenge.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([tag]) => tag)
})()

export const COUNTS_BY_DIFFICULTY: Record<string, number> = CHALLENGES.reduce<
  Record<string, number>
>((accumulator, challenge) => {
  accumulator[challenge.difficulty] = (accumulator[challenge.difficulty] ?? 0) + 1
  return accumulator
}, {})

export function neighbours(slug: string): {
  prev?: ChallengeMeta
  next?: ChallengeMeta
} {
  const position = CHALLENGES.findIndex((item) => item.slug === slug)
  if (position < 0) return {}
  return {
    prev: position > 0 ? CHALLENGES[position - 1] : undefined,
    next: position < CHALLENGES.length - 1 ? CHALLENGES[position + 1] : undefined,
  }
}
