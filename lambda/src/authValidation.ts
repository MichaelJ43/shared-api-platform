import { z } from 'zod'
import { validatePasswordForEmail } from './passwordPolicy'

export const emailSchema = z.string().trim().toLowerCase().min(1).max(256).email()

export const authBody = z.object({
  email: emailSchema,
  password: z.string().min(1).max(400),
  returnUrl: z.string().url().optional(),
})

export const registerBody = authBody.superRefine(({ email, password }, ctx) => {
  const r = validatePasswordForEmail(email, password)
  if (!r.ok) {
    ctx.addIssue({
      code: 'custom',
      message: r.code,
      path: ['password'],
    })
  }
})
