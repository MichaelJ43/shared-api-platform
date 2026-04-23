const API = (import.meta.env.VITE_API_BASE_URL ?? 'https://api.michaelj43.dev').replace(/\/$/, '')

const params = new URLSearchParams(window.location.search)
const returnUrl = params.get('returnUrl') ?? undefined

const app = document.getElementById('app')!
app.innerHTML = `
  <main style="font-family:system-ui,sans-serif;max-width:20rem;margin:3rem auto;padding:1.5rem;border:1px solid #ccc;border-radius:8px">
    <h1 style="font-size:1.25rem">Sign in</h1>
    <form id="f">
      <p><label>Email<br><input name="email" type="email" required autocomplete="username" style="width:100%"></label></p>
      <p><label>Password<br><input name="password" type="password" required autocomplete="current-password" style="width:100%"></label></p>
      <p><button type="submit" style="width:100%;padding:0.5rem">Sign in</button></p>
    </form>
    <p id="err" style="color:#b00;font-size:0.9rem;min-height:1.2rem"></p>
  </main>
`

const form = app.querySelector('#f') as HTMLFormElement
const err = app.querySelector('#err') as HTMLParagraphElement

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  err.textContent = ''
  const fd = new FormData(form)
  const email = String(fd.get('email') ?? '')
  const password = String(fd.get('password') ?? '')
  try {
    const r = await fetch(`${API}/v1/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password, returnUrl }),
      credentials: 'include',
    })
    const text = await r.text()
    let j: { redirect?: string; error?: string } = {}
    try {
      j = text ? (JSON.parse(text) as { redirect?: string; error?: string }) : {}
    } catch {
      err.textContent =
        r.status === 403
          ? 'Access blocked (CORS). Ensure the API Lambda has CORS_ALLOWED_BASE_HOST set to your site apex, e.g. michaelj43.dev.'
          : `Unexpected response (${r.status}). Check the API URL and browser devtools (Network) for the login request.`
      return
    }
    if (!r.ok) {
      err.textContent = 'Invalid email or password.'
      return
    }
    if (j.redirect) {
      window.location.href = j.redirect
    } else {
      err.textContent = 'No redirect from server'
    }
  } catch (e) {
    const msg = e instanceof TypeError && e.message === 'Failed to fetch' ? e.message : String(e)
    err.textContent =
      `Request failed: ${msg}. Often this is CORS (Lambda missing CORS_ALLOWED_BASE_HOST) or a wrong API URL (rebuild with VITE_API_BASE_URL if needed).`
  }
})
