export const dynamic = 'force-dynamic'

import { getMonitors } from '@/lib/monitors'
import { StatCard } from '@/components/dashboard/stat-card'
import { MonitorList } from '@/components/monitors/monitor-list'
import { AddMonitorForm } from '@/components/monitors/add-monitor-form'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'

export default async function DashboardPage() {
  const monitors = await getMonitors()

  const total = monitors.length
  const operational = monitors.filter((m) => m.status === 'up').length
  const problematic = monitors.filter((m) => m.status === 'down' || m.status === 'degraded').length
  const pending = monitors.filter((m) => m.status === 'unknown').length

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Overview</h1>
        <p className="text-sm text-slate-500">Monitor the health of your client websites.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total websites" value={total} />
        <StatCard label="Operational" value={operational} hint="Responding normally" />
        <StatCard label="Problematic" value={problematic} hint="Down or degraded" />
        <StatCard label="Pending" value={pending} hint="Awaiting first check" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Add a website</CardTitle>
          <CardDescription>Enter a name and URL. Initial status will be unknown.</CardDescription>
        </CardHeader>
        <CardContent>
          <AddMonitorForm />
        </CardContent>
      </Card>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Websites</h2>
        <MonitorList monitors={monitors} />
      </div>
    </div>
  )
}
