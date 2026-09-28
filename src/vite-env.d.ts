/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** 路由模式：默认 history 路由（配合 404.html 兜底），设为 'hash' 可切换到 hash 路由。 */
  readonly VITE_ROUTER_MODE?: 'browser' | 'hash'
  /** 部署 base 路径，CI 由 actions/configure-pages 提供。 */
  readonly VITE_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
