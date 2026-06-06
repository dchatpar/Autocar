'use client'

import { forwardRef, type ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface ScrollAreaProps {
  children: ReactNode
  className?: string
  orientation?: 'vertical' | 'horizontal' | 'both'
  scrollbarClassName?: string
  contentClassName?: string
}

export const ScrollArea = forwardRef<HTMLDivElement, ScrollAreaProps>(
  function ScrollArea(
    { children, className, orientation = 'vertical', scrollbarClassName, contentClassName },
    ref
  ) {
    const showVertical = orientation === 'vertical' || orientation === 'both'
    const showHorizontal = orientation === 'horizontal' || orientation === 'both'

    return (
      <div
        ref={ref}
        className={cn('relative overflow-hidden', className)}
        style={{
          scrollbarWidth: 'thin',
          scrollbarColor: 'var(--color-border-active) var(--color-bg-primary)',
        }}
      >
        <div
          className={cn(
            'h-full w-full',
            showVertical && 'overflow-y-auto overflow-x-hidden',
            showHorizontal && !showVertical && 'overflow-x-auto overflow-y-hidden',
            contentClassName
          )}
        >
          {children}
        </div>

        {/* Custom scrollbar - vertical */}
        {showVertical && (
          <div
            className={cn(
              'absolute right-0 top-0 bottom-0 w-2 flex flex-col opacity-0 hover:opacity-100 transition-opacity',
              scrollbarClassName
            )}
          >
            <div className="absolute inset-0 bg-border/50 rounded-full" />
            <div
              className="relative flex-1 min-h-[20%] bg-border-active rounded-full transition-all hover:bg-text-muted"
              style={{
                marginTop: '4px',
                marginBottom: '4px',
              }}
            />
          </div>
        )}

        {/* Custom scrollbar - horizontal */}
        {showHorizontal && (
          <div
            className={cn(
              'absolute bottom-0 left-0 right-0 h-2 flex flex-row opacity-0 hover:opacity-100 transition-opacity',
              scrollbarClassName
            )}
          >
            <div className="absolute inset-0 bg-border/50 rounded-full" />
            <div
              className="relative flex-1 min-w-[20%] bg-border-active rounded-full transition-all hover:bg-text-muted"
              style={{
                marginLeft: '4px',
                marginRight: '4px',
              }}
            />
          </div>
        )}
      </div>
    )
  }
)

// Alternative: Simple div-based scroll area using native scrolling
// This is more reliable and accessible
export function SimpleScrollArea({
  children,
  className,
  maxHeight,
}: {
  children: ReactNode
  className?: string
  maxHeight?: string
}) {
  return (
    <div
      className={cn('overflow-y-auto', className)}
      style={{
        maxHeight: maxHeight,
        scrollbarWidth: 'thin',
        scrollbarColor: 'var(--color-border-active) var(--color-bg-primary)',
      }}
    >
      {children}
    </div>
  )
}
