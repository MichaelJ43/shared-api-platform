/** Resizable analytics events table: colgroup widths + drag handles; persisted in localStorage. */

const COL_KEYS = [
  'time',
  'eventType',
  'path',
  'session',
  'network',
  'location',
  'context',
  'ingestId',
] as const

export type AnalyticsColKey = (typeof COL_KEYS)[number]

/** Floor widths so headers like "Time (UTC)" stay readable after resize / storage. */
const MIN_PX: Record<AnalyticsColKey, number> = {
  time: 152,
  eventType: 112,
  path: 200,
  session: 96,
  network: 104,
  location: 104,
  context: 240,
  ingestId: 200,
}

const LS_KEY = 'm43-dashboard-analytics-col-widths-v2'

const DEFAULT_PX: Record<AnalyticsColKey, number> = {
  time: 200,
  eventType: 140,
  path: 280,
  session: 112,
  network: 120,
  location: 128,
  context: 420,
  ingestId: 260,
}

function readStored(): Partial<Record<AnalyticsColKey, number>> | null {
  try {
    const r = localStorage.getItem(LS_KEY)
    if (!r) {
      return null
    }
    const o = JSON.parse(r) as Record<string, unknown>
    const out: Partial<Record<AnalyticsColKey, number>> = {}
    for (const k of COL_KEYS) {
      const n = Number(o[k])
      const floor = MIN_PX[k]
      if (Number.isFinite(n) && n >= floor) {
        out[k] = Math.round(n)
      }
    }
    return Object.keys(out).length ? out : null
  } catch {
    return null
  }
}

function writeStored(w: Record<AnalyticsColKey, number>) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(w))
  } catch {
    /* private mode / quota */
  }
}

function currentWidthsFromCols(cols: HTMLTableColElement[]): Record<AnalyticsColKey, number> {
  const out = { ...DEFAULT_PX }
  for (let i = 0; i < cols.length; i++) {
    const k = COL_KEYS[i]
    const w = Math.round(cols[i].getBoundingClientRect().width)
    if (Number.isFinite(w) && w >= MIN_PX[k]) {
      out[k] = w
    }
  }
  return out
}

/** `<colgroup>…</colgroup>` HTML with widths from storage or defaults. */
export function buildAnalyticsColgroupHtml(): string {
  const stored = readStored()
  const parts = COL_KEYS.map((k) => {
    const raw = stored?.[k] ?? DEFAULT_PX[k]
    const width = Math.max(MIN_PX[k], Math.round(raw))
    return `<col data-col="${k}" style="width:${width}px;min-width:${width}px" />`
  })
  return `<colgroup>${parts.join('')}</colgroup>`
}

export function wireResizableAnalyticsTable(table: HTMLTableElement): void {
  const cols = [...table.querySelectorAll('col[data-col]')] as HTMLTableColElement[]
  if (cols.length !== COL_KEYS.length) {
    return
  }

  const ths = [...table.querySelectorAll('thead th')] as HTMLTableCellElement[]
  if (ths.length !== COL_KEYS.length) {
    return
  }

  for (let i = 0; i < ths.length; i++) {
    const th = ths[i]
    if (th.querySelector('.dashboard__col-resize-handle')) {
      continue
    }
    const col = cols[i]
    const key = COL_KEYS[i]

    const handle = document.createElement('span')
    handle.className = 'dashboard__col-resize-handle'
    handle.setAttribute('role', 'separator')
    handle.setAttribute('aria-orientation', 'vertical')
    handle.setAttribute('aria-label', `Resize ${key} column`)
    handle.tabIndex = 0
    th.appendChild(handle)

    const applyWidth = (px: number) => {
      const w = Math.max(MIN_PX[key], Math.round(px))
      col.style.width = `${w}px`
      col.style.minWidth = `${w}px`
    }

    const persist = () => {
      writeStored(currentWidthsFromCols(cols))
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') {
        return
      }
      e.preventDefault()
      const step = e.shiftKey ? 40 : 8
      const delta = e.key === 'ArrowRight' ? step : -step
      const next = col.getBoundingClientRect().width + delta
      applyWidth(next)
      persist()
    }
    handle.addEventListener('keydown', onKeyDown)

    handle.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) {
        return
      }
      e.preventDefault()
      e.stopPropagation()
      const startX = e.clientX
      const startW = col.getBoundingClientRect().width
      const pid = e.pointerId
      handle.classList.add('dashboard__col-resize-handle--dragging')

      const move = (ev: PointerEvent) => {
        if (ev.pointerId !== pid) {
          return
        }
        applyWidth(startW + (ev.clientX - startX))
      }
      const up = (ev: PointerEvent) => {
        if (ev.pointerId !== pid) {
          return
        }
        document.removeEventListener('pointermove', move)
        document.removeEventListener('pointerup', up)
        document.removeEventListener('pointercancel', up)
        handle.classList.remove('dashboard__col-resize-handle--dragging')
        persist()
      }
      document.addEventListener('pointermove', move)
      document.addEventListener('pointerup', up)
      document.addEventListener('pointercancel', up)
    })
  }
}
