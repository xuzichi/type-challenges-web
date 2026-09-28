import DOMPurify from 'dompurify'
import { marked } from 'marked'

marked.setOptions({ gfm: true, breaks: false })

/**
 * 上游 README 里的 info-header / footer（标题、徽章、跳转链接）在数据生成阶段
 * 已经被剥离，这里只需要把 Markdown 渲染成 HTML，并做一次 sanitize。
 * 内容虽然来自可信的上游仓库且已固化进构建产物，但仍按不可信输入处理。
 */
export function renderMarkdown(markdown: string): string {
  const html = marked.parse(markdown, { async: false })
  return DOMPurify.sanitize(html, {
    ADD_ATTR: ['target', 'rel'],
    FORBID_TAGS: ['script', 'style', 'iframe'],
  })
}
