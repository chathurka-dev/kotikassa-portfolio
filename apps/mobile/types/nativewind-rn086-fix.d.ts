// NativeWind 4.2 ships this augmentation in react-native-css-interop/types.d.ts,
// but its heritage clauses no longer match React Native 0.86 prop interfaces,
// so the merge silently fails for contentContainerClassName. Re-declare the
// minimal prop here until nativewind catches up with RN 0.86.
import 'react-native'

declare module 'react-native' {
  interface ScrollViewProps {
    contentContainerClassName?: string
  }
}
