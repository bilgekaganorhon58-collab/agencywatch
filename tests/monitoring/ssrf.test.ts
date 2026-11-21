import { describe, it, expect, vi } from 'vitest'
import {
  isPrivateOrReservedIp,
  validateTargetUrl,
  safeFetchOnce,
  safeFetchWithRedirects,
} from '@/lib/monitoring/ssrf'

vi.mock('node:dns/promises', () => ({
  default: {
    lookup: vi.fn().mockResolvedValue([{ address: '93.184.216.34', family: 4 }]),
  },
}))

vi.mock('node:http', () => {
  const { EventEmitter } = require('node:events')
  return {
    default: {
      request: vi.fn((options: { path?: string }, callback: (res: any) => void) => {
        const req = new EventEmitter()
        ;(req as { destroy: (error?: Error) => void }).destroy = vi.fn()
        ;(req as { write: (chunk: unknown) => void }).write = vi.fn()
        ;(req as { end: () => void }).end = vi.fn(() => {
          if (options.path === '/redirected') {
            const res = new EventEmitter()
            ;(res as { statusCode: number }).statusCode = 200
            ;(res as { statusMessage: string }).statusMessage = 'OK'
            ;(res as { headers: Record<string, string> }).headers = {}
            callback(res)
            setTimeout(() => {
              res.emit('data', Buffer.from('slow'))
            }, 50)
            return
          }

          if (options.path === '/slow') {
            const res = new EventEmitter()
            ;(res as { statusCode: number }).statusCode = 200
            ;(res as { statusMessage: string }).statusMessage = 'OK'
            ;(res as { headers: Record<string, string> }).headers = {}
            callback(res)
            setTimeout(() => {
              res.emit('data', Buffer.from('slow'))
            }, 50)
            return
          }

          if (options.path === '/') {
            const res = new EventEmitter()
            ;(res as { statusCode: number }).statusCode = 302
            ;(res as { statusMessage: string }).statusMessage = 'Found'
            ;(res as { headers: Record<string, string> }).headers = {
              location: '/redirected',
            }
            callback(res)
            process.nextTick(() => res.emit('end'))
            return
          }

          const res = new EventEmitter()
          ;(res as { statusCode: number }).statusCode = 200
          ;(res as { statusMessage: string }).statusMessage = 'OK'
          ;(res as { headers: Record<string, string> }).headers = {}
          callback(res)
          process.nextTick(() => {
            res.emit('data', Buffer.from('ok'))
            res.emit('end')
          })
        })
        return req
      }),
    },
  }
})

vi.mock('node:https', () => {
  const { EventEmitter } = require('node:events')
  return {
    default: {
      request: vi.fn((options: { path?: string }, callback: (res: any) => void) => {
        const req = new EventEmitter()
        ;(req as { destroy: (error?: Error) => void }).destroy = vi.fn()
        ;(req as { write: (chunk: unknown) => void }).write = vi.fn()
        ;(req as { end: () => void }).end = vi.fn(() => {
          const res = new EventEmitter()
          ;(res as { statusCode: number }).statusCode = 200
          ;(res as { statusMessage: string }).statusMessage = 'OK'
          ;(res as { headers: Record<string, string> }).headers = {}
          callback(res)
          process.nextTick(() => {
            res.emit('data', Buffer.from('ok'))
            res.emit('end')
          })
        })
        return req
      }),
    },
  }
})

