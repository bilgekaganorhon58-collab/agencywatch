import dns from 'node:dns/promises'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'

export type SafeFetchResult = {
  status: number
  statusText: string
  headers: Record<string, string>
  body: Buffer
  url: string
}

export type SafeFetchOptions = {
  method?: string
  headers?: Record<string, string>
  body?: string | Buffer
  timeoutMs?: number
  maxResponseBytes?: number
  totalTimeoutMs?: number
  deadline?: number
}

const DEFAULT_TIMEOUT_MS = 5000
const DEFAULT_MAX_RESPONSE_BYTES = 1024 * 1024 // 1 MiB

function ipv4ToNumber(ip: string): number | null {
  const parts = ip.split('.')
  if (parts.length !== 4) return null
  let value = 0
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null
    const octet = Number(part)
    if (octet < 0 || octet > 255) return null
    value = (value << 8) + octet
  }
  // Convert to unsigned 32-bit
  return value >>> 0
}

function isPrivateIpv4(ip: string): boolean {
  const value = ipv4ToNumber(ip)
  if (value === null) return true

  const inRange = (start: number, end: number) =>
    value >= (start >>> 0) && value <= (end >>> 0)

  // 0.0.0.0/8
  if (inRange(0x00000000, 0x00ffffff)) return true
  // 10.0.0.0/8
  if (inRange(0x0a000000, 0x0affffff)) return true
  // 100.64.0.0/10
  if (inRange(0x64400000, 0x647fffff)) return true
  // 127.0.0.0/8
  if (inRange(0x7f000000, 0x7fffffff)) return true
  // 169.254.0.0/16
  if (inRange(0xa9fe0000, 0xa9feffff)) return true
  // 172.16.0.0/12
  if (inRange(0xac100000, 0xac1fffff)) return true
  // 192.0.0.0/24
  if (inRange(0xc0000000, 0xc00000ff)) return true
  // 192.0.2.0/24
  if (inRange(0xc0000200, 0xc00002ff)) return true
  // 192.168.0.0/16
  if (inRange(0xc0a80000, 0xc0a8ffff)) return true
  // 198.18.0.0/15
  if (inRange(0xc6120000, 0xc613ffff)) return true
  // 198.51.100.0/24
  if (inRange(0xc6336400, 0xc63364ff)) return true
  // 203.0.113.0/24
  if (inRange(0xcb007100, 0xcb0071ff)) return true
  // 224.0.0.0/4 (multicast)
  if (inRange(0xe0000000, 0xefffffff)) return true
  // 240.0.0.0/4 (reserved)
  if (inRange(0xf0000000, 0xffffffff)) return true

  return false
}

function isIn2001Slash23(ip: string): boolean {
  const match = ip.match(/^2001:([0-9a-f]{0,4})(?::|$)/i)
  if (!match) return false
  const secondGroup = match[1] === '' ? 0 : Number.parseInt(match[1], 16)
  return !Number.isNaN(secondGroup) && secondGroup <= 0x01ff
}

function isPrivateIpv6(ip: string): boolean {
  const lower = ip.toLowerCase()

  // IPv4-mapped IPv6: ::ffff:a.b.c.d
  const mappedMatch = lower.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)
  if (mappedMatch) {
    return isPrivateIpv4(mappedMatch[1])
  }

  // IPv4-compatible IPv6 (deprecated): ::a.b.c.d
  const compatibleMatch = lower.match(/^::(\d+\.\d+\.\d+\.\d+)$/)
  if (compatibleMatch) {
    return isPrivateIpv4(compatibleMatch[1])
  }

  if (lower === '::' || lower === '::1') return true
  // fc00::/7 (ULA)
  if (lower.startsWith('fc') || lower.startsWith('fd')) return true
  // fe80::/10 (link-local)
  if (/^fe[89ab]/.test(lower)) return true
  // ff00::/8 (multicast)
  if (lower.startsWith('ff')) return true
  // 2001:db8::/32 (documentation)
  if (lower.startsWith('2001:db8')) return true
  // 2001::/23 (IETF protocol assignments / Teredo)
  if (isIn2001Slash23(lower)) return true
  // 2002::/16 (6to4, can encapsulate IPv4)
  if (lower.startsWith('2002:')) return true
  // 64:ff9b::/96 and 64:ff9b:1::/48 (NAT64)
  if (lower.startsWith('64:ff9b:')) return true
  // 100::/64 (discard prefix)
  if (lower.startsWith('100:')) return true

  return false
}

