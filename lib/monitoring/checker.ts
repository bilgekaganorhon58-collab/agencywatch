import { safeFetchWithRedirects } from '@/lib/monitoring/ssrf'

export type CheckErrorType =
  | 'timeout'
  | 'dns'
  | 'tls'
  | 'connection'
  | 'ssrf'
  | 'redirect'
  | 'unknown'

export type CheckResult = {
  url: string
  statusCode: number | null
  responseTimeMs: number
  success: boolean
  errorType?: CheckErrorType
  errorMessage?: string
  finalUrl?: string
}

const MIN_TIMEOUT_MS = 3000
const MAX_TIMEOUT_MS = 5000
const MAX_RESPONSE_BYTES = 4096

function clampTimeout(timeoutMs: number | undefined): number {
  const requested = timeoutMs ?? MAX_TIMEOUT_MS
  return Math.min(Math.max(requested, MIN_TIMEOUT_MS), MAX_TIMEOUT_MS)
}

function classifyError(error: unknown): {
  errorType: CheckErrorType
  errorMessage: string
} {
  const err = error as { code?: string; message?: string; name?: string }
  const message = err?.message ?? String(error)
  const code = err?.code
  const lower = message.toLowerCase()

  if (
    lower.includes('timed out') ||
    lower.includes('timeout') ||
    err?.name === 'AbortError'
  ) {
    return { errorType: 'timeout', errorMessage: message }
  }

  if (
    lower.includes('dns resolution') ||
    lower.includes('dns') ||
    code === 'ENOTFOUND' ||
    code === 'EAI_AGAIN' ||
    code === 'ENODATA'
  ) {
    return { errorType: 'dns', errorMessage: message }
  }

  if (
    lower.includes('certificate') ||
    lower.includes('tls') ||
    lower.includes('ssl') ||
    (typeof code === 'string' && code.startsWith('ERR_TLS'))
  ) {
    return { errorType: 'tls', errorMessage: message }
  }

  if (lower.includes('too many redirects')) {
    return { errorType: 'redirect', errorMessage: message }
  }

  if (
    lower.includes('unsafe') ||
    lower.includes('not allowed') ||
    lower.includes('private') ||
    lower.includes('reserved')
  ) {
    return { errorType: 'ssrf', errorMessage: message }
  }

  if (
    code === 'ECONNREFUSED' ||
    code === 'ECONNRESET' ||
    code === 'EPIPE' ||
    code === 'EHOSTUNREACH' ||
    code === 'ENETUNREACH' ||
    lower.includes('connection')
  ) {
    return { errorType: 'connection', errorMessage: message }
  }

  return { errorType: 'unknown', errorMessage: message }
}

export async function checkWebsite(
  url: string,
  options: { timeoutMs?: number } = {},
): Promise<CheckResult> {
  const timeoutMs = clampTimeout(options.timeoutMs)
  const startedAt = Date.now()

  try {
    const result = await safeFetchWithRedirects(url, {
      method: 'GET',
      timeoutMs,
      maxResponseBytes: MAX_RESPONSE_BYTES,
    })

    const responseTimeMs = Date.now() - startedAt
    const success = result.status >= 200 && result.status < 300

    return {
      url,
      statusCode: result.status,
      responseTimeMs,
      success,
      finalUrl: result.url,
    }
  } catch (error) {
    const responseTimeMs = Date.now() - startedAt
    const { errorType, errorMessage } = classifyError(error)

    return {
      url,
      statusCode: null,
      responseTimeMs,
      success: false,
      errorType,
      errorMessage,
    }
  }
}
