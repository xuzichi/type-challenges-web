import * as monaco from 'monaco-editor'
import { resolveCompilerOptions } from '@shared/judge-core.mjs'

/**
 * 把 `shared/judge-core.mjs` 里带字符串取值的编译选项，映射成 monaco（也就是 TypeScript）
 * 需要的数值枚举。两边共享同一份定义，Node 侧校验脚本用 ts.convertCompilerOptionsFromJson 做同样的转换。
 *
 * 注意 `lib` 不做转换：它已经是 TypeScript 内部规范化形式（`lib.esnext.d.ts`），
 * 传短名 `esnext` 会报 TS6231。详见 shared/judge-core.mjs 的注释。
 */

const SCRIPT_TARGETS: Record<string, monaco.typescript.ScriptTarget> = {
  es3: monaco.typescript.ScriptTarget.ES3,
  es5: monaco.typescript.ScriptTarget.ES5,
  es6: monaco.typescript.ScriptTarget.ES2015,
  es2015: monaco.typescript.ScriptTarget.ES2015,
  es2016: monaco.typescript.ScriptTarget.ES2016,
  es2017: monaco.typescript.ScriptTarget.ES2017,
  es2018: monaco.typescript.ScriptTarget.ES2018,
  es2019: monaco.typescript.ScriptTarget.ES2019,
  es2020: monaco.typescript.ScriptTarget.ES2020,
  esnext: monaco.typescript.ScriptTarget.ESNext,
  latest: monaco.typescript.ScriptTarget.Latest,
}

const MODULE_KINDS: Record<string, monaco.typescript.ModuleKind> = {
  none: monaco.typescript.ModuleKind.None,
  commonjs: monaco.typescript.ModuleKind.CommonJS,
  amd: monaco.typescript.ModuleKind.AMD,
  umd: monaco.typescript.ModuleKind.UMD,
  system: monaco.typescript.ModuleKind.System,
  es2015: monaco.typescript.ModuleKind.ES2015,
  esnext: monaco.typescript.ModuleKind.ESNext,
}

const MODULE_RESOLUTIONS: Record<string, monaco.typescript.ModuleResolutionKind> = {
  classic: monaco.typescript.ModuleResolutionKind.Classic,
  node: monaco.typescript.ModuleResolutionKind.NodeJs,
  node10: monaco.typescript.ModuleResolutionKind.NodeJs,
  // 题目测试文件本身不 import 任何东西，bundler 解析等价于 NodeJs 解析
  bundler: monaco.typescript.ModuleResolutionKind.NodeJs,
}

export function toMonacoCompilerOptions(
  override?: Record<string, unknown>,
): monaco.typescript.CompilerOptions {
  const resolved = resolveCompilerOptions(override)

  const target = SCRIPT_TARGETS[String(resolved.target).toLowerCase()]
  const module = MODULE_KINDS[String(resolved.module).toLowerCase()]
  const moduleResolution = MODULE_RESOLUTIONS[String(resolved.moduleResolution).toLowerCase()]

  return {
    ...(resolved as monaco.typescript.CompilerOptions),
    ...(target === undefined ? {} : { target }),
    ...(module === undefined ? {} : { module }),
    ...(moduleResolution === undefined ? {} : { moduleResolution }),
  }
}