export function isPrivateOrReservedIp(ip: string): boolean {
  const family = net.isIP(ip)
  if (family === 4) return isPrivateIpv4(ip)
  if (family === 6) return isPrivateIpv6(ip)
  return true
}

export function validateTargetUrl(input: string): {
  ok: boolean
  reason?: string
  url?: URL
} {
  let url: URL
  try {
    url = new URL(input.trim())
  } catch {
    return { ok: false, reason: 'Invalid URL' }
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'Only HTTP and HTTPS URLs are allowed' }
  }

  if (url.username !== '' || url.password !== '') {
    return { ok: false, reason: 'URLs with credentials are not allowed' }
  }

  if (url.hostname === '') {
    return { ok: false, reason: 'URL hostname is required' }
  }

  // If the hostname is already an IP literal, validate it immediately.
  if (net.isIP(url.hostname) !== 0) {
    if (isPrivateOrReservedIp(url.hostname)) {
      return { ok: false, reason: 'Target IP address is not allowed' }
    }
  }

  return { ok: true, url }
}

export async function resolveAndValidateHostname(
  hostname: string,
): Promise<{ ok: boolean; reason?: string; addresses?: string[] }> {
  if (net.isIP(hostname) !== 0) {
    if (isPrivateOrReservedIp(hostname)) {
      return { ok: false, reason: 'Target IP address is not allowed' }
    }
    return { ok: true, addresses: [hostname] }
  }

  let records: { address: string; family: number }[]
  try {
    records = await dns.lookup(hostname, { all: true, verbatim: true })
  } catch {
    return { ok: false, reason: 'DNS resolution failed' }
  }

  if (!records || records.length === 0) {
    return { ok: false, reason: 'DNS resolution returned no addresses' }
  }

  const addresses = records.map((record) => record.address)
  for (const address of addresses) {
    if (isPrivateOrReservedIp(address)) {
      return { ok: false, reason: 'Resolved IP address is not allowed' }
    }
  }

  return { ok: true, addresses }
}

export async function validateFetchTarget(urlString: string): Promise<{
  ok: boolean
  reason?: string
  url?: URL
  addresses?: string[]
}> {
  const urlValidation = validateTargetUrl(urlString)
  if (!urlValidation.ok || !urlValidation.url) {
    return { ok: false, reason: urlValidation.reason }
  }

  const dnsValidation = await resolveAndValidateHostname(urlValidation.url.hostname)
  if (!dnsValidation.ok) {
    return { ok: false, reason: dnsValidation.reason }
  }

  return {
    ok: true,
    url: urlValidation.url,
    addresses: dnsValidation.addresses,
  }
}

function toHostHeader(url: URL): string {
  // url.host already includes the port when non-default.
  return url.host
}

