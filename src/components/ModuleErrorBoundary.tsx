/**
 * ModuleErrorBoundary - Error boundary for view mode module failures
 *
 * Catches module load errors, render errors, and provides reset functionality.
 * Falls back to table view on error.
 *
 * @see Issue #1416 for architecture overview
 */

import React, { Component, type ReactNode } from 'react'
import { getLogger } from '@/shared/lib/logging'

const logger = getLogger(['vibegrid', 'components', 'ModuleErrorBoundary'])

interface ModuleErrorBoundaryProps {
  children: ReactNode
  /** Fallback renderer - receives error and reset function */
  fallback: (error: Error, reset: () => void) => ReactNode
  /** Called when error is caught */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface ModuleErrorBoundaryState {
  error: Error | null
}

/**
 * Error boundary for view mode module failures.
 * Catches module load errors, render errors, and provides reset.
 */
export class ModuleErrorBoundary extends Component<ModuleErrorBoundaryProps, ModuleErrorBoundaryState> {
  constructor(props: ModuleErrorBoundaryProps) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error: Error): ModuleErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    logger.error('View mode error caught by boundary', {
      error: error.message,
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    })

    this.props.onError?.(error, errorInfo)
  }

  reset = () => {
    logger.info('Error boundary reset')
    this.setState({ error: null })
  }

  render() {
    if (this.state.error) {
      return this.props.fallback(this.state.error, this.reset)
    }

    return this.props.children
  }
}

/**
 * Default error fallback component for module errors.
 * Displays error message and allows switching to table view.
 */
interface ModuleErrorFallbackProps {
  error: Error
  onReset: () => void
  onSwitchToTable?: () => void
}

export function ModuleErrorFallback({ error, onReset, onSwitchToTable }: ModuleErrorFallbackProps) {
  return (
    <div className="vibegrid-module-error flex flex-col items-center justify-center h-full p-8 bg-destructive/10 rounded-lg">
      <div className="text-center max-w-md">
        <h3 className="text-lg font-semibold text-destructive mb-2">View mode failed to load</h3>
        <p className="text-sm text-muted-foreground mb-4">{error.message}</p>
        <div className="flex gap-2 justify-center">
          <button
            type="button"
            onClick={onReset}
            className="px-4 py-2 text-sm bg-secondary hover:bg-secondary/80 rounded-md transition-colors"
          >
            Try Again
          </button>
          {onSwitchToTable && (
            <button
              type="button"
              onClick={() => {
                onReset()
                onSwitchToTable()
              }}
              className="px-4 py-2 text-sm bg-primary text-primary-foreground hover:bg-primary/90 rounded-md transition-colors"
            >
              Switch to Table View
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

export default ModuleErrorBoundary
