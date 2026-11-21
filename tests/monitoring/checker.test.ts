import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/monitoring/ssrf', () => ({
  safeFetchWithRedirects: vi.fn(),
}))

import { checkWebsite } from '@/lib/monitoring/checker'
import { safeFetchWithRedirects } from '@/lib/monitoring/ssrf'

const mockedFetch = vi.mocked(safeFetchWithRedirects)

describe('checkWebsite', () => {
  beforeEach(() => {
    mockedFetch.mockReset()
  })

  it('returns success for 200 responses', async () => {
    mockedFetch.mockResolvedValue({
      status: 200,
      statusText: 'OK',
      headers: {},
      body: Buffer.from(''),
      url: 'https://example.com',
    })

    const result = await checkWebsite('https://example.com')

    expect(result.success).toBe(true)
    expect(result.statusCode).toBe(200)
    expect(result.responseTimeMs).toBeGreaterThanOrEqual(0)
    expect(mockedFetch).toHaveBeenCalledWith(
      'https://example.com',
      expect.objectContaining({ timeoutMs: expect.any(Number) }),
    )
  })

  it('returns failure for 404 responses', async () => {
    mockedFetch.mockResolvedValue({
      status: 404,
      statusText: 'Not Found',
      headers: {},
      body: Buffer.from(''),
      url: 'https://example.com/missing',
    })

    const result = await checkWebsite('https://example.com/missing')

    expect(result.success).toBe(false)
    expect(result.statusCode).toBe(404)
  })

  it('returns failure for 500 responses', async () => {
    mockedFetch.mockResolvedValue({
      status: 500,
      statusText: 'Internal Server Error',
      headers: {},
      body: Buffer.from(''),
      url: 'https://example.com',
    })

    const result = await checkWebsite('https://example.com')

    expect(result.success).toBe(false)
    expect(result.statusCode).toBe(500)
  })

  it('classifies timeouts', async () => {
    mockedFetch.mockRejectedValue(new Error('Request timed out'))

    const result = await checkWebsite('https://example.com')

    expect(result.success).toBe(false)
    expect(result.statusCode).toBeNull()
    expect(result.errorType).toBe('timeout')
  })

  it('classifies DNS errors', async () => {
    mockedFetch.mockRejectedValue(new Error('DNS resolution failed'))

    const result = await checkWebsite('https://example.com')

    expect(result.errorType).toBe('dns')
  })

  it('classifies TLS errors', async () => {
    mockedFetch.mockRejectedValue(
      new Error('unable to verify the first certificate'),
    )

    const result = await checkWebsite('https://example.com')

    expect(result.errorType).toBe('tls')
  })

  it('classifies connection errors', async () => {
    const error = new Error('connect ECONNREFUSED 127.0.0.1:443')
    ;(error as { code?: string }).code = 'ECONNREFUSED'
    mockedFetch.mockRejectedValue(error)

    const result = await checkWebsite('https://example.com')

    expect(result.errorType).toBe('connection')
  })

  it('classifies redirect errors', async () => {
    mockedFetch.mockRejectedValue(new Error('Too many redirects'))

    const result = await checkWebsite('https://example.com')

    expect(result.errorType).toBe('redirect')
  })

  it('uses the SSRF module instead of direct fetch', async () => {
    mockedFetch.mockResolvedValue({
      status: 204,
      statusText: 'No Content',
      headers: {},
      body: Buffer.from(''),
      url: 'https://example.com',
    })

    await checkWebsite('https://example.com')

    expect(mockedFetch).toHaveBeenCalled()
  })
})
