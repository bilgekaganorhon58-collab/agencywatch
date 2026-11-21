import { deleteMonitor } from '@/app/actions/monitors'
import { StatusBadge } from '@/components/monitors/status-badge'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import type { Monitor } from '@/types/database'

type Props = {
  monitors: Monitor[]
}

export function MonitorList({ monitors }: Props) {
  if (monitors.length === 0) {
    return (
      <Card>
        <CardContent className="p-8 text-center">
          <p className="text-sm font-medium text-slate-900">No websites yet</p>
          <p className="mt-1 text-sm text-slate-500">
            Add your first website to start tracking its status.
          </p>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-5 py-3 font-medium">Name</th>
              <th className="px-5 py-3 font-medium">URL</th>
              <th className="px-5 py-3 font-medium">Status</th>
              <th className="px-5 py-3 font-medium">Interval</th>
              <th className="px-5 py-3 font-medium text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {monitors.map((monitor) => (
              <tr key={monitor.id} className="hover:bg-slate-50">
                <td className="px-5 py-3 font-medium text-slate-900">{monitor.name}</td>
                <td className="px-5 py-3 text-slate-600">
                  <a
                    href={monitor.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hover:underline"
                  >
                    {monitor.url}
                  </a>
                </td>
                <td className="px-5 py-3">
                  <StatusBadge status={monitor.status} />
                </td>
                <td className="px-5 py-3 text-slate-600">
                  {monitor.check_interval_seconds}s
                </td>
                <td className="px-5 py-3 text-right">
                  <form action={deleteMonitor}>
                    <input type="hidden" name="id" value={monitor.id} />
                    <Button type="submit" variant="ghost" size="sm" className="text-red-600 hover:bg-red-50">
                      Delete
                    </Button>
                  </form>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
