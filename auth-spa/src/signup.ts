const API = (import.meta.env.VITE_API_BASE_URL ?? 'https://api.michaelj43.dev').replace(/\/$/, '')

const params = new URLSearchParams(window.location.search)
const returnUrl = params.get('returnUrl') ?? undefined

const app = document.getElementById('app')!
app.innerHTML = `
  <main style="font-family:system-ui,sans-serif;max-width:22rem;margin:3rem auto;padding:1.5rem;border:1px solid #ccc;border-radius:8px">
    <h1 style="font-size:1.25rem">Create account</h1>
    <form id="f">
      <p><label>Email<br><input name="email" type="email" required autocomplete="email" style="width:100%"></label></p>
      <p><label>Password<br><input name="password" type="password" required autocomplete="new-password" style="width:100%"></label></p>
      <p style="font-size:0.8rem;color:#444;line-height:1.35;margin:0 0 0.75rem">
        Use at least 12 characters with uppercase, lowercase, a number, and a special character. Password cannot match your email.
      </p>
      <p><button type="submit" style="width:100%;padding:0.5rem">Create account</button></p>
    </form>
    <p id="err" style="color:#b00;font-size:0.9rem;min-height:1.2rem"></p>
    <p style="font-size:0.9rem"><a href="/">Sign in instead</a></p>
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
    const r = await fetch(`${API}/v1/auth/register`, {
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
          ? 'Access blocked (CORS). Ensure the API allows this auth origin.'
          : `Unexpected response (${r.status}). Check the API URL and Network tab.`
      return
    }
    if (r.status === 404) {
      err.textContent =
        'Registration is not enabled on this server. Ask an administrator to turn on sign-up, or create your account another way.'
      return
    }
    if (!r.ok) {
      err.textContent =
        r.status === 400
          ? 'Could not create this account. The email may already be registered, or the password does not meet the policy.'
          : `Request failed (${r.status}).`
      return
    }
    if (j.redirect) {
      window.location.href = j.redirect
    } else {
      err.textContent = 'Account created but no redirect was returned.'
    }
  } catch (e) {
    const msg = e instanceof TypeError && e.message === 'Failed to fetch' ? e.message : String(e)
    err.textContent = `Request failed: ${msg}.`
  }
})
