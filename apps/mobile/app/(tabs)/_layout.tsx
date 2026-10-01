import { Tabs } from 'expo-router'
import { Text } from 'react-native'
import { useT } from '@/lib/i18n'

function TabIcon({ emoji, focused }: { emoji: string; focused: boolean }) {
  return <Text className={`text-xl ${focused ? '' : 'opacity-40'}`}>{emoji}</Text>
}

export default function TabsLayout() {
  const t = useT('tabs')
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#4f46e5',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('dashboard'),
          tabBarIcon: ({ focused }) => <TabIcon emoji="🏠" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          title: t('expenses'),
          tabBarIcon: ({ focused }) => <TabIcon emoji="🧾" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="income"
        options={{
          title: t('income'),
          tabBarIcon: ({ focused }) => <TabIcon emoji="💰" focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('settings'),
          tabBarIcon: ({ focused }) => <TabIcon emoji="⚙️" focused={focused} />,
        }}
      />
    </Tabs>
  )
}
