import './app.css'
import { contextCellInnerHtml } from './contextCell'

const API = (import.meta.env.VITE_API_BASE_URL ?? 'https://api.michaelj43.dev').replace(/\/$/, '')
const AUTH = (import.meta.env.VITE_AUTH_ORIGIN ?? 'https://auth.michaelj43.dev').replace(/\/$/, '')

const app = document.getElementById('app')!

let currentUser: { email: string; id: string; role: 'admin' | 'user' } | null = null

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

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function cellOrDash(raw: unknown): string {
  const s = String(raw ?? '').trim()
  return s ? escapeHtml(s) : '—'
}

/** Short stable id for the browser session (full value in tooltip). */
function abbrevSession(raw: unknown, max = 10): string {
  const s = String(raw ?? '').trim()
  if (!s) {
    return '—'
  }
  if (s.length <= max) {
    return escapeHtml(s)
  }
  return escapeHtml(s.slice(0, max)) + '…'
}

function formatUtcTime(ms: unknown): string {
  const n = Number(ms)
  if (!Number.isFinite(n)) {
    return ''
  }
  return `${new Date(n).toISOString().replace('T', ' ').slice(0, 19)} UTC`
}

function currentView(): 'analytics' | 'users' {
  const h = window.location.hash.replace(/^#/, '').trim()
  return h === 'users' ? 'users' : 'analytics'
}

function renderAdminShell(u: { email: string; id: string; role: 'admin' }) {
  currentUser = u
  const view = currentView()
  app.innerHTML = `
    <nav class="dashboard__nav" aria-label="Sections">
      <a href="#analytics" class="dashboard__nav-link ${view === 'analytics' ? 'dashboard__nav-link--active' : ''}">Analytics</a>
      <a href="#users" class="dashboard__nav-link ${view === 'users' ? 'dashboard__nav-link--active' : ''}">Users</a>
    </nav>
    <div id="view"></div>
  `
  window.removeEventListener('hashchange', onHashChange)
  window.addEventListener('hashchange', onHashChange)
  mountView()
}

function onHashChange() {
  const v = currentView()
  for (const a of app.querySelectorAll('.dashboard__nav-link')) {
    const el = a as HTMLAnchorElement
    const isUsers = el.getAttribute('href') === '#users'
    el.classList.toggle('dashboard__nav-link--active', (isUsers && v === 'users') || (!isUsers && v === 'analytics'))
  }
  mountView()
}

function mountView() {
  const container = document.getElementById('view')
  if (!container) {
    return
  }
  if (currentView() === 'users') {
    renderUsersView(container)
  } else {
    renderAnalyticsView(container)
  }
}

function renderAnalyticsView(container: HTMLElement) {
  container.innerHTML = `
    <p class="m43-intro dashboard__tight">
      Administrator session — use the header to sign out.
    </p>
    <section aria-labelledby="query-heading">
      <h2 class="m43-section-title" id="query-heading">Query</h2>
      <div class="dashboard__query">
        <div class="m43-field">
          <label for="appId">appId</label>
          <select class="m43-input dashboard__select" id="appId"></select>
        </div>
        <div class="m43-field">
          <label for="rangePreset">Time range</label>
          <select class="m43-input dashboard__select" id="rangePreset">
            <option value="1h">Past hour</option>
            <option value="6h">Past 6 hours</option>
            <option value="24h" selected>Past 24 hours</option>
            <option value="7d">Past week</option>
            <option value="30d">Past 30 days</option>
            <option value="day">Single calendar day (UTC)</option>
          </select>
        </div>
        <div class="m43-field dashboard__day-field" id="day-field-wrap">
          <label for="day">Day (UTC)</label>
          <input class="m43-input" type="date" id="day" />
        </div>
        <div class="dashboard__load">
          <button type="button" class="m43-button m43-button--primary" id="load">Load</button>
        </div>
      </div>
      <div id="analytics-filters" class="dashboard__analytics-filters" hidden>
        <div class="m43-field">
          <label for="filterEventType">eventType</label>
          <select class="m43-input dashboard__select" id="filterEventType">
            <option value="">All event types</option>
          </select>
        </div>
        <div class="m43-field dashboard__filter-context-field">
          <label for="filterContext">Context contains</label>
          <input
            class="m43-input"
            type="search"
            id="filterContext"
            placeholder="Substring in JSON (case-insensitive)"
            autocomplete="off"
          />
        </div>
      </div>
      <div id="tbl" role="status" aria-live="polite"></div>
      <div id="analytics-more" class="dashboard__analytics-more"></div>
    </section>
  `
  const rangeEl = container.querySelector('#rangePreset') as HTMLSelectElement
  const dayWrap = container.querySelector('#day-field-wrap') as HTMLElement
  const syncDayVisibility = () => {
    const isDay = rangeEl.value === 'day'
    dayWrap.style.display = isDay ? '' : 'none'
    dayWrap.setAttribute('aria-hidden', isDay ? 'false' : 'true')
  }
  rangeEl.addEventListener('change', syncDayVisibility)
  syncDayVisibility()
  container.querySelector('#load')?.addEventListener('click', () => void loadRows())
  container.querySelector('#filterEventType')?.addEventListener('change', () => {
    renderAnalyticsResults()
  })
  container.querySelector('#filterContext')?.addEventListener('input', () => {
    renderAnalyticsResults()
  })
  const today = new Date()
  const y = today.getUTCFullYear()
  const mo = String(today.getUTCMonth() + 1).padStart(2, '0')
  const d = String(today.getUTCDate()).padStart(2, '0')
  ;(container.querySelector('#day') as HTMLInputElement).value = `${y}-${mo}-${d}`
  void populateAppIdSelect(container.querySelector('#appId') as HTMLSelectElement)
}

async function populateAppIdSelect(sel: HTMLSelectElement) {
  sel.innerHTML = '<option value="">Loading apps…</option>'
  sel.disabled = true
  try {
    const r = await fetch(`${API}/v1/admin/analytics/app-ids`, { credentials: 'include' })
    sel.disabled = false
    if (!r.ok) {
      sel.innerHTML =
        '<option value="dredd-contract">dredd-contract</option><option value="">—</option>'
      sel.value = 'dredd-contract'
      return
    }
    const j = (await r.json()) as { appIds: string[] }
    const opts = ['<option value="">Select app…</option>']
    for (const id of j.appIds) {
      opts.push(`<option value="${escapeAttr(id)}">${escapeHtml(id)}</option>`)
    }
    sel.innerHTML = opts.join('')
    if (j.appIds.includes('dredd-contract')) {
      sel.value = 'dredd-contract'
    } else if (j.appIds.length > 0) {
      sel.value = j.appIds[0]
    }
  } catch {
    sel.disabled = false
    sel.innerHTML =
      '<option value="dredd-contract">dredd-contract</option>'
    sel.value = 'dredd-contract'
  }
}

type UserRow = { email: string; userId: string; createdAt: string; role: 'admin' | 'user' }

let usersListCache: UserRow[] = []
let usersNextCursor: string | null = null

let analyticsCachedItems: Record<string, unknown>[] = []
let analyticsEventsNextCursor: string | null = null
let analyticsLoadMoreKey: { appId: string; day: string } | null = null

function renderUsersView(container: HTMLElement) {
  container.innerHTML = `
    <section class="dashboard__reg-panel" aria-labelledby="reg-heading">
      <h2 class="m43-section-title" id="reg-heading">Self-service sign-up</h2>
      <p class="m43-intro dashboard__tight">
        Controls whether <strong>signup.html</strong> on the auth site can create new accounts. Infrastructure must also allow registration.
      </p>
      <div id="reg-status" role="status" aria-live="polite"></div>
      <div class="dashboard__reg-toggle">
        <label class="dashboard__reg-label">
          <input type="checkbox" id="reg-open" />
          <span>Allow new accounts via sign-up page</span>
        </label>
      </div>
      <p id="reg-hint" class="m43-intro dashboard__reg-hint"></p>
    </section>
    <section aria-labelledby="users-heading">
      <h2 class="m43-section-title" id="users-heading">Users</h2>
      <p class="m43-intro dashboard__tight">
        Grant or remove <strong>admin</strong> (analytics API and this dashboard). You cannot remove your own admin role here.
      </p>
      <div id="users-status" role="status" aria-live="polite"></div>
      <div id="users-table-wrap"></div>
      <div id="users-more" class="dashboard__users-more"></div>
    </section>
  `
  const wrap = container.querySelector('#users-table-wrap') as HTMLElement
  wrap.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('button[data-action]') as HTMLButtonElement | null
    if (!btn?.dataset.action || !btn.dataset.email) {
      return
    }
    void patchUserRole(btn.dataset.email, btn.dataset.action === 'promote' ? 'admin' : 'user')
  })
  void loadSiteRegistrationUi()
  void loadUsersInitial()
}

