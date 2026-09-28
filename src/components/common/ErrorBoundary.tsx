import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * 兜底错误边界。
 *
 * 静态站点部署后没有服务端日志可看，渲染期一旦抛错 React 会卸载整棵树，
 * 用户只会看到一片空白。这里把错误显示出来（含组件栈），便于自助排查。
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[type-challenges-web] 渲染出错', error, info.componentStack)
  }

  render(): ReactNode {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="mx-auto flex max-w-2xl flex-col gap-3 p-8">
        <h1 className="text-base font-semibold text-danger">页面渲染出错</h1>
        <pre className="overflow-auto rounded-lg border border-border bg-surface-muted p-3 font-mono text-[11px] whitespace-pre-wrap">
          {error.message}
          {'\n\n'}
          {error.stack}
        </pre>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => this.setState({ error: null })}
            className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-surface-muted"
          >
            重试
          </button>
          <button
            type="button"
            onClick={() => {
              window.localStorage.clear()
              window.location.reload()
            }}
            className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-surface-muted"
          >
            清空本地数据并刷新
          </button>
        </div>
      </div>
    )
  }
}
