const API = (import.meta.env.VITE_API_BASE_URL ?? 'https://api.michaelj43.dev').replace(/\/$/, '')
const AUTH = (import.meta.env.VITE_AUTH_ORIGIN ?? 'https://auth.michaelj43.dev').replace(/\/$/, '')

const app = document.getElementById('app')!

function redirectToSignIn() {
  const here = new URL(window.location.href)
  window.location.href = `${AUTH}/?returnUrl=${encodeURIComponent(here.toString())}`
}

async function me(): Promise<{ email: string; id: string } | null> {
  const r = await fetch(`${API}/v1/auth/me`, { credentials: 'include' })
  if (r.status === 401) {
    return null
  }
  const j = (await r.json()) as { user: { email: string; id: string } }
  return j.user
}

function render(m: { email: string; id: string }) {
  app.innerHTML = `
    <main style="font-family:system-ui,sans-serif;max-width:48rem;margin:1rem auto;padding:1rem">
      <p style="color:#333">Signed in as <strong>${escapeHtml(m.email)}</strong>
        <button type="button" id="out" style="margin-left:1rem">Sign out</button>
      </p>
      <h1 style="font-size:1.2rem">Analytics events</h1>
      <p style="font-size:0.9rem;color:#666">Query partition <code>APP#appId#DAY#&lt;UTC date&gt;</code></p>
      <p>
        <label>appId <input id="appId" value="dredd-contract" style="min-width:12rem" /></label>
        <label style="margin-left:0.5rem">Day (UTC) <input id="day" type="text" placeholder="2026-04-22" style="min-width:8rem" /></label>
        <button type="button" id="load" style="margin-left:0.5rem">Load</button>
      </p>
      <div id="tbl"></div>
    </main>
  `
  app.querySelector('#out')?.addEventListener('click', async () => {
    await fetch(`${API}/v1/auth/logout`, { method: 'POST', credentials: 'include' })
    redirectToSignIn()
  })
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
    tbl.innerHTML = '<p style="color:#b00">Invalid day. Use YYYY-MM-DD (UTC).</p>'
    return
  }
  tbl.textContent = 'Loading…'
  const u = new URL(`${API}/v1/admin/analytics/events`)
  u.searchParams.set('appId', appId)
  u.searchParams.set('day', day)
  u.searchParams.set('limit', '50')
  const r = await fetch(u.toString(), { credentials: 'include' })
  if (r.status === 401) {
    redirectToSignIn()
    return
  }
  const j = (await r.json()) as { items: Record<string, unknown>[]; nextCursor: string | null }
  if (!j.items.length) {
    tbl.innerHTML = '<p style="color:#666">No items for that key.</p>'
    return
  }
  const rows = j.items
    .map(
      (it) => `
      <tr>
        <td style="border:1px solid #ccc;padding:0.25rem 0.4rem;font-size:0.85rem">${escapeHtml(String(it.eventType ?? ''))}</td>
        <td style="border:1px solid #ccc;padding:0.25rem 0.4rem;font-size:0.8rem;word-break:break-all">${escapeHtml(String(it.path ?? ''))}</td>
        <td style="border:1px solid #ccc;padding:0.25rem 0.4rem;font-size:0.8rem">${escapeHtml(String(it.ingestId ?? ''))}</td>
      </tr>`,
    )
    .join('')
  tbl.innerHTML = `<table style="border-collapse:collapse;width:100%"><thead><tr><th align="left">eventType</th><th align="left">path</th><th align="left">ingestId</th></tr></thead><tbody>${rows}</tbody></table>${j.nextCursor ? '<p style=font-size:0.85rem>More data available; pagination can be added.</p>' : ''}`
}

;(async () => {
  const u = await me()
  if (!u) {
    redirectToSignIn()
    return
  }
  render(u)
})().catch(() => {
  app.textContent = 'Error'
})
