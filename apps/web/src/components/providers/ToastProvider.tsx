'use client'
import { type ReactNode } from 'react'

// Inline toast context — lightweight alternative to sonner
// Sonner can be installed separately with: pnpm add sonner
import { createContext, useContext, useState, useCallback } from 'react'
import { cn } from '@/lib/utils'
import { X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'info' | 'warning'

interface Toast {
  id: string
  message: string
  type: ToastType
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void
  success: (message: string) => void
  error: (message: string) => void
  info: (message: string) => void
  warning: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function useToast() {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast must be inside ToastProvider')
  return ctx
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id))
  }, [])

  const addToast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).slice(2)
    setToasts(prev => [...prev.slice(-3), { id, message, type }])
    setTimeout(() => dismiss(id), 5000)
  }, [dismiss])

  const value: ToastContextValue = {
    toast: addToast,
    success: (msg) => addToast(msg, 'success'),
    error: (msg) => addToast(msg, 'error'),
    info: (msg) => addToast(msg, 'info'),
    warning: (msg) => addToast(msg, 'warning'),
  }

  const typeStyles: Record<ToastType, string> = {
    success: 'border-l-4 border-l-success bg-bg-card',
    error: 'border-l-4 border-l-danger bg-bg-card',
    info: 'border-l-4 border-l-info bg-bg-card',
    warning: 'border-l-4 border-l-warning bg-bg-card',
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Toast stack */}
      <div className="fixed bottom-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className={cn(
              'pointer-events-auto flex items-start gap-3 rounded-lg border border-border bg-bg-card px-4 py-3 shadow-xl min-w-[280px] max-w-[400px] animate-slide-in-right',
              typeStyles[toast.type]
            )}
          >
            <p className="flex-1 text-sm text-text-primary">{toast.message}</p>
            <button
              onClick={() => dismiss(toast.id)}
              className="text-text-muted hover:text-text-primary transition-colors flex-shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
