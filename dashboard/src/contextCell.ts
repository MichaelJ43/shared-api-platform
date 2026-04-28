/** Escape text safe for HTML (attributes and text nodes). */
function escapeForHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

const CONTEXT_PREVIEW_MAX = 320

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v)
}

/** Single-line JSON preview, truncated with ellipsis (plain text; escape before HTML). */
function formatContextPreview(obj: Record<string, unknown>, maxLen: number): string {
  let raw: string
  try {
    raw = JSON.stringify(obj)
  } catch {
    return ''
  }
  if (raw.length <= maxLen) {
    return raw
  }
  return `${raw.slice(0, maxLen)}…`
}

/** Inner HTML for one table cell: preview + expandable pretty JSON. */
export function contextCellInnerHtml(properties: unknown): string {
  if (properties === undefined || properties === null) {
    return '—'
  }
  if (!isPlainObject(properties)) {
    return escapeForHtml(String(properties))
  }
  if (Object.keys(properties).length === 0) {
    return '—'
  }
  let pretty: string
  let mini: string
  try {
    pretty = JSON.stringify(properties, null, 2)
    mini = formatContextPreview(properties, CONTEXT_PREVIEW_MAX)
  } catch {
    return '—'
  }
  if (!mini) {
    return '—'
  }
  return `<span class="dashboard__context-preview" title="Optional client context; expand for full JSON">${escapeForHtml(mini)}</span><details class="dashboard__context-details"><summary class="dashboard__context-summary">View full</summary><pre class="dashboard__context-pre">${escapeForHtml(pretty)}</pre></details>`
}
