// ============================================================
// Auto-categorizer
// Maps a product name to a category using:
//   1. Family's learned history (item_category_memory table)
//   2. Built-in Finnish keyword dictionary
// ============================================================

import { KEYWORD_TO_CATEGORY } from '../constants/categories'

export interface CategorySuggestion {
  categoryName: string | null   // null = uncategorized
  source: 'memory' | 'keyword' | 'none'
  confidence: number            // 0–1
}

/**
 * Look up a product name in the built-in keyword dictionary.
 * Uses substring matching — "suklaahippu" matches "suklaa".
 */
export function categorizeByKeyword(productName: string): CategorySuggestion {
  const lower = productName.toLowerCase()

  // Try exact match first
  if (KEYWORD_TO_CATEGORY[lower]) {
    return {
      categoryName: KEYWORD_TO_CATEGORY[lower] as string,
      source: 'keyword',
      confidence: 1.0,
    }
  }

  // Try substring match — find the longest matching keyword
  let bestMatch: string | null = null
  let bestLength = 0

  for (const [keyword, category] of Object.entries(KEYWORD_TO_CATEGORY)) {
    if (lower.includes(keyword) && keyword.length > bestLength) {
      bestMatch = category as string
      bestLength = keyword.length
    }
  }

  if (bestMatch) {
    return {
      categoryName: bestMatch,
      source: 'keyword',
      confidence: bestLength / lower.length,  // longer match = more confident
    }
  }

  return { categoryName: null, source: 'none', confidence: 0 }
}

/**
 * Categorize a list of product names using memory first, then keywords.
 * Memory is provided as a map of { productNameLower → categoryId }.
 * Generic T preserves all extra fields (e.g. amount) from the input items.
 */
export function categorizeItems<T extends { name: string }>(
  items: T[],
  memory: Record<string, string>   // productName.toLowerCase() → category_id
): Array<T & { suggestedCategoryId: string | null; suggestedCategoryName: string | null; source: 'memory' | 'keyword' | 'none' }> {
  return items.map((item) => {
    const lower = item.name.toLowerCase()

    // 1. Check family memory first (highest priority)
    if (memory[lower]) {
      return {
        ...item,
        suggestedCategoryId: memory[lower] as string,
        suggestedCategoryName: null,  // caller resolves ID → name
        source: 'memory' as const,
      }
    }

    // 2. Fall back to keyword dictionary
    const suggestion = categorizeByKeyword(item.name)
    return {
      ...item,
      suggestedCategoryId: null,
      suggestedCategoryName: suggestion.categoryName,
      source: suggestion.source,
    }
  })
}
