/**
 * GitHub Token 的本地保管。
 *
 * 安全约定：
 *  - Token 只存在这台浏览器里，除了 api.github.com 不会发往任何地方；
 *  - 用户可以选择「记住」（localStorage）或仅本次会话（sessionStorage）；
 *  - 本模块是唯一读写 Token 的地方，方便审计与一键清除。
 */

const TOKEN_KEY = 'tc:github-token'

export interface TokenState {
  token: string
  remember: boolean
}

export function readToken(): TokenState {
  if (typeof window === 'undefined') return { token: '', remember: false }
  // sessionStorage 优先：即便之前"记住"过，本次会话显式设置的应生效
  const session = window.sessionStorage.getItem(TOKEN_KEY)
  if (session) return { token: session, remember: false }
  const local = window.localStorage.getItem(TOKEN_KEY)
  if (local) return { token: local, remember: true }
  return { token: '', remember: false }
}

export function writeToken(token: string, remember: boolean): void {
  if (typeof window === 'undefined') return
  clearToken()
  if (!token) return
  if (remember) window.localStorage.setItem(TOKEN_KEY, token)
  else window.sessionStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(TOKEN_KEY)
  window.sessionStorage.removeItem(TOKEN_KEY)
}
