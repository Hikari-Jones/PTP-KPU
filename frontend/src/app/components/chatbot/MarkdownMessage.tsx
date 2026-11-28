import type { ReactNode } from "react"

/**
 * Small Markdown renderer for chatbot answers: headings, paragraphs, bullet and
 * numbered lists, tables, fenced code, and inline bold / italic / code / links.
 * Renders React elements only (no innerHTML), so model output cannot inject HTML.
 */

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*\s][^*]*\*|\[[^\]]+\]\((?:https?:\/\/|\/)[^)\s]+\))/g

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    const key = `${keyPrefix}-${i}`
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return <strong key={key}>{part.slice(2, -2)}</strong>
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code key={key} className="px-1 py-0.5 rounded bg-black/10 dark:bg-white/10 font-mono text-[0.92em]">
          {part.slice(1, -1)}
        </code>
      )
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return <em key={key}>{part.slice(1, -1)}</em>
    }
    const link = /^\[([^\]]+)\]\(([^)\s]+)\)$/.exec(part)
    if (link) {
      return (
        <a key={key} href={link[2]} target="_blank" rel="noopener noreferrer" className="underline text-red-600">
          {link[1]}
        </a>
      )
    }
    return part
  })
}

const isTableRow = (line: string) => line.trim().startsWith("|") && line.trim().endsWith("|") && line.trim().length > 1
const isTableDivider = (line: string) => /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/.test(line)
const splitRow = (line: string) =>
  line
    .trim()
    .replace(/^\|/, "")
    .replace(/\|$/, "")
    .split("|")
    .map((cell) => cell.trim())

const BULLET = /^\s*[-*•]\s+(.*)$/
const NUMBERED = /^\s*(\d+)[.)]\s+(.*)$/
const HEADING = /^(#{1,6})\s+(.*)$/

export function MarkdownMessage({ text }: { text: string }) {
  const lines = text.replace(/\r\n/g, "\n").split("\n")
  const blocks: ReactNode[] = []
  let i = 0

  while (i < lines.length) {
    const line = lines[i]
    const key = `b${blocks.length}`

    if (!line.trim()) {
      i++
      continue
    }

    // Fenced code block (also used for letter drafts so spacing is preserved)
    if (line.trim().startsWith("```")) {
      const code: string[] = []
      i++
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        code.push(lines[i])
        i++
      }
      i++ // closing fence (absent while the answer is still streaming)
      blocks.push(
        <pre
          key={key}
          className="my-1.5 p-2 rounded-lg bg-black/10 dark:bg-black/40 overflow-x-auto font-mono text-[11px] leading-snug whitespace-pre-wrap break-words"
        >
          {code.join("\n")}
        </pre>,
      )
      continue
    }

    // Table
    if (isTableRow(line) && i + 1 < lines.length && isTableDivider(lines[i + 1])) {
      const header = splitRow(line)
      const rows: string[][] = []
      i += 2
      while (i < lines.length && isTableRow(lines[i])) {
        rows.push(splitRow(lines[i]))
        i++
      }
      blocks.push(
        <div key={key} className="my-1.5 overflow-x-auto">
          <table className="border-collapse text-[11px] w-full">
            <thead>
              <tr>
                {header.map((cell, c) => (
                  <th key={c} className="border border-current/20 px-1.5 py-1 text-left font-semibold whitespace-nowrap">
                    {renderInline(cell, `${key}-h${c}`)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row, r) => (
                <tr key={r}>
                  {row.map((cell, c) => (
                    <td key={c} className="border border-current/20 px-1.5 py-1 align-top">
                      {renderInline(cell, `${key}-r${r}c${c}`)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      )
      continue
    }

    // Heading
    const heading = HEADING.exec(line)
    if (heading) {
      blocks.push(
        <p key={key} className={`font-bold mt-2 mb-1 ${heading[1].length <= 2 ? "text-[13px]" : ""}`}>
          {renderInline(heading[2], key)}
        </p>,
      )
      i++
      continue
    }

    // Lists
    if (BULLET.test(line) || NUMBERED.test(line)) {
      const ordered = NUMBERED.test(line)
      const pattern = ordered ? NUMBERED : BULLET
      const first = ordered ? Number(NUMBERED.exec(line)![1]) : 1
      const items: string[] = []
      while (i < lines.length && pattern.test(lines[i])) {
        const match = pattern.exec(lines[i])!
        items.push(match[match.length - 1])
        i++
      }
      const children = items.map((item, n) => <li key={n}>{renderInline(item, `${key}-${n}`)}</li>)
      blocks.push(
        ordered ? (
          <ol key={key} start={first} className="list-decimal pl-5 my-1 space-y-0.5">
            {children}
          </ol>
        ) : (
          <ul key={key} className="list-disc pl-4 my-1 space-y-0.5">
            {children}
          </ul>
        ),
      )
      continue
    }

    // Paragraph: consecutive plain lines, line breaks kept
    const paragraph: string[] = []
    while (
      i < lines.length &&
      lines[i].trim() &&
      !lines[i].trim().startsWith("```") &&
      !HEADING.test(lines[i]) &&
      !BULLET.test(lines[i]) &&
      !NUMBERED.test(lines[i]) &&
      !(isTableRow(lines[i]) && i + 1 < lines.length && isTableDivider(lines[i + 1]))
    ) {
      paragraph.push(lines[i])
      i++
    }
    blocks.push(
      <p key={key} className="my-1 whitespace-pre-wrap break-words">
        {renderInline(paragraph.join("\n"), key)}
      </p>,
    )
  }

  return <div className="space-y-0.5">{blocks}</div>
}
