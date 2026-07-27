'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Home, BookOpen, PlusCircle, BarChart3, Map } from 'lucide-react'
import clsx from 'clsx'
import { useT } from '@/lib/i18n'
import { nav as dict } from '@/lib/i18n/nav'

const TABS = [
  { href: '/', key: 'home', icon: Home },
  { href: '/logbook', key: 'logbook', icon: BookOpen },
  { href: '/flights/new', key: 'log', icon: PlusCircle },
  { href: '/stats', key: 'stats', icon: BarChart3 },
  { href: '/map', key: 'map', icon: Map },
] as const

export default function Nav() {
  const pathname = usePathname()
  const L = useT(dict)
  return (
    <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-app-line bg-app-surface pb-safe">
      <div className="mx-auto flex max-w-lg">
        {TABS.map(({ href, key, icon: Icon }) => {
          const active = pathname === href || (href !== '/' && pathname.startsWith(href))
          return (
            <Link
              key={href}
              href={href}
              className={clsx(
                'flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]',
                active ? 'text-app-accent font-semibold' : 'text-app-hint'
              )}
            >
              <Icon size={22} strokeWidth={active ? 2.4 : 1.8} />
              <span className="whitespace-nowrap">{L[key]}</span>
            </Link>
          )
        })}
      </div>
    </nav>
  )
}
