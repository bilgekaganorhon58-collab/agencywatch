import { z } from 'zod'

export const monitorSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(120, 'Name is too long'),
  url: z
    .string()
    .trim()
    .refine((value) => {
      try {
        const parsed = new URL(value)
        return (
          (parsed.protocol === 'http:' || parsed.protocol === 'https:') &&
          parsed.hostname.length > 0
        )
      } catch {
        return false
      }
    }, 'Enter a valid HTTP or HTTPS URL'),
})

export type MonitorInput = z.infer<typeof monitorSchema>
