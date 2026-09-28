#!/usr/bin/env node
/**
 * 真实浏览器端到端冒烟测试 —— 一键运行：
 *
 *   npm run build && npm run test:browser
 *
 * 它自己会拉起 `vite preview` 托管 dist/，然后用本机已安装的 Chrome / Edge
 * （playwright-core + channel，不额外下载浏览器）依次验证：
 *
 *   1. GitHub Pages 风格的深链能打开（history 路由 + SPA 兜底）；
 *   2. Monaco 与 TypeScript Worker 能在真实浏览器里启动；
 *   3. 错误答案判失败，且诊断能归因到具体用例；
 *   4. 正确答案判通过，进度状态变为「已通过」；
 *   5. 绕过 `// @ts-expect-error` 的走捷径答案被 TS2578 拦下（判题正确性的关键保证）；
 *   6. 草稿写入 localStorage，刷新后仍在；
 *   7. 全程没有 JS 报错。
 *
 * 这是 Node 侧 `npm run verify:judge` 的补充：那边验证判题语义，
 * 这边验证"在浏览器里真的跑得起来"。
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const PORT = Number(process.env.SMOKE_PORT ?? 4174)
/** 指定 SMOKE_BASE 时直接跑已部署的站点（例如 https://<user>.github.io/<repo>），不再拉起本地 preview。 */
const EXTERNAL_BASE = process.env.SMOKE_BASE
const BASE = EXTERNAL_BASE ?? `http://localhost:${PORT}`

let chromium
try {
  ;({ chromium } = require('playwright-core'))
} catch {
  console.error('✖ 需要 playwright-core：npm i --no-save playwright-core')
  process.exit(1)
}

const results = []
function check(name, ok, detail) {
  results.push({ name, ok })
  console.log(`${ok ? '✔' : '✖'} ${name}${ok || !detail ? '' : `\n    ${detail}`}`)
}

async function waitForServer(url, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      if (response.ok) return true
    } catch {
      // 还没起来
    }
    await new Promise((resolve) => setTimeout(resolve, 250))
  }
  return false
}

async function launchBrowser() {
  for (const channel of ['chrome', 'msedge']) {
    try {
      return await chromium.launch({ channel, headless: true })
    } catch (error) {
      console.warn(`· 启动 ${channel} 失败：${error.message?.split('\n')[0]}`)
    }
  }
  throw new Error('本机找不到可用的 Chrome / Edge，请先安装其中之一')
}

