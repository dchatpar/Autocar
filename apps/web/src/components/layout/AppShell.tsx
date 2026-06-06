'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { useAuth } from '@/hooks/useAuth'
import { Sidebar } from '@/components/layout'
import { TopBar } from '@/components/layout/TopBar'
import {
  LayoutDashboard,
  Users,
  UserCircle,
  Car,
  Calendar,
  Megaphone,
  CreditCard,
  Settings,
  Bot,
  BarChart3,
  Handshake,
  Menu,
  X,
} from 'lucide-react'

// Maps UserRole to role labels
const ROLE_MAP: Record<string, string> = {
  owner: 'admin',
  admin: 'admin',
  manager: 'manager',
  salesperson: 'sales',
}

interface NavItem {
  id: string
  label: string
  icon: React.ReactNode
  href: string
  badge?: number
  roles: string[]
}

const navItems: NavItem[] = [
  { id: 'dashboard', label: 'Dashboard', icon: <LayoutDashboard className="h-5 w-5" />, href: '/', roles: ['admin', 'manager', 'sales', 'bdc'] },
  { id: 'leads', label: 'Leads', icon: <Users className="h-5 w-5" />, href: '/leads', badge: 12, roles: ['admin', 'manager', 'sales', 'bdc'] },
  { id: 'inventory', label: 'Inventory', icon: <Car className="h-5 w-5" />, href: '/inventory', roles: ['admin', 'manager', 'sales'] },
  { id: 'customers', label: 'Customers', icon: <UserCircle className="h-5 w-5" />, href: '/customers', roles: ['admin', 'manager', 'sales'] },
  { id: 'deals', label: 'Deals', icon: <Handshake className="h-5 w-5" />, href: '/deals', roles: ['admin', 'manager', 'sales'] },
  { id: 'test-drives', label: 'Test Drives', icon: <Calendar className="h-5 w-5" />, href: '/test-drives', roles: ['admin', 'manager', 'sales'] },
  { id: 'campaigns', label: 'Campaigns', icon: <Megaphone className="h-5 w-5" />, href: '/campaigns', roles: ['admin', 'manager', 'marketing'] },
  { id: 'billing', label: 'Billing', icon: <CreditCard className="h-5 w-5" />, href: '/billing', roles: ['admin'] },
  { id: 'reports', label: 'Reports', icon: <BarChart3 className="h-5 w-5" />, href: '/reports', roles: ['admin', 'manager', 'accountant'] },
  { id: 'ai-agents', label: 'AI Agents', icon: <Bot className="h-5 w-5" />, href: '/ai-agents', badge: 3, roles: ['admin', 'manager'] },
]

function getActiveItemFromPathname(pathname: string): string {
  if (pathname === '/') return 'dashboard'
  for (const item of navItems) {
    if (item.href !== '/' && pathname.startsWith(item.href)) {
      return item.id
    }
  }
  return 'dashboard'
}

