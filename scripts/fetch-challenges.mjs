#!/usr/bin/env node
/**
 * 从 type-challenges 上游仓库拉取题目数据，生成站点所需的静态 JSON。
 *
 * 用法：
 *   node scripts/fetch-challenges.mjs                     # 使用 scripts/upstream.json 锁定的 ref
 *   node scripts/fetch-challenges.mjs --refresh           # 忽略本地缓存，强制重新下载
 *   node scripts/fetch-challenges.mjs --ref main          # 临时指定 ref（不写回 upstream.json）
 *
 * 产物（全部提交进仓库，CI 构建时不再访问网络）：
 *   src/data/upstream.json                   上游版本元信息
 *   src/data/index.json                      题单索引（轻量，列表页用）
 *   src/data/challenges/<slug>.json           每题的完整数据（按需动态加载）
 *   src/data/type-challenges-utils.json     上游断言工具的 .d.ts 源码
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import * as tar from 'tar'
import { parse as parseYaml } from 'yaml'
import { extractCaseEntries, hasUtilsImport } from '../shared/judge-core.mjs'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '..')
const DATA_DIR = path.join(ROOT, 'src', 'data')
const CHALLENGES_DIR = path.join(DATA_DIR, 'challenges')
const CACHE_DIR = path.join(ROOT, 'node_modules', '.cache', 'type-challenges')

/** 上游 README 存在的语言；'en' 是默认语言，其余按需回退到 'en'。 */
const LOCALES = ['en', 'zh-CN', 'ja', 'ko', 'pt-BR']
const DIFFICULTY_ORDER = ['warm', 'easy', 'medium', 'hard', 'extreme', 'pending']
const FOLDER_RE = /^(\d+)-(warm|easy|medium|hard|extreme|pending)-(.+)$/

const upstream = JSON.parse(fs.readFileSync(path.join(__dirname, 'upstream.json'), 'utf8'))

const args = process.argv.slice(2)
const refresh = args.includes('--refresh')
const refIndex = args.indexOf('--ref')
const ref = refIndex >= 0 ? args[refIndex + 1] : upstream.ref
if (refIndex >= 0 && !ref) fatal('--ref 需要一个值，例如 --ref main')

function fatal(message) {
  console.error(`✖ ${message}`)
  process.exit(1)
}

function info(message) {
  console.log(`· ${message}`)
}

function cleanReadme(text) {
  if (!text) return undefined
  const cleaned = text
    .replace(/<!--info-header-start-->[\s\S]*?<!--info-header-end-->/g, '')
    .replace(/<!--info-footer-start-->[\s\S]*?<!--info-footer-end-->/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim()
  return cleaned || undefined
}

function normalizeAuthor(author) {
  if (!author) return undefined
  if (typeof author === 'string') return { name: author }
  const result = {}
  for (const key of ['name', 'github', 'email']) {
    const value = author[key]
    if (typeof value === 'string' && value.trim()) result[key] = value.trim()
  }
  return Object.keys(result).length ? result : undefined
}

function toList(value) {
  if (value === null || value === undefined || value === '') return []
  const items = Array.isArray(value) ? value : String(value).split(',')
  return items
    .map((item) => String(item).trim())
    .filter(Boolean)
}

function normalizeTsconfig(tsconfig) {
  if (!tsconfig || typeof tsconfig !== 'object') return undefined
  const result = {}
  for (const [key, value] of Object.entries(tsconfig)) {
    if (value === null || value === undefined) continue
    result[key] = value
  }
  return Object.keys(result).length ? result : undefined
}

function readIfExists(file) {
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined
}

async function download(url, target) {
  info(`下载 ${url}`)
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) fatal(`下载失败：HTTP ${response.status} ${url}`)
  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.writeFileSync(target, Buffer.from(await response.arrayBuffer()))
}

async function prepareSource() {
  const tarball = path.join(CACHE_DIR, `${ref}.tar.gz`)
  const extracted = path.join(CACHE_DIR, ref)

  if (refresh && fs.existsSync(extracted)) fs.rmSync(extracted, { recursive: true, force: true })
  if (!fs.existsSync(tarball)) {
    await download(`https://codeload.github.com/${upstream.repo}/tar.gz/${ref}`, tarball)
  }
  if (!fs.existsSync(extracted)) {
    info(`解压到 ${path.relative(ROOT, extracted)}`)
    fs.mkdirSync(extracted, { recursive: true })
    await tar.x({ file: tarball, cwd: extracted, strip: 1 })
  }
  return extracted
}

