import './app.css'

const API = (import.meta.env.VITE_API_BASE_URL ?? 'https://api.michaelj43.dev').replace(/\/$/, '')
const AUTH = (import.meta.env.VITE_AUTH_ORIGIN ?? 'https://auth.michaelj43.dev').replace(/\/$/, '')

const app = document.getElementById('app')!

function signInHref(): string {
  const here = new URL(window.location.href)
  return `${AUTH}/?returnUrl=${encodeURIComponent(here.toString())}`
}

async function me(): Promise<{ email: string; id: string; role: 'admin' | 'user' } | null> {
  const r = await fetch(`${API}/v1/auth/me`, { credentials: 'include' })
  if (r.status === 401) {
    return null
  }
  const j = (await r.json()) as { user: { email: string; id: string; role: 'admin' | 'user' } }
  return j.user
}

function renderSignedOut() {
  const href = signInHref()
  app.innerHTML = `
    <div class="dashboard__signed-out">
      <p class="m43-intro dashboard__tight">
        Sign in with an admin account to run analytics queries.
      </p>
      <p>
        <a class="m43-button m43-button--primary" href="${escapeAttr(href)}">Sign in</a>
      </p>
    </div>
  `
}

function renderNotAdmin() {
  app.innerHTML = `
    <div class="dashboard__signed-out">
      <p class="m43-intro dashboard__tight" role="alert">
        You are signed in, but this account does not have admin access to analytics data.
      </p>
    </div>
  `
}

function escapeAttr(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/** Authenticated view: sign out lives in the m43 auth header (same API/cookies as this page). */
function render() {
  app.innerHTML = `
    <p class="m43-intro dashboard__tight">
      Administrator session — use the header to sign out.
    </p>
    <section aria-labelledby="query-heading">
      <h2 class="m43-section-title" id="query-heading">Query</h2>
      <div class="dashboard__query">
        <div class="m43-field">
          <label for="appId">appId</label>
          <input class="m43-input" type="text" id="appId" value="dredd-contract" autocomplete="off" />
        </div>
        <div class="m43-field">
          <label for="day">Day (UTC)</label>
          <input class="m43-input" type="text" id="day" placeholder="2026-04-22" inputmode="numeric" autocomplete="off" />
        </div>
        <div class="dashboard__load">
          <button type="button" class="m43-button m43-button--primary" id="load">Load</button>
        </div>
      </div>
      <div id="tbl" role="status" aria-live="polite"></div>
    </section>
  `
  app.querySelector('#load')?.addEventListener('click', () => void loadRows())
  const today = new Date()
  const y = today.getUTCFullYear()
  const mo = String(today.getUTCMonth() + 1).padStart(2, '0')
  const d = String(today.getUTCDate()).padStart(2, '0')
  ;(app.querySelector('#day') as HTMLInputElement).value = `${y}-${mo}-${d}`
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

async function loadRows() {
  const appId = (app.querySelector('#appId') as HTMLInputElement).value.trim()
  const day = (app.querySelector('#day') as HTMLInputElement).value.trim()
  const tbl = app.querySelector('#tbl') as HTMLDivElement
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    tbl.innerHTML =
      '<p class="m43-message--error" role="alert">Invalid day. Use YYYY-MM-DD (UTC).</p>'
    return
  }
  tbl.textContent = 'Loading…'
  const u = new URL(`${API}/v1/admin/analytics/events`)
  u.searchParams.set('appId', appId)
  u.searchParams.set('day', day)
  u.searchParams.set('limit', '50')
  const r = await fetch(u.toString(), { credentials: 'include' })
  if (r.status === 401) {
    const href = signInHref()
    tbl.innerHTML = `<p class="m43-message--error" role="alert">Not signed in or session expired.</p>
      <p><a class="m43-button m43-button--primary" href="${escapeAttr(href)}">Sign in</a></p>`
    return
  }
  if (r.status === 403) {
    tbl.innerHTML =
      '<p class="m43-message--error" role="alert">Not allowed — this account is not an admin.</p>'
    return
  }
  const j = (await r.json()) as { items: Record<string, unknown>[]; nextCursor: string | null }
  if (!j.items.length) {
    tbl.innerHTML = '<p class="m43-intro">No items for that key.</p>'
    return
  }
  const rows = j.items
    .map(
      (it) => `
      <tr>
        <td>${escapeHtml(String(it.eventType ?? ''))}</td>
        <td class="dashboard__path-cell">${escapeHtml(String(it.path ?? ''))}</td>
        <td>${escapeHtml(String(it.ingestId ?? ''))}</td>
      </tr>`,
    )
    .join('')
  tbl.innerHTML = `<div class="dashboard__table-wrap">
    <table class="m43-table">
      <thead>
        <tr>
          <th scope="col">eventType</th>
          <th scope="col">path</th>
          <th scope="col">ingestId</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>${
    j.nextCursor
      ? '<p class="m43-intro dashboard__hint">More data available; pagination can be added.</p>'
      : ''
  }`
}

;(async () => {
  const u = await me()
  if (!u) {
    renderSignedOut()
    return
  }
  if (u.role !== 'admin') {
    renderNotAdmin()
    return
  }
  render()
})().catch(() => {
  app.innerHTML = '<p class="m43-message--error" role="alert">Error loading the dashboard. Try again.</p>'
})