function performSingleRequest(
  url: URL,
  address: string,
  options: SafeFetchOptions,
): Promise<SafeFetchResult> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES
  const method = options.method ?? 'GET'
  const isHttps = url.protocol === 'https:'
  const requestModule = isHttps ? https : http

  const port = url.port
    ? Number(url.port)
    : isHttps
      ? 443
      : 80

  // IPv6 addresses must be bracketed in the connection target.
  const connectionHost = net.isIP(address) === 6 ? `[${address}]` : address

  const requestOptions: http.RequestOptions = {
    protocol: url.protocol,
    hostname: connectionHost,
    port,
    path: `${url.pathname}${url.search}`,
    method,
    headers: {
      ...options.headers,
      Host: toHostHeader(url),
    },
    timeout: Math.min(timeoutMs, Math.max(0, (options.deadline ?? Date.now() + timeoutMs) - Date.now())),
  }

  if (isHttps) {
    // Preserve SNI for TLS while connecting to the pinned IP.
    ;(requestOptions as https.RequestOptions).servername = url.hostname
  }

  const deadline = options.deadline ?? Date.now() + (options.totalTimeoutMs ?? timeoutMs ?? DEFAULT_TIMEOUT_MS)
  const remainingMs = Math.max(0, deadline - Date.now())
  if (remainingMs <= 0) {
    return Promise.reject(new Error('Request timed out'))
  }

  return new Promise<SafeFetchResult>((resolve, reject) => {
    let settled = false
    let totalTimer: NodeJS.Timeout | null = null

    const clearTotalTimer = () => {
      if (totalTimer) {
        clearTimeout(totalTimer)
        totalTimer = null
      }
    }

    const succeed = (value: SafeFetchResult) => {
      if (settled) return
      settled = true
      clearTotalTimer()
      resolve(value)
    }

    const fail = (error: Error) => {
      if (settled) return
      settled = true
      clearTotalTimer()
      reject(error)
    }

    const request = requestModule.request(requestOptions, (response) => {
      const chunks: Buffer[] = []
      let totalBytes = 0
      let tooLarge = false

      response.on('data', (chunk: Buffer) => {
        totalBytes += chunk.length
        if (totalBytes > maxBytes) {
          tooLarge = true
          request.destroy()
          fail(new Error('Response exceeded maximum allowed size'))
          return
        }
        chunks.push(chunk)
      })

      response.on('end', () => {
        if (tooLarge || settled) return
        const headers: Record<string, string> = {}
        for (const [key, value] of Object.entries(response.headers)) {
          if (typeof value === 'string') headers[key] = value
          else if (Array.isArray(value)) headers[key] = value.join(', ')
        }

        succeed({
          status: response.statusCode ?? 0,
          statusText: response.statusMessage ?? '',
          headers,
          body: Buffer.concat(chunks),
          url: url.toString(),
        })
      })

      response.on('error', (error) => {
        fail(error)
      })
    })

    totalTimer = setTimeout(() => {
      if (settled) return
      settled = true
      clearTotalTimer()
      request.destroy()
      reject(new Error('Request timed out'))
    }, remainingMs)

    request.on('timeout', () => {
      request.destroy()
      fail(new Error('Request timed out'))
    })

    request.on('error', (error) => {
      fail(error)
    })

    if (options.body) {
      request.write(options.body)
    }

    request.end()
  })
}

export async function safeFetchOnce(
  urlString: string,
  options: SafeFetchOptions = {},
): Promise<SafeFetchResult> {
  const totalTimeoutMs = options.totalTimeoutMs ?? options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const deadline = options.deadline ?? Date.now() + totalTimeoutMs
  const remainingMs = deadline - Date.now()
  if (remainingMs <= 0) {
    throw new Error('Request timed out')
  }

  const validation = await validateFetchTarget(urlString)
  if (!validation.ok || !validation.url || !validation.addresses?.length) {
    throw new Error(validation.reason ?? 'Unsafe fetch target')
  }

  const url = validation.url
  const addresses = validation.addresses

  // Try each resolved (and already validated) address in turn.
  let lastError: unknown
  for (const address of addresses) {
    try {
      return await performSingleRequest(url, address, {
        ...options,
        deadline,
        totalTimeoutMs,
      })
    } catch (error) {
      lastError = error
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error('Safe fetch failed')
}

export async function safeFetchWithRedirects(
  startUrl: string,
  options: SafeFetchOptions = {},
  maxRedirects = 3,
): Promise<SafeFetchResult> {
  const totalTimeoutMs = options.totalTimeoutMs ?? options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const deadline = Date.now() + totalTimeoutMs

  let currentUrl = startUrl
  let method = options.method ?? 'GET'
  let body = options.body

  for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount++) {
    if (Date.now() >= deadline) {
      throw new Error('Request timed out')
    }

    const result = await safeFetchOnce(currentUrl, {
      ...options,
      method,
      body,
      deadline,
      totalTimeoutMs,
    })

    const location = result.headers.location
    const isRedirect =
      (result.status === 301 ||
        result.status === 302 ||
        result.status === 303 ||
        result.status === 307 ||
        result.status === 308) &&
      typeof location === 'string'

    if (!isRedirect) {
      return { ...result, url: currentUrl }
    }

    if (redirectCount === maxRedirects) {
      throw new Error('Too many redirects')
    }

    const nextUrl = new URL(location, currentUrl).toString()

    // Re-validate every redirect target before following it.
    const redirectValidation = await validateFetchTarget(nextUrl)
    if (!redirectValidation.ok) {
      throw new Error(redirectValidation.reason ?? 'Unsafe redirect target')
    }

    // 301/302/303 commonly change the method to GET.
    if (result.status === 301 || result.status === 302 || result.status === 303) {
      method = 'GET'
      body = undefined
    }

    currentUrl = nextUrl
  }

  throw new Error('Too many redirects')
}