type SiteRegistration = {
  effective: boolean
  envAllowsRegister: boolean
  preference: boolean
}

async function loadSiteRegistrationUi() {
  const regStatus = document.getElementById('reg-status')
  const hint = document.getElementById('reg-hint')
  const cb = document.getElementById('reg-open') as HTMLInputElement | null
  if (!regStatus || !hint || !cb) {
    return
  }
  regStatus.textContent = 'Loading…'
  const r = await fetch(`${API}/v1/admin/site`, { credentials: 'include' })
  regStatus.textContent = ''
  if (r.status === 401 || r.status === 403) {
    regStatus.innerHTML = `<p class="m43-message--error" role="alert">Could not load site settings.</p>`
    cb.disabled = true
    return
  }
  const j = (await r.json()) as { site: SiteRegistration }
  const s = j.site
  cb.checked = s.preference
  cb.disabled = !s.envAllowsRegister
  cb.onchange = () => {
    void patchSiteRegistration(cb.checked)
  }
  if (!s.envAllowsRegister) {
    hint.innerHTML =
      '<strong>Infrastructure lock:</strong> <code>AUTH_ALLOW_REGISTER</code> is off in Lambda. Set <code>auth_allow_register = true</code> in Terraform (then apply) before this toggle can turn sign-up on.'
  } else if (s.effective) {
    hint.textContent = 'Sign-up is open: new users can register on the auth site.'
  } else {
    hint.textContent =
      'Sign-up is closed: the sign-up page will show an error until you enable this option.'
  }
}

