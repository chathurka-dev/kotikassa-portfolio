'use client'

import { AlertTriangle, RotateCcw } from 'lucide-react'

interface Props {
  reason: string
  dismissed: boolean
  dismissLabel: string
  dismissedLabel: string
  restoreLabel: string
  onDismiss: () => void
  onRestore: () => void
}

export default function ScanQualityWarningCard({
  reason,
  dismissed,
  dismissLabel,
  dismissedLabel,
  restoreLabel,
  onDismiss,
  onRestore,
}: Props) {
  if (dismissed) {
    return (
      <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-gray-500">
        <span>{dismissedLabel}</span>
        <button
          type="button"
          onClick={onRestore}
          className="inline-flex items-center gap-1 font-medium text-gray-600 hover:text-gray-900"
        >
          <RotateCcw className="h-3.5 w-3.5" />
          {restoreLabel}
        </button>
      </div>
    )
  }

  return (
    <div
      role="alert"
      className="mt-1.5 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs"
    >
      <div className="flex items-start gap-2 text-amber-900">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
        <span>{reason}</span>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className="mt-1.5 ml-5 font-semibold text-amber-800 hover:text-amber-950"
      >
        {dismissLabel}
      </button>
    </div>
  )
}
