'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { AppShell } from '@/components/layout/AppShell'
import { CommandPalette } from '@/components/layout/CommandPalette'
import { useCommandPalette } from '@/components/layout/CommandPalette'
import { ErrorBoundary } from '@/components/common/ErrorBoundary'

export default function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const { isOpen: commandPaletteOpen, setIsOpen: setCommandPaletteOpen } =
    useCommandPalette()
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [mounted, setMounted] = useState(false)

  // Hydration-safe state initialization
  useEffect(() => {
    setMounted(true)
    // Restore sidebar state from localStorage
    const stored = localStorage.getItem('sidebar-collapsed')
    if (stored !== null) {
      setSidebarCollapsed(stored === 'true')
    }
  }, [])

  // Persist sidebar state
  const handleSidebarToggle = () => {
    const newState = !sidebarCollapsed
    setSidebarCollapsed(newState)
    localStorage.setItem('sidebar-collapsed', String(newState))
  }

  if (!mounted) {
    // Render minimal shell during SSR to prevent hydration mismatch
    return (
      <div className="flex h-screen bg-primary">
        <div
          className={cn(
            'bg-card border-r border-border transition-all duration-300',
            sidebarCollapsed ? 'w-16' : 'w-60'
          )}
        />
        <div className="flex flex-col flex-1">
          <div className="h-14 bg-card border-b border-border" />
          <main className="flex-1 overflow-auto p-6">{children}</main>
        </div>
      </div>
    )
  }

  return (
    <>
      <AppShell
        sidebarCollapsed={sidebarCollapsed}
        onSidebarToggle={handleSidebarToggle}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
      >
        <ErrorBoundary label="app-content">
          {children}
        </ErrorBoundary>
      </AppShell>

      <CommandPalette
        isOpen={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
      />
    </>
  )
}