async function patchSiteRegistration(allowRegister: boolean) {
  const regStatus = document.getElementById('reg-status')
  const cb = document.getElementById('reg-open') as HTMLInputElement | null
  const hint = document.getElementById('reg-hint')
  if (regStatus) {
    regStatus.textContent = 'Saving…'
  }
  const r = await fetch(`${API}/v1/admin/site`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ allowRegister }),
  })
  if (regStatus) {
    regStatus.textContent = ''
  }
  if (r.status === 403) {
    const j = (await r.json().catch(() => ({}))) as { error?: string }
    if (j.error === 'registration_locked_by_env' && regStatus) {
      regStatus.innerHTML = `<p class="m43-message--error" role="alert">Cannot change: registration is disabled in infrastructure.</p>`
    }
    if (cb) {
      cb.checked = !allowRegister
    }
    return
  }
  if (!r.ok) {
    if (regStatus) {
      regStatus.innerHTML = `<p class="m43-message--error" role="alert">Could not save (${r.status}).</p>`
    }
    if (cb) {
      cb.checked = !allowRegister
    }
    return
  }
  const j = (await r.json()) as { site: SiteRegistration }
  const s = j.site
  if (cb) {
    cb.checked = s.preference
  }
  if (hint) {
    if (!s.envAllowsRegister) {
      hint.innerHTML =
        '<strong>Infrastructure lock:</strong> <code>AUTH_ALLOW_REGISTER</code> is off in Lambda.'
    } else if (s.effective) {
      hint.textContent = 'Sign-up is open: new users can register on the auth site.'
    } else {
      hint.textContent =
        'Sign-up is closed: the sign-up page will show an error until you enable this option.'
    }
  }
}

