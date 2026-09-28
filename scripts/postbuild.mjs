#!/usr/bin/env node
/**
 * 构建后处理。
 *
 * GitHub Pages 是纯静态托管：访问 /<repo>/challenge/xxx 这样的深链时服务器只会返回 404。
 * 把构建好的 index.html 复制成 404.html 之后，Pages 会用同一份 SPA 接管该路径，
 * 浏览器地址栏保持不变，前端路由即可正常渲染 —— 这是在 Pages 上使用 history 路由的标准做法。
 *
 * 详见 DESIGN.md 的「部署」一节（以及 VITE_ROUTER_MODE=hash 的备选方案）。
 */
import fs from 'node:fs'
import path from 'node:path'

const dist = path.join(process.cwd(), 'dist')
const index = path.join(dist, 'index.html')

if (!fs.existsSync(index)) {
  console.error('✖ 找不到 dist/index.html，请先执行 vite build')
  process.exit(1)
}

fs.copyFileSync(index, path.join(dist, '404.html'))
console.log('✔ 已生成 dist/404.html（GitHub Pages 的 SPA 兜底页）')
