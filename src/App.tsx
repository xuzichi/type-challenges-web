import { lazy, Suspense } from 'react'
import { BrowserRouter, HashRouter, Route, Routes } from 'react-router-dom'
import { Layout } from '@/components/layout/Layout'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'

const HomePage = lazy(() => import('@/pages/HomePage'))
const ChallengePage = lazy(() => import('@/pages/ChallengePage'))
const ProgressPage = lazy(() => import('@/pages/ProgressPage'))
const SettingsPage = lazy(() => import('@/pages/SettingsPage'))

/**
 * 路由模式。
 *
 * GitHub Pages 是纯静态托管、没有服务端重写，所以用 history 路由时必须提供
 * `404.html` 兜底（构建脚本会把 index.html 复制一份，见 scripts/postbuild.mjs）。
 * 万一某次部署的 404 兜底不生效，只需要把 `VITE_ROUTER_MODE=hash` 传给构建，
 * 即可无损切到 hash 路由。
 */
const USE_HASH = import.meta.env.VITE_ROUTER_MODE === 'hash'
const BASE = import.meta.env.BASE_URL
const BASENAME = BASE === '/' || BASE === '' ? undefined : BASE.replace(/\/$/, '')

export function App() {
  const Router = USE_HASH ? HashRouter : BrowserRouter
  return (
    <Router basename={USE_HASH ? undefined : BASENAME}>
      <ErrorBoundary>
        <Suspense fallback={null}>
          <Routes>
            <Route element={<Layout />}>
              <Route index element={<HomePage />} />
              <Route path="challenge/:slug" element={<ChallengePage />} />
              <Route path="progress" element={<ProgressPage />} />
              <Route path="settings" element={<SettingsPage />} />
              <Route path="*" element={<HomePage />} />
            </Route>
          </Routes>
        </Suspense>
      </ErrorBoundary>
    </Router>
  )
}