let viteBin
try {
  viteBin = path.join(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js')
} catch {
  viteBin = path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js')
}

const server = EXTERNAL_BASE
  ? null
  : spawn(
      process.execPath,
      [viteBin, 'preview', '--port', String(PORT), '--strictPort'],
      { cwd: ROOT, stdio: 'ignore' },
    )

let browser
try {
  if (!(await waitForServer(`${BASE}/`))) {
    throw new Error(
      EXTERNAL_BASE
        ? `站点 ${BASE} 不可达`
        : `vite preview 未能在 ${PORT} 端口就绪（先执行 npm run build）`,
    )
  }

  browser = await launchBrowser()
  const context = await browser.newContext({ locale: 'zh-CN', viewport: { width: 1440, height: 900 } })
  const page = await context.newPage()

  const consoleErrors = []
  const badResponses = []
  page.on('pageerror', (error) => consoleErrors.push(`pageerror: ${error.message}`))
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(`console: ${message.text()}`)
  })
  page.on('response', (response) => {
    if (response.status() >= 400) {
      badResponses.push({
        status: response.status(),
        type: response.request().resourceType(),
        url: response.url(),
      })
    }
  })

  const setAnswer = async (text) => {
    await page.locator('.monaco-editor').first().click()
    await page.keyboard.press('Control+a')
    await page.keyboard.insertText(text)
  }
  const runCheck = () => page.getByRole('button', { name: '运行检测' }).click()

  // -------------------------------------------------- 深链直达题目页
  await page.goto(`${BASE}/challenge/00004-easy-pick`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.monaco-editor', { timeout: 90_000 })
  check('深链 /challenge/00004-easy-pick 能打开并加载编辑器', true)

  const heading = await page.locator('h1').first().textContent()
  check('题目标题按中文显示', heading?.includes('实现 Pick') ?? false, `实际：${heading}`)

  // -------------------------------------------------- 错误答案判失败
  await setAnswer(
    'type MyPick<T, K extends PropertyKey> = { [P in K]: P extends keyof T ? T[P] : never }\n',
  )
  await runCheck()
  await page.waitForSelector('text=/还有 \\d+ 处错误/', { timeout: 30_000 })
  const failText = await page.locator('body').innerText()
  check('错误答案被判定为失败', /还有 \d+ 处错误/.test(failText))
  check('诊断归因到具体用例', /cases #\d/.test(failText), failText.slice(0, 400))

  // -------------------------------------------------- 正确答案判通过
  await setAnswer("type MyPick<T, K extends keyof T> = { [P in K]: T[P] }\n")
  await runCheck()
  await page.waitForSelector('text=全部用例通过', { timeout: 30_000 })
  check('正确答案被判定为全部通过', true)
  check('状态变为「已通过」', (await page.locator('body').innerText()).includes('已通过'))

  // ------------------------- 绕过 @ts-expect-error 的答案必须被 TS2578 拦下
  await setAnswer('type MyPick<T, K extends PropertyKey> = Pick<T, Extract<K, keyof T>>\n')
  await runCheck()
  await page.waitForSelector('text=/TS2578/', { timeout: 30_000 })
  check('绕过 @ts-expect-error 的走捷径答案被 TS2578 拦下', true)

  // -------------------------------------------------- 草稿持久化
  await setAnswer('type MyPick<T, K extends keyof T> = { [P in K]: T[P] } // draft-marker\n')
  await page.waitForTimeout(1200)
  await page.reload({ waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.monaco-editor', { timeout: 90_000 })
  const restored = await page.locator('.monaco-editor').first().innerText()
  check('刷新后草稿被恢复', restored.includes('draft-marker'), restored.slice(0, 200))

  // -------------------------------------------------- 题单页
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('text=难度', { timeout: 20_000 })
  const homeText = await page.locator('body').innerText()
  check('题单页渲染（难度筛选 + 题卡）', homeText.includes('#4') && homeText.includes('实现 Pick'))

  // -------------------------------- 切到另一道题：编辑器不能残留上一题的代码
  await page.goto(`${BASE}/challenge/00007-easy-readonly`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.monaco-editor', { timeout: 90_000 })
  await page.waitForTimeout(1500)
  const second = await page.locator('.monaco-editor').first().innerText()
  check(
    '切题后编辑器加载新题模板（无上一题残留）',
    second.includes('MyReadonly') && !second.includes('draft-marker') && !second.includes('MyPick'),
    second.slice(0, 200),
  )

  // -------------------------------------------------- 进度页 / 设置页
  await page.goto(`${BASE}/progress`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('text=总进度', { timeout: 20_000 })
  check('进度页渲染', (await page.locator('body').innerText()).includes('按难度'))

  await page.goto(`${BASE}/settings`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('text=云端同步', { timeout: 20_000 })
  const settingsText = await page.locator('body').innerText()
  check('设置页渲染（含云同步与本地数据）', settingsText.includes('GitHub Token') && settingsText.includes('导出进度'))

  // 部署在 GitHub Pages 时，深链本身就是靠 404.html 兜底的，所以文档请求会带 404 状态码
  // （这是 Pages 的行为，不是本站的 bug）。真正要断言的是：**没有任何静态资源加载失败**，
  // 且除了那些预期的文档 404 之外没有其它 JS 报错。
  const assetFailures = badResponses.filter((item) => item.type !== 'document')
  check(
    `静态资源全部加载成功（404 仅来自深链的 SPA 兜底文档请求：${badResponses.length} 个）`,
    assetFailures.length === 0,
    JSON.stringify(assetFailures.slice(0, 5), null, 2),
  )
  const realErrors = consoleErrors.filter((text) => !/Failed to load resource/.test(text))
  check('除上述预期 404 外没有 JS 报错', realErrors.length === 0, realErrors.slice(0, 6).join('\n    '))
} catch (error) {
  check('冒烟测试流程未抛异常', false, String(error))
} finally {
  await browser?.close()
  server?.kill()
}

const failed = results.filter((item) => !item.ok).length
console.log(`\n${failed ? '✖' : '✔'} 浏览器冒烟测试：${results.length - failed}/${results.length} 通过`)
process.exit(failed ? 1 : 0)
