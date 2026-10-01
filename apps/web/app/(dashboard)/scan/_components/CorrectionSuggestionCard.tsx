'use client'

import { Check, RotateCcw, X } from 'lucide-react'
import ContextHelp from '@/components/ContextHelp'
import type {
  CorrectionSuggestionDecision,
  ReceiptCorrectionSuggestion,
} from '@/lib/receipt-correction-suggestions'

interface Props {
  suggestion: ReceiptCorrectionSuggestion
  decision: CorrectionSuggestionDecision
  labels: {
    heading: string
    helpLabel: string
    source: string
    help: string
    useValue: string
    dismiss: string
    applied: string
    undo: string
    dismissed: string
    restore: string
  }
  onAccept: () => void
  onReject: () => void
  onUndo: () => void
  onRestore: () => void
}

export default function CorrectionSuggestionCard({
  suggestion,
  decision,
  labels,
  onAccept,
  onReject,
  onUndo,
  onRestore,
}: Props) {
  return (
    <div className="mt-2 rounded-lg border border-indigo-100 bg-indigo-50/70 px-3 py-2 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 font-semibold text-indigo-900">
            <span>{labels.heading}</span>
            <ContextHelp label={labels.helpLabel}>{labels.help}</ContextHelp>
          </div>
          <p className="mt-0.5 truncate text-indigo-700">
            <span className="font-medium">{suggestion.suggestedValue}</span>
            <span className="text-indigo-500"> · {labels.source}</span>
          </p>
        </div>

        {decision === 'offered' && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onAccept}
              className="inline-flex items-center gap-1 rounded-md bg-indigo-600 px-2.5 py-1.5 font-semibold text-white hover:bg-indigo-700"
            >
              <Check className="h-3.5 w-3.5" />
              {labels.useValue}
            </button>
            <button
              type="button"
              onClick={onReject}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 font-medium text-gray-500 hover:bg-white hover:text-gray-700"
            >
              <X className="h-3.5 w-3.5" />
              {labels.dismiss}
            </button>
          </div>
        )}

        {(decision === 'accepted' || decision === 'undone') && (
          <button
            type="button"
            onClick={decision === 'accepted' ? onUndo : onAccept}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 font-semibold text-indigo-700 hover:bg-white"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {decision === 'accepted' ? `${labels.applied} · ${labels.undo}` : labels.useValue}
          </button>
        )}

        {decision === 'rejected' && (
          <button
            type="button"
            onClick={onRestore}
            className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 font-medium text-gray-500 hover:bg-white hover:text-gray-700"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {labels.dismissed} · {labels.restore}
          </button>
        )}
      </div>
    </div>
  )
}
