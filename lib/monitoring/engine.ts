import { randomUUID } from 'node:crypto'

import { createAdminClient } from '@/lib/supabase/admin'
import { checkWebsite } from '@/lib/monitoring/checker'
import type { Monitor } from '@/types/database'

export type MonitoringRunResult = {
  totalFound: number
  checked: number
  successful: number
  failed: number
  recordErrors: number
}

const MONITOR_BATCH_SIZE = 5
const MAX_RUN_MS = 8000
const CHECK_TIMEOUT_MS = 5000
const LEASE_SECONDS = 60

export async function runMonitoringCycle(options?: {
  now?: Date
}): Promise<MonitoringRunResult> {
  const startedAt = Date.now()
  const now = options?.now ?? new Date()

  // Each cycle gets a unique worker token. Claimed monitors are tied to this
  // token, so a stale worker cannot overwrite a monitor after another worker
  // has claimed it.
  const workerToken = randomUUID()

  // NOTE: Atomic claiming is provided by claim_due_monitors. Concurrent workers
  // should call this RPC instead of selecting monitors directly.
  const admin = createAdminClient()

  const result: MonitoringRunResult = {
    totalFound: 0,
    checked: 0,
    successful: 0,
    failed: 0,
    recordErrors: 0,
  }

  for (;;) {
    if (Date.now() - startedAt > MAX_RUN_MS) {
      break
    }

    const { data, error } = await admin.rpc('claim_due_monitors', {
      p_batch_size: MONITOR_BATCH_SIZE,
      p_lease_seconds: LEASE_SECONDS,
      p_worker_token: workerToken,
    })

    if (error) {
      throw new Error(error.message ?? 'Failed to claim due monitors')
    }

    const claimedMonitors = (data ?? []) as Monitor[]
    if (claimedMonitors.length === 0) {
      break
    }

    result.totalFound += claimedMonitors.length

    for (const monitor of claimedMonitors) {
      if (Date.now() - startedAt > MAX_RUN_MS) {
        break
      }

      result.checked += 1

      let checkSucceeded = false
      let checkResult: Awaited<ReturnType<typeof checkWebsite>> | null = null

      try {
        checkResult = await checkWebsite(monitor.url, {
          timeoutMs: CHECK_TIMEOUT_MS,
        })
        checkSucceeded = checkResult.success
      } catch (error) {
        result.failed += 1
        console.error(
          'Monitoring engine: unexpected error while processing monitor',
          error instanceof Error ? error.message : String(error),
        )
        await releaseLease(admin, monitor.id, workerToken)
        continue
      }

      const checkedAt = new Date().toISOString()
      const nextStatus = checkResult.success ? 'up' : 'down'
      const nextFailures = checkResult.success
        ? 0
        : monitor.consecutive_failures + 1

      // Update the monitor only while this worker still owns the lease. If the
      // lease expired and another worker claimed the monitor, this update affects
      // zero rows and the stale result is not written.
      const { data: updatedRows, error: updateError } = await admin
        .from('monitors')
        .update({
          status: nextStatus,
          last_checked_at: checkedAt,
          last_response_time_ms: checkResult.responseTimeMs,
          last_status_code: checkResult.statusCode,
          consecutive_failures: nextFailures,
        })
        .eq('id', monitor.id)
        .eq('check_lease_token', workerToken)
        .select('id')

      if (updateError) {
        result.recordErrors += 1
        console.error(
          'Monitoring engine: failed to update monitor',
          updateError.message,
        )
      } else if (!updatedRows || updatedRows.length === 0) {
        result.recordErrors += 1
        console.error(
          'Monitoring engine: monitor lease is no longer owned by this worker; result not written',
        )
      } else {
        const { error: insertError } = await admin.from('monitor_checks').insert({
          monitor_id: monitor.id,
          status_code: checkResult.statusCode,
          response_time_ms: checkResult.responseTimeMs,
          success: checkResult.success,
          error_message: checkResult.errorMessage ?? null,
          checked_at: checkedAt,
        })

        if (insertError) {
          result.recordErrors += 1
          console.error(
            'Monitoring engine: failed to insert monitor check',
            insertError.message,
          )
        }
      }

      if (checkResult.success) {
        result.successful += 1
      } else {
        result.failed += 1
      }

      await releaseLease(admin, monitor.id, workerToken)
    }
  }

  return result
}

async function releaseLease(
  admin: ReturnType<typeof createAdminClient>,
  monitorId: string,
  workerToken: string,
): Promise<void> {
  // Cleanup is conditioned on the worker token, so a stale worker can only
  // clear a lease that it still owns.
  const { error } = await admin
    .from('monitors')
    .update({
      check_lease_token: null,
      check_lease_expires_at: null,
    })
    .eq('id', monitorId)
    .eq('check_lease_token', workerToken)

  if (error) {
    console.error('Monitoring engine: failed to release monitor lease', error.message)
  }
}
