import { AlertCircle } from 'lucide-react'

interface ValidationErrorDisplayProps {
  errors: string[]
  className?: string
}

/**
 * ValidationErrorDisplay - Shows validation error messages
 *
 * Used inline with cell editors to display validation feedback.
 * Appears below the input with a red warning icon.
 */
export function ValidationErrorDisplay({ errors, className = '' }: ValidationErrorDisplayProps) {
  if (!errors || errors.length === 0) {
    return null
  }

  return (
    <div className={`vibegridx-validation-errors ${className}`}>
      {errors.map((error, index) => (
        <div key={index} className="vibegridx-validation-error">
          <AlertCircle className="vibegridx-validation-error-icon" />
          <span className="vibegridx-validation-error-message">{error}</span>
        </div>
      ))}
    </div>
  )
}
