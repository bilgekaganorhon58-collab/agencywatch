import { Badge } from '@/components/ui/badge'
import type { MonitorStatus } from '@/types/database'

const toneMap: Record<MonitorStatus, 'neutral' | 'success' | 'danger' | 'warning'> = {
  unknown: 'neutral',
  up: 'success',
  down: 'danger',
  degraded: 'warning',
}

const labelMap: Record<MonitorStatus, string> = {
  unknown: 'Unknown',
  up: 'Operational',
  down: 'Down',
  degraded: 'Degraded',
}

export function StatusBadge({ status }: { status: MonitorStatus }) {
  return <Badge tone={toneMap[status]}>{labelMap[status]}</Badge>
}
