import { useMemo } from 'react'
import { renderMarkdown } from '@/lib/markdown'
import { cn } from '@/lib/cn'

/**
 * 题面渲染。内容来自构建期固化的上游 README，但仍然按不可信输入做 sanitize。
 */
export function Markdown({ markdown, className }: { markdown: string; className?: string }) {
  const html = useMemo(() => renderMarkdown(markdown), [markdown])
  return (
    <div
      className={cn('tc-prose', className)}
      // eslint-disable-next-line react/no-danger
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
