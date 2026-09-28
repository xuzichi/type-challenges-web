/**
 * 与 GitHub Gist 的交互（纯浏览器、无后端）。
 *
 * 进度快照存成 Gist 里的一个 JSON 文件，用户可以用自己的 Token 在任意设备拉取/推送。
 * 这里只依赖 GitHub REST API 的 CORS 支持，不需要任何服务端组件 —— 这正是能部署在
 * GitHub Pages 上的关键。
 */
import type { ProgressSnapshot } from '@/store/progress'
import { PROGRESS_VERSION } from '@/store/progress'

const API = 'https://api.github.com'
export const GIST_FILENAME = 'type-challenges-web-progress.json'
const GIST_DESCRIPTION = 'type-challenges-web progress (auto-generated, safe to delete)'

export interface SyncPayload {
  /** 载荷格式版本；将来若结构变化可用于迁移。 */
  version: number
  app: string
  device: string
  updatedAt: string
  progress: ProgressSnapshot
}

export interface RemoteGist {
  id: string
  updatedAt: string
  payload: SyncPayload
}

export class GistError extends Error {
  readonly status: number | undefined

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'GistError'
    this.status = status
  }
}

async function request<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API}${path}`, {
      ...init,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
        ...init?.headers,
      },
    })
  } catch (error) {
    throw new GistError(`网络错误：${(error as Error).message}`)
  }

  if (!response.ok) {
    let detail = ''
    try {
      const body = (await response.json()) as { message?: string }
      detail = body.message ?? ''
    } catch {
      detail = response.statusText
    }
    throw new GistError(detail || `HTTP ${response.status}`, response.status)
  }

  if (response.status === 204) return undefined as T
  return (await response.json()) as T
}

export function deviceName(): string {
  if (typeof navigator === 'undefined') return 'unknown'
  const ua = navigator.userAgent
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform ??
    navigator.platform ??
    'unknown'
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Firefox\//.test(ua)
      ? 'Firefox'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Safari\//.test(ua)
          ? 'Safari'
          : 'Browser'
  return `${platform} · ${browser}`
}

export function buildPayload(progress: ProgressSnapshot): SyncPayload {
  return {
    version: PROGRESS_VERSION,
    app: 'type-challenges-web',
    device: deviceName(),
    updatedAt: new Date().toISOString(),
    progress,
  }
}

export async function fetchViewer(token: string): Promise<{ login: string }> {
  return await request<{ login: string }>(token, '/user')
}

function isSyncPayload(value: unknown): value is SyncPayload {
  if (!value || typeof value !== 'object') return false
  const payload = value as Partial<SyncPayload>
  return typeof payload.version === 'number' && !!payload.progress
}

interface GistListItem {
  id: string
  updated_at: string
  files?: Record<string, unknown>
}

interface GistResponse {
  id: string
  updated_at: string
  truncated?: boolean
  files: Record<string, { content?: string; truncated?: boolean; raw_url?: string }>
}

/** 在我们的 Gist 里找到那个进度文件（用户也可能手动创建过）。 */
export async function locateGist(token: string): Promise<GistListItem | null> {
  const gists = await request<GistListItem[]>(token, '/gists?per_page=100')
  return gists.find((gist) => gist.files && GIST_FILENAME in gist.files) ?? null
}

async function readPayload(token: string, id: string): Promise<SyncPayload | null> {
  const gist = await request<GistResponse>(token, `/gists/${id}`)
  const file = gist.files[GIST_FILENAME]
  if (!file) return null

  let content = file.content
  if (file.truncated && file.raw_url) {
    const raw = await fetch(file.raw_url)
    if (!raw.ok) throw new GistError(`读取 Gist 原始内容失败：HTTP ${raw.status}`, raw.status)
    content = await raw.text()
  }
  if (!content) return null

  const parsed: unknown = JSON.parse(content)
  if (!isSyncPayload(parsed)) throw new GistError('Gist 中的进度文件格式无法识别')
  return parsed
}

export async function pull(token: string): Promise<RemoteGist | null> {
  const found = await locateGist(token)
  if (!found) return null
  const payload = await readPayload(token, found.id)
  if (!payload) return null
  return { id: found.id, updatedAt: found.updated_at, payload }
}

export async function push(token: string, payload: SyncPayload): Promise<RemoteGist> {
  const content = JSON.stringify(payload, null, 2)
  const body = JSON.stringify({
    description: GIST_DESCRIPTION,
    public: false,
    files: { [GIST_FILENAME]: { content } },
  })

  const existing = await locateGist(token)
  const gist = existing
    ? await request<GistResponse>(token, `/gists/${existing.id}`, { method: 'PATCH', body })
    : await request<GistResponse>(token, '/gists', { method: 'POST', body })

  return { id: gist.id, updatedAt: gist.updated_at, payload }
}

export function gistUrl(id: string): string {
  return `https://gist.github.com/${id}`
}
