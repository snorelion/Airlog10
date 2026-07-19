'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, BookOpen, PlusCircle, BarChart3, Map } from 'lucide-react'
import clsx from 'clsx'

const TABS = [
  { href: '/', label: '홈', icon: Home },
  { href: '/logbook', label: '로그북', icon: BookOpen },
  { href: '/flights/new', label: '기록', icon: PlusCircle },
  { href: '/stats', label: '통계', icon: BarChart3 },
  { href: '/map', label: '지도', icon: Map },
]

export default function Nav() {
  const pathname = usePathname()
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-ink-line bg-white pb-safe">
      <div className="mx-auto flex max-w-lg">
        {TABS.map(({ href, label, icon: Icon }) => {
          const active = pathname === href
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]',
                active ? 'text-air-600 font-semibold' : 'text-ink-hint'
              )}
            >
              <Icon size={22} strokeWidth={active ? 2.4 : 1.8} />
              {label}
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
