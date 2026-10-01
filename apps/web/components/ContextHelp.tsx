'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { HelpCircle } from 'lucide-react'

interface ContextHelpProps {
  label: string
  children: React.ReactNode
  align?: 'left' | 'right'
}

export default function ContextHelp({ label, children, align = 'left' }: ContextHelpProps) {
  const [open, setOpen] = useState(false)
  const id = useId()
  const containerRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    if (!open) return

    function closeOnOutsideClick(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false)
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [open])

  return (
    <span ref={containerRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        className="rounded text-gray-400 hover:text-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span
          id={id}
          role="note"
          className={`absolute top-full z-30 mt-2 w-72 rounded-lg border border-gray-200 bg-white p-3 text-left text-xs font-normal normal-case leading-relaxed text-gray-600 shadow-lg ${
            align === 'right' ? 'right-0' : 'left-0'
          }`}
        >
          {children}
        </span>
      )}
    </span>
  )
}
