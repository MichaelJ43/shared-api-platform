/**
 * Embeddable browser client for the shared analytics POST /analytics/events?v=1.
 * The API still validates payload server-side; this module only helps send well-shaped JSON.
 */
export type AnalyticsClientOptions = {
  /** API origin, e.g. `https://api.michaelj43.dev` (no trailing path). */
  baseUrl: string
  /** App or site id (opaque) shared with the platform. */
  appId: string
  /**
   * Query `v` (must match a supported server version, currently `1`).
   * @default "1"
   */
  version?: string
  /** `localStorage` key for a stable per-browser session id. */
  sessionStorageKey?: string
}

function newSessionId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `s-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function getOrCreateSessionId(storageKey: string): string {
  if (typeof localStorage === 'undefined') {
    return newSessionId()
  }
  const existing = localStorage.getItem(storageKey)
  if (existing) {
    return existing
  }
  const id = newSessionId()
  try {
    localStorage.setItem(storageKey, id)
  } catch {
    /* private mode, quota */
  }
  return id
}

function buildIngestUrl(baseUrl: string, v: string): string {
  const base = baseUrl.replace(/\/$/, '')
  const u = new URL('/analytics/events', base.startsWith('http') ? base : `https://${base}`)
  u.searchParams.set('v', v)
  return u.toString()
}

export type IngestEventInput = {
  eventType: string
  path: string
  clientTimestamp?: string | number
  context?: Record<string, unknown>
}

export function createClient(opts: AnalyticsClientOptions) {
  const v = opts.version ?? '1'
  const url = buildIngestUrl(opts.baseUrl, v)
  const key = opts.sessionStorageKey ?? 'shared_api_analytics_session'
  const sessionId = () => getOrCreateSessionId(key)

  async function send(
    event: IngestEventInput,
    init?: { signal?: AbortSignal; keepalive?: boolean },
  ): Promise<void> {
    const body = {
      event: {
        appId: opts.appId,
        sessionId: sessionId(),
        eventType: event.eventType,
        path: event.path,
        clientTimestamp: event.clientTimestamp ?? new Date().toISOString(),
        ...(event.context !== undefined && Object.keys(event.context).length
          ? { context: event.context }
          : {}),
      },
    }
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      mode: 'cors',
      credentials: 'omit',
      signal: init?.signal,
      keepalive: init?.keepalive,
    })
    if (!r.ok) {
      const t = await r.text().catch(() => '')
      throw new Error(`Analytics ingest failed: ${r.status} ${t.slice(0, 200)}`)
    }
  }

  return {
    get ingestUrl() {
      return url
    },
    sessionId: () => sessionId(),
    send,
    pageview(path: string, init?: { signal?: AbortSignal; keepalive?: boolean }): Promise<void> {
      return send({ eventType: 'pageview', path }, init)
    },
  }
}

export type AnalyticsClient = ReturnType<typeof createClient>
