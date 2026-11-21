import { describe, it, expect, vi, beforeEach } from 'vitest'

const { mockFrom, mockRpc, createAdminClient } = vi.hoisted(() => {
  const mockFrom = vi.fn()
  const mockRpc = vi.fn()
  const createAdminClient = vi.fn(() => ({ from: mockFrom, rpc: mockRpc }))
  return { mockFrom, mockRpc, createAdminClient }
})

const { mockCheckWebsite } = vi.hoisted(() => ({
  mockCheckWebsite: vi.fn(),
}))

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient,
}))

vi.mock('@/lib/monitoring/checker', () => ({
  checkWebsite: mockCheckWebsite,
}))

import { runMonitoringCycle } from '@/lib/monitoring/engine'

function createUpdateChain(result: { data: unknown; error: unknown }) {
  const selectResult = Promise.resolve(result)
  const secondEq = Object.assign(Promise.resolve(result), {
    select: vi.fn(() => selectResult),
  })
  const firstEq = {
    eq: vi.fn(() => secondEq),
  }
  return {
    eq: vi.fn(() => firstEq),
  }
}

describe('runMonitoringCycle', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('claims monitors through the lease RPC and processes them', async () => {
    const monitors = [
      {
        id: 'monitor-1',
        organization_id: 'org-1',
        name: 'Site 1',
        url: 'https://site1.example',
        status: 'unknown',
        check_interval_seconds: 300,
        last_checked_at: null,
        last_response_time_ms: null,
        last_status_code: null,
        consecutive_failures: 0,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ]

    mockRpc
      .mockResolvedValueOnce({ data: monitors, error: null })
      .mockResolvedValue({ data: [], error: null })

    const insertMock = vi.fn().mockResolvedValue({ error: null })
    const updateChain = createUpdateChain({ data: [{ id: 'monitor-1' }], error: null })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'monitors') {
        return { update: vi.fn(() => updateChain) }
      }
      return { insert: insertMock }
    })

    mockCheckWebsite.mockResolvedValue({
      url: 'https://site1.example',
      statusCode: 200,
      responseTimeMs: 120,
      success: true,
    })

    const result = await runMonitoringCycle({ now: new Date('2026-01-01T00:10:00.000Z') })

    expect(mockRpc).toHaveBeenCalledWith('claim_due_monitors', {
      p_batch_size: 5,
      p_lease_seconds: 60,
      p_worker_token: expect.any(String),
    })
    expect(result).toEqual({
      totalFound: 1,
      checked: 1,
      successful: 1,
      failed: 0,
      recordErrors: 0,
    })
    expect(insertMock).toHaveBeenCalled()
  })

  it('does not overwrite a monitor when the lease token no longer matches', async () => {
    const monitors = [
      {
        id: 'monitor-1',
        organization_id: 'org-1',
        name: 'Site 1',
        url: 'https://site1.example',
        status: 'unknown',
        check_interval_seconds: 300,
        last_checked_at: null,
        last_response_time_ms: null,
        last_status_code: null,
        consecutive_failures: 0,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ]

    mockRpc
      .mockResolvedValueOnce({ data: monitors, error: null })
      .mockResolvedValue({ data: [], error: null })

    const insertMock = vi.fn().mockResolvedValue({ error: null })
    const updateChain = createUpdateChain({ data: [], error: null })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'monitors') {
        return { update: vi.fn(() => updateChain) }
      }
      return { insert: insertMock }
    })

    mockCheckWebsite.mockResolvedValue({
      url: 'https://site1.example',
      statusCode: 200,
      responseTimeMs: 120,
      success: true,
    })

    const result = await runMonitoringCycle({ now: new Date('2026-01-01T00:10:00.000Z') })

    expect(result.recordErrors).toBe(1)
    expect(result.successful).toBe(1)
    expect(insertMock).not.toHaveBeenCalled()
  })

  it('releases the lease only when the worker token still matches', async () => {
    const monitors = [
      {
        id: 'monitor-1',
        organization_id: 'org-1',
        name: 'Site 1',
        url: 'https://site1.example',
        status: 'unknown',
        check_interval_seconds: 300,
        last_checked_at: null,
        last_response_time_ms: null,
        last_status_code: null,
        consecutive_failures: 0,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ]

    mockRpc
      .mockResolvedValueOnce({ data: monitors, error: null })
      .mockResolvedValue({ data: [], error: null })

    const updateResults = [
      { data: [{ id: 'monitor-1' }], error: null },
      { data: [], error: null },
    ]
    const updateMock = vi.fn(() => {
      const result = updateResults.shift() ?? { data: [], error: null }
      return createUpdateChain(result)
    })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'monitors') {
        return { update: updateMock }
      }
      return { insert: vi.fn().mockResolvedValue({ error: null }) }
    })

    mockCheckWebsite.mockResolvedValue({
      url: 'https://site1.example',
      statusCode: 500,
      responseTimeMs: 50,
      success: false,
      errorType: 'http' as const,
      errorMessage: 'Server error',
    })

    const result = await runMonitoringCycle({ now: new Date('2026-01-01T00:10:00.000Z') })

    expect(result.failed).toBe(1)
    expect(updateMock).toHaveBeenCalledTimes(2)
  })

  it('continues processing other monitors when one check fails', async () => {
    const monitors = [
      {
        id: 'monitor-1',
        organization_id: 'org-1',
        name: 'Site 1',
        url: 'https://site1.example',
        status: 'unknown',
        check_interval_seconds: 300,
        last_checked_at: null,
        last_response_time_ms: null,
        last_status_code: null,
        consecutive_failures: 0,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'monitor-2',
        organization_id: 'org-1',
        name: 'Site 2',
        url: 'https://site2.example',
        status: 'unknown',
        check_interval_seconds: 300,
        last_checked_at: null,
        last_response_time_ms: null,
        last_status_code: null,
        consecutive_failures: 0,
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ]

    mockRpc
      .mockResolvedValueOnce({ data: monitors, error: null })
      .mockResolvedValue({ data: [], error: null })

    const updateChain = createUpdateChain({ data: [{ id: 'monitor-1' }], error: null })
    const insertMock = vi.fn().mockResolvedValue({ error: null })

    mockFrom.mockImplementation((table: string) => {
      if (table === 'monitors') {
        return { update: vi.fn(() => updateChain) }
      }
      return { insert: insertMock }
    })

    mockCheckWebsite
      .mockRejectedValueOnce(new Error('unexpected checker failure'))
      .mockResolvedValueOnce({
        url: 'https://site2.example',
        statusCode: 200,
        responseTimeMs: 80,
        success: true,
      })

    const result = await runMonitoringCycle({ now: new Date('2026-01-01T00:10:00.000Z') })

    expect(result.totalFound).toBe(2)
    expect(result.checked).toBe(2)
    expect(result.successful).toBe(1)
    expect(result.failed).toBe(1)
  })

})
