'use client'

import { Toaster as Sonner } from 'sonner'

export function Toaster() {
  return (
    <Sonner
      className="toaster group"
      position="top-right"
      toastOptions={{
        classNames: {
          toast: 'group-[.toaster]:bg-bg-card group-[.toaster]:border-border group-[.toaster]:text-text-primary',
          title: 'group-[.toast]:text-text-primary',
          description: 'group-[.toast]:text-text-muted',
          actionButton: 'group-[.toast]:bg-accent group-[.toast]:text-bg-primary',
          cancelButton: 'group-[.toast]:bg-bg-elevated group-[.toast]:text-text-muted',
          success: 'group-[.toaster]:border-success',
          error: 'group-[.toaster]:border-danger',
          warning: 'group-[.toaster]:border-warning',
          info: 'group-[.toaster]:border-info',
        },
      }}
    />
  )
}
