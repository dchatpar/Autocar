'use client'

import { useEffect, useState, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Command } from 'cmdk'
import { cn } from '@/lib/utils'
import {
  Search,
  LayoutDashboard,
  Users,
  Car,
  UserCircle,
  FileText,
  Calendar,
  Megaphone,
  CreditCard,
  Settings,
  Bot,
  Plus,
  ArrowRight,
  X,
  Loader2,
} from 'lucide-react'
import Link from 'next/link'

interface CommandItem {
  id: string
  label: string
  icon: React.ReactNode
  href?: string
  action?: () => void
  shortcut?: string
}

const navigationItems: CommandItem[] = [
  { id: 'dashboard', label: 'Go to Dashboard', icon: <LayoutDashboard className="h-4 w-4" />, href: '/', shortcut: 'G D' },
  { id: 'leads', label: 'Go to Leads', icon: <Users className="h-4 w-4" />, href: '/leads', shortcut: 'G L' },
  { id: 'inventory', label: 'Go to Inventory', icon: <Car className="h-4 w-4" />, href: '/inventory', shortcut: 'G I' },
  { id: 'customers', label: 'Go to Customers', icon: <UserCircle className="h-4 w-4" />, href: '/customers', shortcut: 'G C' },
  { id: 'deals', label: 'Go to Deals', icon: <FileText className="h-4 w-4" />, href: '/deals', shortcut: 'G D' },
  { id: 'test-drives', label: 'Go to Test Drives', icon: <Calendar className="h-4 w-4" />, href: '/test-drives', shortcut: 'G T' },
  { id: 'campaigns', label: 'Go to Campaigns', icon: <Megaphone className="h-4 w-4" />, href: '/campaigns', shortcut: 'G A' },
  { id: 'billing', label: 'Go to Billing', icon: <CreditCard className="h-4 w-4" />, href: '/billing', shortcut: 'G B' },
  { id: 'settings', label: 'Go to Settings', icon: <Settings className="h-4 w-4" />, href: '/settings', shortcut: 'G S' },
  { id: 'ai-agents', label: 'Go to AI Agents', icon: <Bot className="h-4 w-4" />, href: '/ai-agents', shortcut: 'G N' },
]

const actionItems: CommandItem[] = [
  { id: 'add-lead', label: 'Add New Lead', icon: <Plus className="h-4 w-4" />, href: '/leads/new', shortcut: '+ L' },
  { id: 'add-vehicle', label: 'Add Vehicle to Inventory', icon: <Car className="h-4 w-4" />, href: '/inventory/new', shortcut: '+ V' },
  { id: 'add-customer', label: 'Add New Customer', icon: <UserCircle className="h-4 w-4" />, href: '/customers/new', shortcut: '+ C' },
  { id: 'schedule-test-drive', label: 'Schedule Test Drive', icon: <Calendar className="h-4 w-4" />, href: '/test-drives/new', shortcut: '+ T' },
]

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  onSearch?: (query: string) => void
}

export function CommandPalette({ isOpen, onClose, onSearch }: CommandPaletteProps) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }

    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [isOpen, onClose])

  // Prevent body scroll when open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  if (!mounted || !isOpen) return null

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 backdrop-blur-sm bg-primary/80 animate-fade-in"
        onClick={onClose}
      />

      {/* Command palette */}
      <div className="relative w-full max-w-xl mx-4 animate-scale-in">
        <Command
          className={cn(
            'bg-card border border-border rounded-xl shadow-2xl overflow-hidden',
            'focus:outline-none'
          )}
        >
          {/* Search input */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
            <Search className="h-5 w-5 text-muted flex-shrink-0" />
            <Command.Input
              placeholder="Search or type a command..."
              className="flex-1 bg-transparent text-primary text-base placeholder:text-muted focus:outline-none"
              autoFocus
            />
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-elevated text-muted hover:text-primary transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <Command.List className="max-h-80 overflow-y-auto p-2">
            <Command.Empty className="py-8 text-center text-sm text-muted">
              No results found. Try a different search term.
            </Command.Empty>

            {/* Navigation group */}
            <Command.Group
              heading="Navigation"
              className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted"
            >
              {navigationItems.map((item) => (
                <Command.Item
                  key={item.id}
                  value={item.label}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors',
                    'data-[selected=true]:bg-elevated data-[selected=true]:text-primary',
                    'text-muted hover:text-primary'
                  )}
                >
                  <Link
                    href={item.href!}
                    onClick={onClose}
                    className="flex items-center gap-3 w-full"
                  >
                    <span className="text-muted">{item.icon}</span>
                    <span className="flex-1">{item.label}</span>
                    {item.shortcut && (
                      <kbd className="hidden sm:flex items-center gap-1 px-2 py-0.5 text-xs text-muted bg-elevated rounded border border-border">
                        {item.shortcut}
                      </kbd>
                    )}
                  </Link>
                </Command.Item>
              ))}
            </Command.Group>

            {/* Actions group */}
            <Command.Group
              heading="Actions"
              className="mt-2 [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted"
            >
              {actionItems.map((item) => (
                <Command.Item
                  key={item.id}
                  value={item.label}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors',
                    'data-[selected=true]:bg-elevated data-[selected=true]:text-primary',
                    'text-muted hover:text-primary'
                  )}
                >
                  <Link
                    href={item.href!}
                    onClick={onClose}
                    className="flex items-center gap-3 w-full"
                  >
                    <span className="text-accent">{item.icon}</span>
                    <span className="flex-1">{item.label}</span>
                    {item.shortcut && (
                      <kbd className="hidden sm:flex items-center gap-1 px-2 py-0.5 text-xs text-muted bg-elevated rounded border border-border">
                        {item.shortcut}
                      </kbd>
                    )}
                  </Link>
                </Command.Item>
              ))}
            </Command.Group>
          </Command.List>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-2 border-t border-border text-xs text-muted">
            <div className="flex items-center gap-4">
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-elevated rounded border border-border">↑</kbd>
                <kbd className="px-1.5 py-0.5 bg-elevated rounded border border-border">↓</kbd>
                to navigate
              </span>
              <span className="flex items-center gap-1">
                <kbd className="px-1.5 py-0.5 bg-elevated rounded border border-border">↵</kbd>
                to select
              </span>
            </div>
            <span className="flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 bg-elevated rounded border border-border">esc</kbd>
              to close
            </span>
          </div>
        </Command>
      </div>
    </div>,
    document.body
  )
}

// Global hook for keyboard shortcut
export function useCommandPalette() {
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd/Ctrl + K
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setIsOpen((prev) => !prev)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [])

  return { isOpen, setIsOpen }
}