describe('isPrivateOrReservedIp', () => {
  it('blocks IPv4 loopback and private ranges', () => {
    expect(isPrivateOrReservedIp('127.0.0.1')).toBe(true)
    expect(isPrivateOrReservedIp('10.0.0.1')).toBe(true)
    expect(isPrivateOrReservedIp('192.168.1.1')).toBe(true)
    expect(isPrivateOrReservedIp('172.16.0.1')).toBe(true)
    expect(isPrivateOrReservedIp('169.254.1.1')).toBe(true)
  })

  it('allows public IPv4 addresses', () => {
    expect(isPrivateOrReservedIp('8.8.8.8')).toBe(false)
    expect(isPrivateOrReservedIp('93.184.216.34')).toBe(false)
  })

  it('blocks IPv6 loopback, ULA, link-local and multicast', () => {
    expect(isPrivateOrReservedIp('::1')).toBe(true)
    expect(isPrivateOrReservedIp('fc00::1')).toBe(true)
    expect(isPrivateOrReservedIp('fe80::1')).toBe(true)
    expect(isPrivateOrReservedIp('ff02::1')).toBe(true)
  })

  it('blocks IPv4-mapped private IPv6 addresses', () => {
    expect(isPrivateOrReservedIp('::ffff:127.0.0.1')).toBe(true)
    expect(isPrivateOrReservedIp('::ffff:192.168.1.1')).toBe(true)
  })

  it('allows public IPv6 addresses', () => {
    expect(isPrivateOrReservedIp('2606:4700:4700::1111')).toBe(false)
  })
})

describe('validateTargetUrl', () => {
  it('accepts valid public http/https URLs', () => {
    expect(validateTargetUrl('https://example.com/path?q=1').ok).toBe(true)
    expect(validateTargetUrl('http://example.com').ok).toBe(true)
  })

  it('rejects non-http protocols', () => {
    expect(validateTargetUrl('ftp://example.com').ok).toBe(false)
    expect(validateTargetUrl('file:///etc/passwd').ok).toBe(false)
  })

  it('rejects URLs with credentials', () => {
    expect(validateTargetUrl('https://user:pass@example.com').ok).toBe(false)
  })

  it('rejects private IP literals', () => {
    expect(validateTargetUrl('http://127.0.0.1').ok).toBe(false)
    expect(validateTargetUrl('http://192.168.1.1').ok).toBe(false)
  })

  it('rejects invalid URLs', () => {
    expect(validateTargetUrl('not a url').ok).toBe(false)
  })
})

describe('isPrivateOrReservedIp IPv6 ranges', () => {
  it('blocks special-purpose IPv6 ranges', () => {
    expect(isPrivateOrReservedIp('::')).toBe(true)
    expect(isPrivateOrReservedIp('2001::1')).toBe(true)
    expect(isPrivateOrReservedIp('2001:db8::1')).toBe(true)
    expect(isPrivateOrReservedIp('2002::1')).toBe(true)
    expect(isPrivateOrReservedIp('64:ff9b::1')).toBe(true)
    expect(isPrivateOrReservedIp('100::1')).toBe(true)
    expect(isPrivateOrReservedIp('fc00::1')).toBe(true)
    expect(isPrivateOrReservedIp('fe80::1')).toBe(true)
    expect(isPrivateOrReservedIp('ff02::1')).toBe(true)
  })

  it('allows public IPv6 addresses', () => {
    expect(isPrivateOrReservedIp('2001:4860:4860::8888')).toBe(false)
    expect(isPrivateOrReservedIp('2606:4700:4700::1111')).toBe(false)
  })
})

describe('safeFetch total timeout', () => {
  it('stops slow-trickle responses at the total timeout', async () => {
    const startedAt = Date.now()
    await expect(
      safeFetchOnce('http://example.com/slow', { timeoutMs: 3000 }),
    ).rejects.toThrow('Request timed out')
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(2900)
  }, 10000)

  it('does not let redirect chains exceed the total timeout', async () => {
    const startedAt = Date.now()
    await expect(
      safeFetchWithRedirects('http://example.com/', { timeoutMs: 3000 }),
    ).rejects.toThrow('Request timed out')
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(2900)
  }, 10000)

  it('clears the total timeout timer after a successful request', async () => {
    vi.useFakeTimers()
    const requestPromise = safeFetchOnce('http://example.com/ok', { timeoutMs: 3000 })
    await requestPromise
    expect(vi.getTimerCount()).toBe(0)
    vi.useRealTimers()
  })
})
