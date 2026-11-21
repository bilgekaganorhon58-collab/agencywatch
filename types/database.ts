export type MonitorStatus = 'unknown' | 'up' | 'down' | 'degraded'

export type Monitor = {
  id: string
  organization_id: string
  name: string
  url: string
  status: MonitorStatus
  check_interval_seconds: number
  last_checked_at: string | null
  last_response_time_ms: number | null
  last_status_code: number | null
  consecutive_failures: number
  created_at: string
  updated_at: string
}

export type MonitorCheck = {
  id: string
  monitor_id: string
  status_code: number | null
  response_time_ms: number | null
  success: boolean
  error_message: string | null
  checked_at: string
}

export type Organization = {
  id: string
  name: string
  created_at: string
}

export type OrganizationMember = {
  id: string
  organization_id: string
  user_id: string
  role: string
  created_at: string
}
