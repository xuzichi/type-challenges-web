import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type ChallengeStatus = 'todo' | 'attempted' | 'passed'

export const STATUS_RANK: Record<ChallengeStatus, number> = {
  todo: 0,
  attempted: 1,
  passed: 2,
}

/**
 * 可序列化的进度快照 —— 也是导出文件与 Gist 同步的载荷格式。
 * 一切进度都只存在浏览器本地（localStorage），没有任何后端。
 */
export interface ProgressSnapshot {
  version: number
  status: Record<string, ChallengeStatus>
  drafts: Record<string, string>
  /** 每份草稿的最后修改时间，用于同步时判断哪边更新。 */
  draftUpdatedAt: Record<string, string>
  passedAt: Record<string, string>
  favorites: string[]
  lastVisited?: { slug: string; at: string }
  /** 整个快照的最后修改时间（ISO），同步时用于快速判断是否需要推送。 */
  updatedAt: string
}

export const PROGRESS_VERSION = 1
export const PROGRESS_STORAGE_KEY = 'tc:progress:v1'

export function emptySnapshot(): ProgressSnapshot {
  return {
    version: PROGRESS_VERSION,
    status: {},
    drafts: {},
    draftUpdatedAt: {},
    passedAt: {},
    favorites: [],
    updatedAt: new Date(0).toISOString(),
  }
}

interface ProgressActions {
  setDraft: (slug: string, code: string) => void
  markAttempted: (slug: string) => void
  markPassed: (slug: string) => void
  resetChallenge: (slug: string) => void
  toggleFavorite: (slug: string) => void
  visit: (slug: string) => void
  snapshot: () => ProgressSnapshot
  replace: (snapshot: ProgressSnapshot) => void
}

export type ProgressState = ProgressSnapshot & ProgressActions

function now(): string {
  return new Date().toISOString()
}

export const useProgressStore = create<ProgressState>()(
  persist(
    (set, get) => ({
      ...emptySnapshot(),

      setDraft: (slug, code) =>
        set((state) => ({
          drafts: { ...state.drafts, [slug]: code },
          draftUpdatedAt: { ...state.draftUpdatedAt, [slug]: now() },
          status:
            state.status[slug] === 'passed' ? state.status : { ...state.status, [slug]: 'attempted' },
          updatedAt: now(),
        })),

      markAttempted: (slug) =>
        set((state) => {
          if (state.status[slug] === 'passed' || state.status[slug] === 'attempted') return state
          return { status: { ...state.status, [slug]: 'attempted' }, updatedAt: now() }
        }),

      markPassed: (slug) =>
        set((state) => {
          const firstTime = state.status[slug] !== 'passed'
          return {
            status: { ...state.status, [slug]: 'passed' },
            passedAt: firstTime ? { ...state.passedAt, [slug]: now() } : state.passedAt,
            updatedAt: now(),
          }
        }),

      resetChallenge: (slug) =>
        set((state) => {
          const drafts = { ...state.drafts }
          const draftUpdatedAt = { ...state.draftUpdatedAt }
          const status = { ...state.status }
          delete drafts[slug]
          delete draftUpdatedAt[slug]
          delete status[slug]
          return { drafts, draftUpdatedAt, status, updatedAt: now() }
        }),

      toggleFavorite: (slug) =>
        set((state) => ({
          favorites: state.favorites.includes(slug)
            ? state.favorites.filter((item) => item !== slug)
            : [...state.favorites, slug],
          updatedAt: now(),
        })),

      visit: (slug) => set({ lastVisited: { slug, at: now() } }),

      snapshot: () => {
        const { version, status, drafts, draftUpdatedAt, passedAt, favorites, lastVisited, updatedAt } =
          get()
        return { version, status, drafts, draftUpdatedAt, passedAt, favorites, lastVisited, updatedAt }
      },

      replace: (snapshot) => set({ ...snapshot }),
    }),
    {
      name: PROGRESS_STORAGE_KEY,
      version: PROGRESS_VERSION,
      partialize: (state) => ({
        version: state.version,
        status: state.status,
        drafts: state.drafts,
        draftUpdatedAt: state.draftUpdatedAt,
        passedAt: state.passedAt,
        favorites: state.favorites,
        lastVisited: state.lastVisited,
        updatedAt: state.updatedAt,
      }),
    },
  ),
)

export function countPassed(status: Record<string, ChallengeStatus>): number {
  return Object.values(status).filter((value) => value === 'passed').length
}
