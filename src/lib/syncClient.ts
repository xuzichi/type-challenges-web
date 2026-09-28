import { buildPayload, fetchViewer, pull, push } from './gist'
import { readToken } from './token'
import { mergeSnapshots } from './sync'
import { useProgressStore } from '@/store/progress'
import { useSyncStore } from '@/store/sync'

/**
 * 同步动作的编排层：把「进度 store + Token + Gist API + 合并策略」拼在一起。
 * 拉取永远走「合并」而不是「覆盖」，避免多设备互相抹掉进度。
 */

export class MissingTokenError extends Error {
  constructor() {
    super('missing-token')
    this.name = 'MissingTokenError'
  }
}

function requireToken(): string {
  const { token } = readToken()
  if (!token) throw new MissingTokenError()
  return token
}

export async function testConnection(): Promise<{ login: string }> {
  return await fetchViewer(requireToken())
}

export async function pushProgress(): Promise<{ gistId: string; updatedAt: string }> {
  const token = requireToken()
  const snapshot = useProgressStore.getState().snapshot()
  const remote = await push(token, buildPayload(snapshot))
  const sync = useSyncStore.getState()
  sync.setGistId(remote.id)
  sync.setLastSyncAt(remote.updatedAt)
  return { gistId: remote.id, updatedAt: remote.updatedAt }
}

export interface PullResult {
  updatedAt: string
  /** 远端没有进度文件时为 false，此时本地保持不变。 */
  merged: boolean
}

export async function pullProgress(): Promise<PullResult> {
  const token = requireToken()
  const remote = await pull(token)
  const sync = useSyncStore.getState()

  if (!remote) {
    sync.setLastSyncAt(new Date().toISOString())
    return { updatedAt: new Date().toISOString(), merged: false }
  }

  const local = useProgressStore.getState().snapshot()
  const merged = mergeSnapshots(local, remote.payload.progress)
  useProgressStore.getState().replace(merged)

  sync.setGistId(remote.id)
  sync.setLastSyncAt(remote.updatedAt)
  return { updatedAt: remote.updatedAt, merged: true }
}

/** 后台自动上传：失败不影响使用，只把错误留在控制台。 */
export function autoPushSilently(): void {
  const { autoPush } = useSyncStore.getState()
  const { token } = readToken()
  if (!autoPush || !token) return
  void pushProgress().catch((error: unknown) => {
    console.warn('[type-challenges-web] 自动同步失败：', error)
  })
}
