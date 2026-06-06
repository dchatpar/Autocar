"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, Home } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Custom fallback UI. Receives the error and a reset handler. */
  fallback?: (error: Error, reset: () => void) => ReactNode;
  /** Optional label for which subtree this boundary protects. */
  label?: string;
  /** Called when an error is caught. Useful for logging pipelines. */
  onError?: (error: Error, info: ErrorInfo) => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * ErrorBoundary — React class component that catches render-time errors
 * anywhere in the subtree. Use as a defensive wrapper around independent
 * feature areas (sidebar widget, lead card, etc.) so a single crash
 * doesn't blank the whole app.
 *
 * For the *root* application error boundary that runs in Next.js's
 * `app/error.tsx` slot, use that file directly — Next requires a
 * client component with the same signature.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (this.props.onError) this.props.onError(error, info);
    // eslint-disable-next-line no-console -- intentional: this is the boundary
    console.error(`[ErrorBoundary${this.props.label ? `: ${this.props.label}` : ""}]`, error, info);
  }

  reset = (): void => {
    this.setState({ hasError: false, error: null });
  };

  componentDidUpdate(prev: ErrorBoundaryProps): void {
    // If the label changes (e.g. route swap) and we still have an error,
    // give the subtree another shot.
    if (this.state.hasError && prev.label !== this.props.label) {
      this.reset();
    }
  }

  render(): ReactNode {
    if (this.state.hasError && this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback(this.state.error, this.reset);
      }
      return <DefaultErrorFallback error={this.state.error} onReset={this.reset} label={this.props.label} />;
    }
    return this.props.children;
  }
}

interface DefaultErrorFallbackProps {
  error: Error;
  onReset: () => void;
  label?: string;
}

function DefaultErrorFallback({ error, onReset, label }: DefaultErrorFallbackProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center text-center px-6 py-10 m-4 rounded-2xl border border-danger/30 bg-danger/5"
    >
      <div className="h-12 w-12 rounded-2xl bg-danger/15 text-danger flex items-center justify-center mb-4">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <h3 className="text-base font-semibold text-text-primary mb-1">
        Something broke{label ? ` in ${label}` : ""}
      </h3>
      <p className="text-sm text-text-muted max-w-md mb-5">
        {error.message || "An unexpected error occurred. You can retry or head back to the dashboard."}
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <Button variant="primary" size="md" onClick={onReset}>
          <RefreshCw className="h-4 w-4" />
          Try again
        </Button>
        <Button
          variant="secondary"
          size="md"
          onClick={() => {
            if (typeof window !== "undefined") window.location.href = "/";
          }}
        >
          <Home className="h-4 w-4" />
          Go home
        </Button>
      </div>
    </div>
  );
}
