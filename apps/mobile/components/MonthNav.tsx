import { Text, TouchableOpacity, View } from 'react-native'
import { currentPeriodStart, formatPeriod, shiftMonth } from '@kotikassa/shared/native'
import { useLocale } from '@/lib/i18n'

// monthStart: 'YYYY-MM-01'. Forward navigation stops at the current period.
export function MonthNav({
  monthStart, onChange, startDay = 1,
}: {
  monthStart: string
  onChange: (next: string) => void
  startDay?: number
}) {
  const { locale } = useLocale()
  const isCurrent = monthStart === currentPeriodStart(startDay)

  return (
    <View className="flex-row items-center gap-1">
      <TouchableOpacity
        onPress={() => onChange(shiftMonth(monthStart, -1))}
        className="px-3 py-1.5 rounded-lg bg-gray-100"
      >
        <Text className="text-base text-gray-600">‹</Text>
      </TouchableOpacity>
      <Text className="text-sm font-semibold text-gray-700 min-w-[110px] text-center capitalize">
        {formatPeriod(monthStart, startDay, locale)}
      </Text>
      <TouchableOpacity
        onPress={() => onChange(shiftMonth(monthStart, 1))}
        disabled={isCurrent}
        className={`px-3 py-1.5 rounded-lg bg-gray-100 ${isCurrent ? 'opacity-30' : ''}`}
      >
        <Text className="text-base text-gray-600">›</Text>
      </TouchableOpacity>
    </View>
  )
}
