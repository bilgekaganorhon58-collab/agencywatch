import { timingSafeEqual } from 'node:crypto'

import { NextResponse } from 'next/server'

import { runMonitoringCycle } from '@/lib/monitoring/engine'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 10

function isAuthorized(request: Request): boolean {
  const cronSecret = process.env.CRON_SECRET
  if (!cronSecret) {
    return false
  }

  const authorization = request.headers.get('authorization')
  if (!authorization) {
    return false
  }

  const [scheme, token] = authorization.split(' ', 2)
  if (scheme !== 'Bearer' || typeof token !== 'string' || token.length === 0) {
    return false
  }

  const expected = Buffer.from(cronSecret)
  const provided = Buffer.from(token)

  if (expected.length !== provided.length) {
    return false
  }

  return timingSafeEqual(expected, provided)
}

export async function POST(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await runMonitoringCycle()
    return NextResponse.json(result, { status: 200 })
  } catch (error) {
    console.error(
      'Cron monitor endpoint failed',
      error instanceof Error ? error.message : String(error),
    )

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 },
    )
  }
}