function renderUsersTable(rows: UserRow[]) {
  const wrap = document.getElementById('users-table-wrap')
  if (!wrap) {
    return
  }
  const meEmail = currentUser?.email ?? ''
  const body = rows
    .map((row) => {
      const isSelf = row.email === meEmail
      const btn =
        row.role === 'admin'
          ? `<button type="button" class="m43-button" data-action="demote" data-email="${escapeAttr(row.email)}" ${
              isSelf ? 'disabled title="Use another admin to remove your role"' : ''
            }>Remove admin</button>`
          : `<button type="button" class="m43-button m43-button--primary" data-action="promote" data-email="${escapeAttr(row.email)}">Make admin</button>`
      return `<tr>
        <td>${escapeHtml(row.email)}</td>
        <td>${escapeHtml(row.role)}</td>
        <td class="dashboard__cell-muted">${escapeHtml(row.createdAt)}</td>
        <td class="dashboard__user-actions">${btn}</td>
      </tr>`
    })
    .join('')
  wrap.innerHTML = `<div class="dashboard__table-wrap"><table class="m43-table">
    <thead><tr>
      <th scope="col">Email</th>
      <th scope="col">Role</th>
      <th scope="col">Created</th>
      <th scope="col">Actions</th>
    </tr></thead>
    <tbody>${body}</tbody>
  </table></div>`
}

async function loadUsersInitial() {
  const status = document.getElementById('users-status')
  const more = document.getElementById('users-more')
  if (!status || !more) {
    return
  }
  usersListCache = []
  usersNextCursor = null
  status.textContent = 'Loading…'
  more.innerHTML = ''
  const u = new URL(`${API}/v1/admin/users`)
  u.searchParams.set('limit', '50')
  const r = await fetch(u.toString(), { credentials: 'include' })
  if (r.status === 401) {
    status.innerHTML = `<p class="m43-message--error" role="alert">Not signed in.</p>`
    return
  }
  if (r.status === 403) {
    status.innerHTML = `<p class="m43-message--error" role="alert">Not allowed.</p>`
    return
  }
  const j = (await r.json()) as { items: UserRow[]; nextCursor: string | null }
  usersListCache = j.items
  usersNextCursor = j.nextCursor
  status.textContent = usersListCache.length ? '' : 'No users found.'
  renderUsersTable(usersListCache)
  if (j.nextCursor) {
    more.innerHTML = `<button type="button" class="m43-button" id="users-load-more">Load more</button>`
    document.getElementById('users-load-more')?.addEventListener('click', () => void loadUsersMore())
  }
}

async function loadUsersMore() {
  if (!usersNextCursor) {
    return
  }
  const status = document.getElementById('users-status')
  const more = document.getElementById('users-more')
  if (!status || !more) {
    return
  }
  const u = new URL(`${API}/v1/admin/users`)
  u.searchParams.set('limit', '50')
  u.searchParams.set('cursor', usersNextCursor)
  const r = await fetch(u.toString(), { credentials: 'include' })
  if (!r.ok) {
    status.textContent = 'Could not load more users.'
    return
  }
  const j = (await r.json()) as { items: UserRow[]; nextCursor: string | null }
  usersListCache.push(...j.items)
  usersNextCursor = j.nextCursor
  renderUsersTable(usersListCache)
  more.innerHTML = ''
  if (j.nextCursor) {
    more.innerHTML = `<button type="button" class="m43-button" id="users-load-more">Load more</button>`
    document.getElementById('users-load-more')?.addEventListener('click', () => void loadUsersMore())
  }
}

async function patchUserRole(email: string, role: 'admin' | 'user') {
  const status = document.getElementById('users-status')
  if (status) {
    status.textContent = 'Saving…'
  }
  const r = await fetch(`${API}/v1/admin/users`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ email, role }),
  })
  if (status) {
    status.textContent = ''
  }
  if (r.status === 400) {
    const j = (await r.json().catch(() => ({}))) as { error?: string }
    if (j.error === 'cannot_demote_self') {
      if (status) {
        status.innerHTML = `<p class="m43-message--error" role="alert">You cannot remove your own admin role.</p>`
      }
      return
    }
  }
  if (!r.ok) {
    if (status) {
      status.innerHTML = `<p class="m43-message--error" role="alert">Update failed (${r.status}).</p>`
    }
    return
  }
  await loadUsersInitial()
}

function filterAnalyticsItems(
  items: Record<string, unknown>[],
  eventType: string,
  contextSub: string,
): Record<string, unknown>[] {
  let out = items
  if (eventType) {
    out = out.filter((it) => String(it.eventType ?? '') === eventType)
  }
  const needle = contextSub.trim().toLowerCase()
  if (needle) {
    out = out.filter((it) => {
      let serialized: string
      try {
        serialized = JSON.stringify(it.properties ?? {})
      } catch {
        serialized = ''
      }
      return serialized.toLowerCase().includes(needle)
    })
  }
  return out
}

