// App-wide user preferences — stored as JSONB in profiles.preferences
// Add new preference keys here as the app grows; all fields are optional (undefined = use default).
export interface UserPreferences {
  showWeekFilter?: boolean   // default: true — ISO week chips on the expenses filter bar
  showStoreFilter?: boolean  // default: true — store dropdown when multiple stores exist
  budgetStartDay?: number    // 1–28; default 1 = calendar month. Set to e.g. 15 if income arrives mid-month.
}

// Resolved preferences with all defaults applied
export type ResolvedPreferences = Required<UserPreferences>

export const DEFAULT_PREFERENCES: ResolvedPreferences = {
  showWeekFilter: false,
  showStoreFilter: true,
  budgetStartDay: 1,
}

// Merge stored preferences with defaults
export function resolvePreferences(stored: unknown): ResolvedPreferences {
  const raw = (typeof stored === 'object' && stored !== null ? stored : {}) as Partial<UserPreferences>
  return { ...DEFAULT_PREFERENCES, ...raw }
}
