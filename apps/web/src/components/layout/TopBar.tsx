'use client'

import { useState, useCallback, useRef, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createPortal } from 'react-dom'
import { cn } from '@/lib/utils'
import {
  Search,
  Command,
  Plus,
  Bell,
  Settings,
  LogOut,
  User,
  ChevronDown,
  Users,
  Car,
  UserCircle,
  Calendar,
  X,
} from 'lucide-react'
import { Avatar } from '@/components/ui/avatar'

interface QuickAddItem {
  id: string
  label: string
  icon: React.ReactNode
  href: string
}

const quickAddItems: QuickAddItem[] = [
  { id: 'lead', label: 'Add Lead', icon: <Users className="h-4 w-4" />, href: '/leads/new' },
  { id: 'vehicle', label: 'Add Vehicle', icon: <Car className="h-4 w-4" />, href: '/inventory/new' },
  { id: 'customer', label: 'Add Customer', icon: <UserCircle className="h-4 w-4" />, href: '/customers/new' },
  { id: 'test-drive', label: 'Schedule Test Drive', icon: <Calendar className="h-4 w-4" />, href: '/test-drives/new' },
]

interface Notification {
  id: string
  title: string
  message: string
  time: string
  read: boolean
  type: 'lead' | 'deal' | 'inventory' | 'system'
}

const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: '1',
    title: 'New lead from website',
    message: 'Sarah Johnson submitted a lead form for a 2024 Honda Accord',
    time: '2 minutes ago',
    read: false,
    type: 'lead',
  },
  {
    id: '2',
    title: 'Deal closed',
    message: 'Marcus Chen closed a deal for $35,000',
    time: '15 minutes ago',
    read: false,
    type: 'deal',
  },
  {
    id: '3',
    title: 'Low inventory alert',
    message: 'Only 3 sedans remaining in inventory',
    time: '1 hour ago',
    read: true,
    type: 'inventory',
  },
]

interface TopBarProps {
  sidebarCollapsed?: boolean
  onOpenCommandPalette?: () => void
}

