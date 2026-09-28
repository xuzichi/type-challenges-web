import * as monaco from 'monaco-editor'
import { loader } from '@monaco-editor/react'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import TypeScriptWorker from 'monaco-editor/language/typescript/ts.worker?worker'

/**
 * Monaco 的本地化装配。
 *
 * 不使用 @monaco-editor/react 默认的 CDN loader：整个站点要能离线 / 在 GitHub Pages
 * 上自洽运行，编辑器与 TypeScript 语言服务都必须来自本仓库打包的产物。
 *
 * 判题用的就是这里的 TypeScript Worker —— monaco 0.57 内嵌 TypeScript 5.9.3，
 * 与 devDependencies 里的版本一致，因此 `npm run verify:judge` 在 Node 侧验证过的
 * 判题语义（尤其 TS2578 不会被过滤）在浏览器里同样成立。
 */
self.MonacoEnvironment = {
  getWorker(_workerId: string, label: string) {
    if (label === 'typescript' || label === 'javascript') return new TypeScriptWorker()
    return new EditorWorker()
  },
}

loader.config({ monaco })

export { monaco }