function loadChallenges(sourceDir) {
  const questionsDir = path.join(sourceDir, 'questions')
  const folders = fs
    .readdirSync(questionsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && FOLDER_RE.test(entry.name))
    .map((entry) => entry.name)
    .sort()

  return folders.map((folder) => {
    const [, numberPart, difficulty, rest] = FOLDER_RE.exec(folder)
    const dir = path.join(questionsDir, folder)

    const baseInfo = parseYaml(readIfExists(path.join(dir, 'info.yml')) ?? '') ?? {}
    const titles = {}
    const infoByLocale = {}
    for (const locale of LOCALES) {
      const raw = locale === 'en' ? undefined : readIfExists(path.join(dir, `info.${locale}.yml`))
      if (!raw) continue
      const parsed = parseYaml(raw) ?? {}
      infoByLocale[locale] = parsed
      if (typeof parsed.title === 'string' && parsed.title.trim()) titles[locale] = parsed.title.trim()
    }
    if (typeof baseInfo.title === 'string' && baseInfo.title.trim()) titles.en = baseInfo.title.trim()

    const merged = { ...baseInfo, ...Object.assign({}, ...Object.values(infoByLocale)) }

    const readmes = {}
    for (const locale of LOCALES) {
      const file = locale === 'en' ? 'README.md' : `README.${locale}.md`
      const cleaned = cleanReadme(readIfExists(path.join(dir, file)))
      if (cleaned) readmes[locale] = cleaned
    }
    if (!readmes.en && !Object.keys(readmes).length) {
      throw new Error(`${folder} 缺少 README`)
    }

    const template = readIfExists(path.join(dir, 'template.ts')) ?? ''
    const tests = readIfExists(path.join(dir, 'test-cases.ts'))
    if (tests === undefined) throw new Error(`${folder} 缺少 test-cases.ts`)

    return {
      no: Number(numberPart),
      slug: folder,
      difficulty,
      tags: toList(merged.tags),
      related: toList(merged.related)
        .map((value) => Number.parseInt(value, 10))
        .filter((value) => Number.isFinite(value)),
      author: normalizeAuthor(merged.author),
      tsconfig: normalizeTsconfig(merged.tsconfig),
      titles,
      // ChallengeMeta 约定的字段：题面可用语言
      locales: Object.keys(readmes),
      readmes,
      template,
      tests,
      cases: extractCaseEntries(tests),
      hasUtilsImport: hasUtilsImport(tests),
    }
  })
}

function toMeta(challenge) {
  return {
    no: challenge.no,
    slug: challenge.slug,
    difficulty: challenge.difficulty,
    tags: challenge.tags,
    related: challenge.related,
    titles: challenge.titles,
    locales: challenge.locales,
  }
}

async function main() {
  const sourceDir = await prepareSource()
  info('解析题目…')
  const challenges = loadChallenges(sourceDir)

  const missingTitles = challenges.filter((item) => !item.titles.en)
  if (missingTitles.length) {
    fatal(`以下题目缺少英文标题：${missingTitles.map((item) => item.slug).join(', ')}`)
  }
  const missingImport = challenges.filter((item) => !item.hasUtilsImport)

  const utilsSource = readIfExists(path.join(sourceDir, 'utils', 'index.d.ts'))
  if (!utilsSource) fatal('上游 utils/index.d.ts 缺失')

  fs.rmSync(CHALLENGES_DIR, { recursive: true, force: true })
  fs.mkdirSync(CHALLENGES_DIR, { recursive: true })

  challenges.sort(
    (a, b) =>
      DIFFICULTY_ORDER.indexOf(a.difficulty) - DIFFICULTY_ORDER.indexOf(b.difficulty) ||
      a.no - b.no,
  )

  for (const challenge of challenges) {
    fs.writeFileSync(
      path.join(CHALLENGES_DIR, `${challenge.slug}.json`),
      `${JSON.stringify(challenge)}\n`,
    )
  }

  fs.writeFileSync(
    path.join(DATA_DIR, 'index.json'),
    `${JSON.stringify({ challenges: challenges.map(toMeta) }, null, 2)}\n`,
  )
  fs.writeFileSync(
    path.join(DATA_DIR, 'type-challenges-utils.json'),
    `${JSON.stringify({ source: utilsSource }, null, 2)}\n`,
  )
  fs.writeFileSync(
    path.join(DATA_DIR, 'upstream.json'),
    `${JSON.stringify(
      {
        repo: upstream.repo,
        ref,
        refHint: ref === upstream.ref ? upstream.refHint : undefined,
        license: upstream.license,
        sourceUrl: `https://github.com/${upstream.repo}/tree/${ref}`,
        generatedAt: new Date().toISOString(),
        challengeCount: challenges.length,
      },
      null,
      2,
    )}\n`,
  )

  const byDifficulty = DIFFICULTY_ORDER.map(
    (difficulty) =>
      `${difficulty}: ${challenges.filter((item) => item.difficulty === difficulty).length}`,
  ).join('  ')
  info(`共 ${challenges.length} 题  (${byDifficulty})`)
  info(`含中文题面：${challenges.filter((item) => item.readmes['zh-CN']).length} 题`)
  info(`含用例条目：${challenges.filter((item) => item.cases.length).length} 题`)
  if (missingImport.length) {
    info(`提示：${missingImport.length} 题未直接 import @type-challenges/utils（按原样判题）`)
  }
  info(`产物写入 ${path.relative(ROOT, DATA_DIR)}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
