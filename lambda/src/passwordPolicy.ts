import { z } from 'zod'

/**
 * Shared password policy for account creation and `auth:create-user` (see `authStore` / `create-user` script).
 *
 * Rules:
 * - **Length:** 12–128 characters (UTF-8 string length as validated by Zod).
 * - **Character classes (all required):** at least one uppercase letter (A–Z), one lowercase (a–z), one
 *   digit (0–9), and one “special” from: `!@#$%^&*()_+-=[]{}|;:,.?/` (ASCII punctuation that stays JSON-safe
 *   in request bodies without escaping).
 * - **Not trivially equal to email:** password lowercased must not match the full normalized email, nor
 *   the local part only (part before `@`), case-insensitive.
 *
 * `validatePasswordForEmail` returns a machine-oriented `code` on failure (first Zod issue), e.g.
 * `min_length`, `max_length`, `require_upper`, `require_lower`, `require_digit`, `require_special`,
 * `not_email_or_local`.
 */

/** At least one character from this set (common punctuation; URL-safe in JSON). */
const SPECIAL_RE = /[!@#$%^&*()_+\-=[\]{}|;:,.?/]/

const base = z
  .string()
  .min(12, 'min_length')
  .max(128, 'max_length')
  .refine((p) => /[A-Z]/.test(p), 'require_upper')
  .refine((p) => /[a-z]/.test(p), 'require_lower')
  .refine((p) => /[0-9]/.test(p), 'require_digit')
  .refine((p) => SPECIAL_RE.test(p), 'require_special')

/** Zod schema for `password` given the account `email` (rejects password == email or local part). */
export const passwordForEmailSchema = (email: string) =>
  base.superRefine((password, ctx) => {
    const n = email.trim().toLowerCase()
    const at = n.indexOf('@')
    const local = at > 0 ? n.slice(0, at) : n
    const pl = password.toLowerCase()
    if (pl === n || pl === local) {
      ctx.addIssue({ code: 'custom', message: 'not_email_or_local' })
    }
  })

/** Returns whether `password` satisfies {@link passwordForEmailSchema} for `email`; `code` is the first failure. */
export function validatePasswordForEmail(email: string, password: string): { ok: true } | { ok: false; code: string } {
  const r = passwordForEmailSchema(email).safeParse(password)
  if (r.success) {
    return { ok: true }
  }
  const issue = r.error.issues[0]
  return { ok: false, code: issue?.message ?? 'invalid_password' }
}
