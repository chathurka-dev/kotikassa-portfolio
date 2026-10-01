'use client'

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { shiftMonth } from '@kotikassa/shared'

interface Props {
  monthLabel: string
  currentMonth: string    // YYYY-MM
  isCurrentMonth: boolean
  basePath?: string       // page to navigate on, e.g. '/income' (default: dashboard)
}

export default function DashboardMonthNav({ monthLabel, currentMonth, isCurrentMonth, basePath = '/' }: Props) {
  const router = useRouter()

  function navigate(delta: number) {
    const newMonth = shiftMonth(`${currentMonth}-01`, delta).slice(0, 7)
    router.push(`${basePath}?month=${newMonth}`)
  }

  return (
    <div className="flex items-center gap-0.5">
      <button
        onClick={() => navigate(-1)}
        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500 transition"
        aria-label="Previous month"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="text-sm text-gray-500 px-1.5 min-w-[116px] text-center font-medium">
        {monthLabel}
      </span>
      <button
        onClick={() => navigate(1)}
        disabled={isCurrentMonth}
        className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-500
                   disabled:opacity-30 disabled:cursor-not-allowed transition"
        aria-label="Next month"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  )
}