export function TopBar({
  sidebarCollapsed = false,
  onOpenCommandPalette,
}: TopBarProps) {
  const pathname = usePathname()
  const [quickAddOpen, setQuickAddOpen] = useState(false)
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const quickAddRef = useRef<HTMLDivElement>(null)
  const notificationsRef = useRef<HTMLDivElement>(null)
  const userMenuRef = useRef<HTMLDivElement>(null)

  // Get page title from pathname
  const getPageTitle = () => {
    if (pathname === '/') return 'Dashboard'
    const segments = pathname.split('/').filter(Boolean)
    const lastSegment = segments[segments.length - 1]
    // Capitalize first letter
    return lastSegment
      ? lastSegment.charAt(0).toUpperCase() + lastSegment.slice(1).replace(/-/g, ' ')
      : 'Dashboard'
  }

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (quickAddRef.current && !quickAddRef.current.contains(e.target as Node)) {
        setQuickAddOpen(false)
      }
      if (notificationsRef.current && !notificationsRef.current.contains(e.target as Node)) {
        setNotificationsOpen(false)
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const unreadCount = MOCK_NOTIFICATIONS.filter((n) => !n.read).length

  const typeIcons = {
    lead: '👥',
    deal: '📄',
    inventory: '🚗',
    system: '🔔',
  }

  return (
    <header
      className={cn(
        'fixed top-0 right-0 h-14 bg-card border-b border-border flex items-center justify-between px-6 z-30 transition-all duration-300',
        sidebarCollapsed ? 'left-16' : 'left-60'
      )}
    >
      {/* Page title / Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <h1 className="font-semibold text-primary">{getPageTitle()}</h1>
      </div>

      {/* Command Palette Shortcut */}
      <button
        onClick={onOpenCommandPalette}
        className={cn(
          'hidden md:flex items-center gap-2 h-9 px-3 rounded-lg border border-border text-sm text-muted',
          'hover:border-border-active hover:text-primary transition-all duration-150',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
        )}
        aria-label="Open command palette"
      >
        <Command className="h-4 w-4" />
        <span className="text-xs">⌘K</span>
      </button>

      {/* Right side actions */}
      <div className="flex items-center gap-3">
        {/* Quick Add */}
        <div className="relative" ref={quickAddRef}>
          <button
            onClick={() => setQuickAddOpen(!quickAddOpen)}
            className={cn(
              'flex items-center gap-2 h-9 px-3 rounded-lg font-medium text-sm transition-all duration-150',
              'bg-accent text-bg-primary hover:bg-accent/90',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card'
            )}
          >
            <Plus className="h-4 w-4" />
            <span>Add</span>
            <ChevronDown className="h-3 w-3" />
          </button>

          {quickAddOpen &&
            createPortal(
              <div className="fixed inset-0 z-50" onClick={() => setQuickAddOpen(false)}>
                <div
                  className={cn(
                    'absolute bg-card border border-border rounded-lg shadow-xl py-1 min-w-[200px] animate-scale-in overflow-hidden',
                    'top-full mt-2 right-0'
                  )}
                  style={{
                    top: quickAddRef.current?.getBoundingClientRect().bottom ?? 0,
                    right: window.innerWidth - (quickAddRef.current?.getBoundingClientRect().right ?? 0),
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {quickAddItems.map((item) => (
                    <Link
                      key={item.id}
                      href={item.href}
                      onClick={() => setQuickAddOpen(false)}
                      className="flex items-center gap-3 px-4 py-2.5 text-sm text-primary hover:bg-elevated transition-colors"
                    >
                      <span className="text-muted">{item.icon}</span>
                      {item.label}
                    </Link>
                  ))}
                </div>
              </div>,
              document.body
            )}
        </div>

        {/* Notifications */}
        <div className="relative" ref={notificationsRef}>
          <button
            onClick={() => setNotificationsOpen(!notificationsOpen)}
            className={cn(
              'relative p-2 rounded-lg text-muted hover:text-primary hover:bg-elevated transition-all duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent'
            )}
            aria-label="Notifications"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 w-4 h-4 bg-accent text-bg-primary text-xs font-bold rounded-full flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>

          {notificationsOpen &&
            createPortal(
              <div className="fixed inset-0 z-50" onClick={() => setNotificationsOpen(false)}>
                <div
                  className="absolute bg-card border border-border rounded-xl shadow-xl w-80 overflow-hidden animate-scale-in"
                  style={{
                    top: notificationsRef.current?.getBoundingClientRect().bottom ?? 0,
                    right: window.innerWidth - (notificationsRef.current?.getBoundingClientRect().right ?? 0) - 24,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Header */}
                  <div className="flex items-center justify-between p-4 border-b border-border">
                    <h3 className="font-semibold text-primary">Notifications</h3>
                    <button
                      onClick={() => setNotificationsOpen(false)}
                      className="p-1 rounded hover:bg-elevated text-muted hover:text-primary transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  {/* List */}
                  <div className="max-h-80 overflow-y-auto">
                    {MOCK_NOTIFICATIONS.map((notification) => (
                      <div
                        key={notification.id}
                        className={cn(
                          'p-4 border-b border-border cursor-pointer hover:bg-elevated transition-colors',
                          !notification.read && 'bg-elevated/50'
                        )}
                      >
                        <div className="flex gap-3">
                          <span className="text-lg">{typeIcons[notification.type]}</span>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-primary truncate">
                              {notification.title}
                            </p>
                            <p className="text-xs text-muted mt-0.5 line-clamp-2">
                              {notification.message}
                            </p>
                            <p className="text-xs text-muted mt-1">{notification.time}</p>
                          </div>
                          {!notification.read && (
                            <span className="w-2 h-2 bg-accent rounded-full flex-shrink-0" />
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>,
              document.body
            )}
        </div>

        {/* User menu */}
        <div className="relative" ref={userMenuRef}>
          <button
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className={cn(
              'flex items-center gap-3 p-1.5 rounded-lg hover:bg-elevated transition-all duration-150',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              userMenuOpen && 'bg-elevated'
            )}
          >
            <Avatar name="Marcus Chen" size="sm" status="online" />
            <div className="hidden md:block text-left">
              <p className="text-sm font-medium text-primary leading-tight">Marcus Chen</p>
              <p className="text-xs text-muted leading-tight">Sales Manager</p>
            </div>
            <ChevronDown className={cn('h-4 w-4 text-muted transition-transform', userMenuOpen && 'rotate-180')} />
          </button>

          {userMenuOpen &&
            createPortal(
              <div className="fixed inset-0 z-50" onClick={() => setUserMenuOpen(false)}>
                <div
                  className="absolute bg-card border border-border rounded-lg shadow-xl py-1 min-w-[200px] animate-scale-in overflow-hidden"
                  style={{
                    top: userMenuRef.current?.getBoundingClientRect().bottom ?? 0,
                    right: window.innerWidth - (userMenuRef.current?.getBoundingClientRect().right ?? 0),
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <Link
                    href="/settings"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-primary hover:bg-elevated transition-colors"
                  >
                    <User className="h-4 w-4 text-muted" />
                    Profile
                  </Link>
                  <Link
                    href="/settings"
                    onClick={() => setUserMenuOpen(false)}
                    className="flex items-center gap-3 px-4 py-2.5 text-sm text-primary hover:bg-elevated transition-colors"
                  >
                    <Settings className="h-4 w-4 text-muted" />
                    Settings
                  </Link>
                  <div className="h-px bg-border my-1" />
                  <button
                    onClick={() => {
                      // Handle logout
                      setUserMenuOpen(false)
                    }}
                    className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-danger hover:bg-danger/10 transition-colors"
                  >
                    <LogOut className="h-4 w-4" />
                    Log out
                  </button>
                </div>
              </div>,
              document.body
            )}
        </div>
      </div>
    </header>
  )
}
