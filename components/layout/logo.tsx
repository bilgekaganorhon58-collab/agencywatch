import Link from 'next/link'

export function Logo() {
  return (
    <Link href="/dashboard" className="flex items-center gap-2">
      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-900 text-sm font-bold text-white">
        A
      </span>
      <span className="text-lg font-semibold tracking-tight text-slate-900">AgencyWatch</span>
    </Link>
  )
}
