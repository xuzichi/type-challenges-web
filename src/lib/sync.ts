import type { ChallengeStatus, ProgressSnapshot } from '@/store/progress'
import { PROGRESS_VERSION, STATUS_RANK, emptySnapshot } from '@/store/progress'

/**
 * 合并两份进度快照（本地 vs 远端）。
 *
 * 无后端同步最容易出问题的就是"谁覆盖谁"，所以规则写死在这里并保持单调：
 *  - 状态只升不降（passed > attempted > todo），不会因为一次拉取丢掉做过的题；
 *  - 草稿按 draftUpdatedAt 取更新的那份；
 *  - 收藏取并集；
 *  - passedAt 取最早的一次（首次通过时间）；
 *  - lastVisited 取最近一次。
 * 因此 `merge(a, b)` 与 `merge(b, a)` 结果等价，重复同步不会丢数据。
 */
function laterIso(left?: string, right?: string): string | undefined {
  if (!left) return right
  if (!right) return left
  return left >= right ? left : right
}

function earlierIso(left?: string, right?: string): string | undefined {
  if (!left) return right
  if (!right) return left
  return left <= right ? left : right
}

function maxStatus(left?: ChallengeStatus, right?: ChallengeStatus): ChallengeStatus | undefined {
  if (!left) return right
  if (!right) return left
  return STATUS_RANK[left] >= STATUS_RANK[right] ? left : right
}

export function mergeSnapshots(local: ProgressSnapshot, remote: ProgressSnapshot): ProgressSnapshot {
  const status: Record<string, ChallengeStatus> = {}
  for (const slug of new Set([...Object.keys(local.status), ...Object.keys(remote.status)])) {
    const merged = maxStatus(local.status[slug], remote.status[slug])
    if (merged) status[slug] = merged
  }

  const drafts: Record<string, string> = {}
  const draftUpdatedAt: Record<string, string> = {}
  for (const slug of new Set([...Object.keys(local.drafts), ...Object.keys(remote.drafts)])) {
    const localAt = local.draftUpdatedAt[slug]
    const remoteAt = remote.draftUpdatedAt[slug]
    const preferRemote =
      remoteAt !== undefined && (localAt === undefined || remoteAt > localAt)
    const source = preferRemote ? remote : local
    const code = source.drafts[slug]
    if (code === undefined) continue
    drafts[slug] = code
    const at = preferRemote ? remoteAt : localAt
    if (at) draftUpdatedAt[slug] = at
  }

  const passedAt: Record<string, string> = {}
  for (const slug of new Set([...Object.keys(local.passedAt), ...Object.keys(remote.passedAt)])) {
    const merged = earlierIso(local.passedAt[slug], remote.passedAt[slug])
    if (merged) passedAt[slug] = merged
  }

  const lastVisited = (() => {
    const a = local.lastVisited
    const b = remote.lastVisited
    if (!a) return b
    if (!b) return a
    return a.at >= b.at ? a : b
  })()

  const favoriteSet = new Set([...local.favorites, ...remote.favorites])

  return {
    version: PROGRESS_VERSION,
    status,
    drafts,
    draftUpdatedAt,
    passedAt,
    favorites: [...favoriteSet].filter((slug) => typeof slug === 'string'),
    ...(lastVisited ? { lastVisited } : {}),
    updatedAt: laterIso(local.updatedAt, remote.updatedAt) ?? new Date().toISOString(),
  }
}

/** 校验来自文件 / Gist 的快照，容错地补齐缺失字段。 */
export function normalizeSnapshot(value: unknown): ProgressSnapshot | null {
  if (!value || typeof value !== 'object') return null
  const candidate = value as Partial<ProgressSnapshot>
  if (!candidate.status || typeof candidate.status !== 'object') return null

  const base = emptySnapshot()
  const status: Record<string, ChallengeStatus> = {}
  for (const [slug, statusValue] of Object.entries(candidate.status)) {
    if (statusValue === 'todo' || statusValue === 'attempted' || statusValue === 'passed') {
      status[slug] = statusValue
    }
  }

  const drafts: Record<string, string> = {}
  for (const [slug, code] of Object.entries(candidate.drafts ?? {})) {
    if (typeof code === 'string') drafts[slug] = code
  }

  const draftUpdatedAt: Record<string, string> = {}
  for (const [slug, at] of Object.entries(candidate.draftUpdatedAt ?? {})) {
    if (typeof at === 'string') draftUpdatedAt[slug] = at
  }

  const passedAt: Record<string, string> = {}
  for (const [slug, at] of Object.entries(candidate.passedAt ?? {})) {
    if (typeof at === 'string') passedAt[slug] = at
  }

  return {
    version: PROGRESS_VERSION,
    status,
    drafts,
    draftUpdatedAt,
    passedAt,
    favorites: Array.isArray(candidate.favorites)
      ? candidate.favorites.filter((slug): slug is string => typeof slug === 'string')
      : [],
    ...(candidate.lastVisited && typeof candidate.lastVisited === 'object'
      ? { lastVisited: candidate.lastVisited }
      : {}),
    updatedAt: typeof candidate.updatedAt === 'string' ? candidate.updatedAt : base.updatedAt,
  }
}