function MobileDrawer({
  open,
  onClose,
  activeItem,
  userRole,
}: {
  open: boolean
  onClose: () => void
  activeItem: string
  userRole: string | null
}) {
  const pathname = usePathname()

  const isActive = (href: string, id: string) => {
    if (href === '/') return pathname === '/'
    return pathname.startsWith(href)
  }

  const visibleItems = navItems.filter(
    (item) => !userRole || item.roles.includes(userRole)
  )

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 bg-black/60 z-40 animate-fade-in"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      {/* Drawer */}
      <aside
        className={cn(
          'fixed top-0 left-0 h-full w-64 bg-bg-card border-r border-border z-50 transform transition-transform duration-200 ease-out',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
        aria-label="Mobile navigation"
      >
        {/* Header */}
        <div className="h-14 flex items-center justify-between px-4 border-b border-border">
          <Link
            href="/"
            className="flex items-center gap-2"
            onClick={onClose}
          >
            <div className="h-8 w-8 rounded-lg bg-accent flex items-center justify-center">
              <Car className="h-4 w-4 text-bg-primary" />
            </div>
            <span className="font-bold text-lg text-accent tracking-tight">
              DealerOS
            </span>
          </Link>
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-text-muted hover:text-text-primary transition-colors"
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-4 px-2 overflow-y-auto" aria-label="Main navigation">
          <div className="space-y-1">
            {visibleItems.map((item) => {
              const active = isActive(item.href, item.id)
              return (
                <Link
                  key={item.id}
                  href={item.href}
                  onClick={onClose}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                    active
                      ? 'bg-bg-elevated text-accent'
                      : 'text-text-muted hover:text-text-primary hover:bg-bg-elevated'
                  )}
                  aria-current={active ? 'page' : undefined}
                >
                  <span className="flex-shrink-0">{item.icon}</span>
                  <span className="flex-1">{item.label}</span>
                  {item.badge && (
                    <span className="px-1.5 py-0.5 text-xs font-semibold bg-accent text-bg-primary rounded-full">
                      {item.badge}
                    </span>
                  )}
                </Link>
              )
            })}
          </div>
        </nav>

        {/* Settings at bottom — admin only */}
        {userRole === 'admin' && (
          <div className="border-t border-border p-2">
            <Link
              href="/settings"
              onClick={onClose}
              className={cn(
                'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150',
                isActive('/settings', 'settings')
                  ? 'bg-bg-elevated text-accent'
                  : 'text-text-muted hover:text-text-primary hover:bg-bg-elevated'
              )}
            >
              <Settings className="h-5 w-5 flex-shrink-0" />
              <span>Settings</span>
            </Link>
          </div>
        )}
      </aside>
    </>
  )
}

interface AppShellProps {
  children: React.ReactNode
  sidebarCollapsed?: boolean
  onSidebarToggle?: () => void
  onOpenCommandPalette?: () => void
}

export function AppShell({
  children,
  sidebarCollapsed = false,
  onSidebarToggle,
  onOpenCommandPalette,
}: AppShellProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [isMobile, setIsMobile] = useState(false)
  const pathname = usePathname()
  const { user } = useAuth()

  const activeItem = getActiveItemFromPathname(pathname)
  const userRole = user?.role ? ROLE_MAP[user.role] ?? 'sales' : null

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])

  // Close drawer on route change
  useEffect(() => {
    setSidebarOpen(false)
  }, [pathname])

  // Mobile layout with drawer
  if (isMobile) {
    return (
      <div className="flex h-screen overflow-hidden bg-bg-primary">
        {/* Mobile header */}
        <div className="fixed top-0 left-0 right-0 z-30 bg-bg-card border-b border-border">
          <div className="flex items-center h-14 px-4 gap-3">
            <button
              onClick={() => setSidebarOpen(true)}
              className="p-2 -ml-2 text-text-muted hover:text-text-primary transition-colors"
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <span className="font-bold text-lg text-accent tracking-tight">DealerOS</span>
          </div>
        </div>

        {/* Mobile Drawer */}
        <MobileDrawer
          open={sidebarOpen}
          onClose={() => setSidebarOpen(false)}
          activeItem={activeItem}
          userRole={userRole}
        />

        {/* Mobile content */}
        <main className="flex-1 overflow-y-auto pt-14">
          <div className="p-4">{children}</div>
        </main>
      </div>
    )
  }

  // Desktop layout with inline sidebar
  return (
    <div className="flex h-screen overflow-hidden bg-bg-primary">
      <Sidebar
        activeItem={activeItem}
        collapsed={sidebarCollapsed}
        onToggle={onSidebarToggle}
      />

      <div
        className={cn(
          'flex flex-col flex-1 overflow-hidden transition-all duration-300',
          sidebarCollapsed ? 'ml-16' : 'ml-60'
        )}
      >
        <TopBar
          sidebarCollapsed={sidebarCollapsed}
          onOpenCommandPalette={onOpenCommandPalette}
        />

        <main className="flex-1 overflow-auto pt-14">
          <div className="p-6">{children}</div>
        </main>
      </div>
    </div>
  )
}