function syncAnalyticsFilterOptions(items: Record<string, unknown>[]) {
  const root = document.getElementById('view')
  const sel = root?.querySelector('#filterEventType') as HTMLSelectElement | null
  const filters = document.getElementById('analytics-filters')
  if (!sel || !filters) {
    return
  }
  const prev = sel.value
  const types = [
    ...new Set(items.map((it) => String(it.eventType ?? '').trim()).filter(Boolean)),
  ].sort((a, b) => a.localeCompare(b))
  const opts = ['<option value="">All event types</option>']
  for (const t of types) {
    opts.push(`<option value="${escapeAttr(t)}">${escapeHtml(t)}</option>`)
  }
  sel.innerHTML = opts.join('')
  if (types.includes(prev)) {
    sel.value = prev
  }
}

function setAnalyticsFiltersVisible(show: boolean) {
  document.getElementById('analytics-filters')?.toggleAttribute('hidden', !show)
}

function renderAnalyticsLoadMore() {
  const more = document.getElementById('analytics-more')
  if (!more) {
    return
  }
  more.innerHTML = ''
  if (analyticsEventsNextCursor && analyticsLoadMoreKey) {
    more.innerHTML =
      '<p class="m43-intro dashboard__hint">More events exist for this day — load the next page.</p><button type="button" class="m43-button" id="analytics-load-more">Load more</button>'
    document.getElementById('analytics-load-more')?.addEventListener('click', () => void loadMoreAnalytics())
  }
}

function renderAnalyticsResults() {
  const root = document.getElementById('view')
  const tbl = root?.querySelector('#tbl') as HTMLDivElement | null
  if (!tbl) {
    return
  }
  const eventFilter = (root?.querySelector('#filterEventType') as HTMLSelectElement)?.value ?? ''
  const contextNeedle = (root?.querySelector('#filterContext') as HTMLInputElement)?.value ?? ''

  if (analyticsCachedItems.length === 0) {
    return
  }

  const filtered = filterAnalyticsItems(analyticsCachedItems, eventFilter, contextNeedle)

  if (!filtered.length) {
    tbl.innerHTML = '<p class="m43-intro">No rows match the current filters.</p>'
    renderAnalyticsLoadMore()
    return
  }

  const rows = filtered
    .map((it) => {
      const fullSession = String(it.sessionId ?? '')
      return `
      <tr>
        <td class="dashboard__cell-muted">${escapeHtml(formatUtcTime(it.serverTimestamp))}</td>
        <td>${escapeHtml(String(it.eventType ?? ''))}</td>
        <td class="dashboard__path-cell">${escapeHtml(String(it.path ?? ''))}</td>
        <td title="${escapeAttr(fullSession)}">${abbrevSession(it.sessionId)}</td>
        <td>${cellOrDash(it.ipMasked)}</td>
        <td>${cellOrDash(it.geoLabel)}</td>
        <td class="dashboard__context-cell">${contextCellInnerHtml(it.properties)}</td>
        <td>${escapeHtml(String(it.ingestId ?? ''))}</td>
      </tr>`
    })
    .join('')
  tbl.innerHTML = `<div class="dashboard__table-wrap">
    <table class="m43-table">
      <thead>
        <tr>
          <th scope="col">Time (UTC)</th>
          <th scope="col">eventType</th>
          <th scope="col">path</th>
          <th scope="col">session</th>
          <th scope="col">network</th>
          <th scope="col">location</th>
          <th scope="col" title="Optional dimensions from the client; stored as properties in the API.">Context</th>
          <th scope="col">ingestId</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  </div>`
  renderAnalyticsLoadMore()
}

