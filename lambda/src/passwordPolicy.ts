import { z } from 'zod'

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

export function validatePasswordForEmail(email: string, password: string): { ok: true } | { ok: false; code: string } {
  const r = passwordForEmailSchema(email).safeParse(password)
  if (r.success) {
    return { ok: true }
  }
  const issue = r.error.issues[0]
  return { ok: false, code: issue?.message ?? 'invalid_password' }
}
