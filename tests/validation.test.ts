import { describe, it, expect } from 'vitest'
import { monitorSchema } from '@/lib/validation/monitor'
import { loginSchema, signupSchema } from '@/lib/validation/auth'

describe('monitorSchema', () => {
  it('accepts valid http/https urls', () => {
    const result = monitorSchema.safeParse({ name: 'Site', url: 'https://example.com' })
    expect(result.success).toBe(true)
  })

  it('rejects ftp urls', () => {
    const result = monitorSchema.safeParse({ name: 'Site', url: 'ftp://example.com' })
    expect(result.success).toBe(false)
  })

  it('rejects invalid urls', () => {
    const result = monitorSchema.safeParse({ name: 'Site', url: 'not-a-url' })
    expect(result.success).toBe(false)
  })

  it('requires a name', () => {
    const result = monitorSchema.safeParse({ name: '', url: 'https://example.com' })
    expect(result.success).toBe(false)
  })
})

describe('loginSchema', () => {
  it('requires email and password', () => {
    const result = loginSchema.safeParse({ email: '', password: '' })
    expect(result.success).toBe(false)
  })

  it('accepts valid credentials', () => {
    const result = loginSchema.safeParse({ email: 'a@b.com', password: 'secret' })
    expect(result.success).toBe(true)
  })
})

describe('signupSchema', () => {
  it('requires 8 char password', () => {
    const result = signupSchema.safeParse({ email: 'a@b.com', password: 'short' })
    expect(result.success).toBe(false)
  })

  it('accepts valid signup', () => {
    const result = signupSchema.safeParse({ email: 'a@b.com', password: 'longenough' })
    expect(result.success).toBe(true)
  })
})