async function loadMoreAnalytics() {
  if (!analyticsEventsNextCursor || !analyticsLoadMoreKey) {
    return
  }
  const more = document.getElementById('analytics-more')
  ;(more?.querySelector('#analytics-load-more') as HTMLButtonElement | null)?.setAttribute('disabled', 'true')
  const u = new URL(`${API}/v1/admin/analytics/events`)
  u.searchParams.set('appId', analyticsLoadMoreKey.appId)
  u.searchParams.set('day', analyticsLoadMoreKey.day)
  u.searchParams.set('limit', '200')
  u.searchParams.set('cursor', analyticsEventsNextCursor)
  const r = await fetch(u.toString(), { credentials: 'include' })
  const tbl = document.getElementById('view')?.querySelector('#tbl') as HTMLDivElement | null
  if (r.status === 401) {
    if (tbl) {
      const href = signInHref()
      tbl.innerHTML = `<p class="m43-message--error" role="alert">Not signed in or session expired.</p>
        <p><a class="m43-button m43-button--primary" href="${escapeAttr(href)}">Sign in</a></p>`
    }
    if (more) {
      more.innerHTML = ''
    }
    return
  }
  if (!r.ok) {
    if (more) {
      more.innerHTML = `<p class="m43-message--error" role="alert">Could not load more (${r.status}).</p>${
        analyticsEventsNextCursor && analyticsLoadMoreKey
          ? '<button type="button" class="m43-button" id="analytics-load-more-retry">Retry</button>'
          : ''
      }`
      document.getElementById('analytics-load-more-retry')?.addEventListener('click', () => void loadMoreAnalytics())
    }
    return
  }
  const j = (await r.json()) as { items: Record<string, unknown>[]; nextCursor: string | null }
  analyticsCachedItems.push(...j.items)
  analyticsEventsNextCursor = j.nextCursor
  syncAnalyticsFilterOptions(analyticsCachedItems)
  renderAnalyticsResults()
}

async function loadRows() {
  const root = document.getElementById('view')
  const appId = (root?.querySelector('#appId') as HTMLSelectElement)?.value.trim() ?? ''
  const range = (root?.querySelector('#rangePreset') as HTMLSelectElement)?.value ?? '24h'
  const dayInput = root?.querySelector('#day') as HTMLInputElement | null
  const tbl = root?.querySelector('#tbl') as HTMLDivElement
  const more = document.getElementById('analytics-more')
  if (!tbl) {
    return
  }
  analyticsCachedItems = []
  analyticsEventsNextCursor = null
  analyticsLoadMoreKey = null
  setAnalyticsFiltersVisible(false)
  if (more) {
    more.innerHTML = ''
  }
  const filterCtx = root?.querySelector('#filterContext') as HTMLInputElement | null
  const filterType = root?.querySelector('#filterEventType') as HTMLSelectElement | null
  if (filterCtx) {
    filterCtx.value = ''
  }
  if (filterType) {
    filterType.innerHTML = '<option value="">All event types</option>'
  }

  if (!appId) {
    tbl.innerHTML =
      '<p class="m43-message--error" role="alert">Select an appId.</p>'
    return
  }
  tbl.textContent = 'Loading…'
  const u = new URL(`${API}/v1/admin/analytics/events`)
  u.searchParams.set('appId', appId)
  u.searchParams.set('limit', '200')
  let dayStr = ''
  if (range === 'day') {
    dayStr = dayInput?.value?.trim() ?? ''
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dayStr)) {
      tbl.innerHTML =
        '<p class="m43-message--error" role="alert">Pick a valid calendar day (UTC).</p>'
      return
    }
    u.searchParams.set('day', dayStr)
  } else {
    const now = Date.now()
    const spanMs: Record<string, number> = {
      '1h': 3600000,
      '6h': 6 * 3600000,
      '24h': 24 * 3600000,
      '7d': 7 * 24 * 3600000,
      '30d': 30 * 24 * 3600000,
    }
    const ms = spanMs[range] ?? 24 * 3600000
    u.searchParams.set('from', new Date(now - ms).toISOString())
    u.searchParams.set('to', new Date(now).toISOString())
  }
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
  analyticsCachedItems = j.items
  analyticsEventsNextCursor = j.nextCursor
  analyticsLoadMoreKey = range === 'day' ? { appId, day: dayStr } : null

  if (!j.items.length) {
    tbl.innerHTML = '<p class="m43-intro">No items for that key.</p>'
    setAnalyticsFiltersVisible(false)
    if (range === 'day' && j.nextCursor) {
      renderAnalyticsLoadMore()
    }
    return
  }
  setAnalyticsFiltersVisible(true)
  syncAnalyticsFilterOptions(analyticsCachedItems)
  renderAnalyticsResults()
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
  renderAdminShell(u)
})().catch(() => {
  app.innerHTML = '<p class="m43-message--error" role="alert">Error loading the dashboard. Try again.</p>'
})
