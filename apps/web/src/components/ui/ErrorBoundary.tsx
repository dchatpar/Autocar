'use client'
import { Component, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { AlertTriangle, RefreshCw } from 'lucide-react'

interface Props {
  children: ReactNode
  fallback?: ReactNode
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface State {
  hasError: boolean
  error?: Error
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.props.onError?.(error, errorInfo)
    console.error('ErrorBoundary caught:', error, errorInfo)
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className="flex flex-col items-center justify-center py-16 text-center px-4">
          <div className="w-14 h-14 rounded-full bg-danger/10 flex items-center justify-center mb-4">
            <AlertTriangle className="w-7 h-7 text-danger" />
          </div>
          <h3 className="text-lg font-semibold text-text-primary mb-2">
            Something went wrong
          </h3>
          <p className="text-sm text-text-muted mb-1 max-w-sm">
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
          <p className="text-xs text-text-muted mb-6">
            Our team has been notified. Try refreshing the page.
          </p>
          <div className="flex gap-3">
            <Button
              variant="primary"
              size="sm"
              onClick={() => this.setState({ hasError: false })}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Try again
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => window.location.href = '/'}
            >
              Back to Dashboard
            </Button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
