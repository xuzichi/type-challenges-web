import { create } from 'zustand'
import { persist } from 'zustand/middleware'

interface SyncState {
  gistId?: string
  lastSyncAt?: string
  /** 通过题目后自动上传 */
  autoPush: boolean
  setGistId: (id: string | undefined) => void
  setLastSyncAt: (at: string) => void
  setAutoPush: (value: boolean) => void
}

export const SYNC_STORAGE_KEY = 'tc:sync:v1'

export const useSyncStore = create<SyncState>()(
  persist(
    (set) => ({
      autoPush: true,
      setGistId: (gistId) => set({ gistId }),
      setLastSyncAt: (lastSyncAt) => set({ lastSyncAt }),
      setAutoPush: (autoPush) => set({ autoPush }),
    }),
    { name: SYNC_STORAGE_KEY, version: 1 },
  ),
)
