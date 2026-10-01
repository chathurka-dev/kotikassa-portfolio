'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import {
  LayoutDashboard,
  Receipt,
  Tag,
  TrendingUp,
  Settings,
  LogOut,
  ScanLine,
  Menu,
  X,
  LineChart,
  PiggyBank,
  BarChart2,
  Repeat,
  Wallet,
  Activity,
  Users,
  ScrollText,
  FileBarChart,
} from 'lucide-react'
import { createClient } from '@kotikassa/shared'
import { cn } from '@/lib/utils'
import LanguageSwitcher from './LanguageSwitcher'

interface SidebarProps {
  familyName: string
  userEmail: string
  displayName: string
}

export default function Sidebar({ familyName, userEmail, displayName }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()
  const t = useTranslations('sidebar')

  // Drawer open state -- only relevant on small screens.
  const [open, setOpen] = useState(false)
  // Tracks which href is currently navigating to block double-clicks.
  const [pendingHref, setPendingHref] = useState<string | null>(null)

  // Close the drawer and clear pending state whenever the route settles.
  useEffect(() => {
    setOpen(false)
    setPendingHref(null)
  }, [pathname])

  // Lock body scroll while the mobile drawer is open.
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
      return () => {
        document.body.style.overflow = ''
      }
    }
  }, [open])

  const NAV_ITEMS = [
    { href: '/', label: t('dashboard'), icon: LayoutDashboard },
    { href: '/scan', label: t('scanReceipt'), icon: ScanLine, highlight: true },
    { href: '/expenses', label: t('expenses'), icon: Receipt },
    { href: '/receipts', label: t('receipts'), icon: ScrollText },
    { href: '/recurring', label: t('recurring'), icon: Repeat },
    { href: '/categories', label: t('categories'), icon: Tag },
    { href: '/budgets', label: t('budgets'), icon: Wallet },
    { href: '/income', label: t('income'), icon: TrendingUp },
    { href: '/savings', label: t('savings'), icon: PiggyBank },
    { href: '/investments', label: t('investments'), icon: BarChart2 },
    { href: '/trends', label: t('trends'), icon: Activity },
    { href: '/reports', label: t('reports'), icon: FileBarChart },
    { href: '/people', label: t('people'), icon: Users },
    { href: '/price-history', label: t('priceHistory'), icon: LineChart },
    { href: '/settings', label: t('settings'), icon: Settings },
  ]

  const navigate = useCallback(
    (href: string) => {
      if (pendingHref) return
      if (href === pathname) {
        setOpen(false)
        return
      }
      setPendingHref(href)
      setOpen(false)
      router.push(href)
    },
    [pendingHref, pathname, router]
  )

  async function handleSignOut() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <>
      {/* Mobile top bar -- only visible below lg */}
      <header className="lg:hidden fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-gray-200 bg-white px-4">
        <button
          onClick={() => setOpen(true)}
          aria-label={t('openMenu')}
          className="-ml-1 rounded-lg p-2 text-gray-600 hover:bg-gray-100"
        >
          <Menu className="h-5 w-5" />
        </button>
        <span className="text-xl">🏠</span>
        <span className="text-sm font-bold text-gray-900">Kotikassa</span>
      </header>

      {/* Navigation overlay — blocks all page clicks while a route transition is in progress */}
      {pendingHref && <div className="fixed inset-0 z-40 cursor-wait" aria-hidden="true" />}

      {/* Overlay behind the drawer (mobile only) */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          aria-hidden="true"
          className="lg:hidden fixed inset-0 z-40 bg-black/40"
        />
      )}

      {/* Sidebar / drawer */}
      <aside
        className={cn(
          'flex h-screen w-60 flex-shrink-0 flex-col border-r border-gray-200 bg-white',
          // Mobile: off-canvas drawer; Desktop: in-flow sticky column
          'fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 ease-in-out',
          'lg:sticky lg:top-0 lg:z-auto lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Brand */}
        <div className="flex items-center gap-2 px-5 py-5 border-b border-gray-100">
          <span className="text-2xl">🏠</span>
          <div className="min-w-0">
            <div className="text-sm font-bold text-gray-900">Kotikassa</div>
            <div className="text-xs text-gray-500 truncate max-w-[130px]">{familyName}</div>
          </div>
          {/* Close button -- mobile only */}
          <button
            onClick={() => setOpen(false)}
            aria-label={t('closeMenu')}
            className="lg:hidden ml-auto rounded-lg p-2 text-gray-500 hover:bg-gray-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
          {NAV_ITEMS.map(({ href, label, icon: Icon, highlight }) => {
            const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href)
            const isPending = pendingHref === href
            const isNavigating = pendingHref !== null
            return (
              <button
                key={href}
                onClick={() => navigate(href)}
                disabled={isNavigating}
                className={cn(
                  'w-full flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                  isActive
                    ? 'bg-indigo-50 text-indigo-700'
                    : highlight
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-75'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 disabled:opacity-50'
                )}
              >
                {isPending ? (
                  <span className="h-4 w-4 flex-shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
                ) : (
                  <Icon className="h-4 w-4 flex-shrink-0" />
                )}
                {label}
              </button>
            )
          })}
        </nav>

        {/* User info + language switcher + sign out */}
        <div className="border-t border-gray-100 px-3 py-4 space-y-2">
          <div className="flex items-center justify-between px-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-900 truncate">
                {displayName || t('you')}
              </div>
              <div className="text-xs text-gray-500 truncate">{userEmail}</div>
            </div>
            <LanguageSwitcher />
          </div>
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-600
                       hover:bg-red-50 hover:text-red-700 transition"
          >
            <LogOut className="h-4 w-4" />
            {t('signOut')}
          </button>
        </div>
      </aside>
    </>
  )
}
