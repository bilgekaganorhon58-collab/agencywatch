'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const items = [
  { label: 'Overview', href: '/dashboard', enabled: true },
  { label: 'Monitors', href: '/dashboard', enabled: true },
  { label: 'Incidents', href: '#', enabled: false },
  { label: 'Reports', href: '#', enabled: false },
  { label: 'Settings', href: '#', enabled: false },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="hidden w-64 shrink-0 border-r border-slate-200 bg-slate-50 md:flex md:flex-col">
      <div className="flex h-16 items-center border-b border-slate-200 px-6">
        <span className="text-lg font-semibold tracking-tight text-slate-900">AgencyWatch</span>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-4">
        {items.map((item) => {
          const active = item.enabled && pathname === item.href
          if (!item.enabled) {
            return (
              <span
                key={item.label}
                className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-400"
              >
                {item.label}
                <span className="text-[10px] uppercase tracking-wide">Soon</span>
              </span>
            )
          }
          return (
            <Link
              key={item.label}
              href={item.href}
              className={cn(
                'rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                active ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-200',
              )}
            >
              {item.label}
            </Link>
          )
        })}
      </nav>
    </aside>
  )
}
