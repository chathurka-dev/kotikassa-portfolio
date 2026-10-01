import type { ItemSuggestion } from '@/app/(dashboard)/_components/ItemNameSuggestInput'

const PACK_SIZE_PATTERN = /\b\d+(?:[.,]\d+)?\s*(?:kg|g|l|ml|cl|kpl)\b/giu

function normalizeName(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase('fi-FI')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function withoutPackSize(value: string): string {
  return value.replace(PACK_SIZE_PATTERN, ' ').replace(/\s+/g, ' ').trim()
}

function editDistance(left: string, right: string): number {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  const current = new Array<number>(right.length + 1)

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    current[0] = leftIndex
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitutionCost = left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1
      current[rightIndex] = Math.min(
        current[rightIndex - 1]! + 1,
        previous[rightIndex]! + 1,
        previous[rightIndex - 1]! + substitutionCost,
      )
    }
    for (let index = 0; index < current.length; index += 1) previous[index] = current[index]!
  }

  return previous[right.length]!
}

function similarity(left: string, right: string): number {
  const maxLength = Math.max(left.length, right.length)
  return maxLength === 0 ? 1 : 1 - editDistance(left, right) / maxLength
}

interface SimilarNameOptions {
  canUseCanonicalBase: boolean
  maxMatches?: number
}

export function hasExactItemName(query: string, suggestions: ItemSuggestion[]): boolean {
  const normalizedQuery = normalizeName(query)
  return normalizedQuery.length > 0
    && suggestions.some((suggestion) => normalizeName(suggestion.name) === normalizedQuery)
}

/**
 * Finds historical names that are close enough to correct likely OCR errors.
 * Package-size variants collapse to their shared base only when quantity/unit
 * already preserve the scanned size, preventing loss of real receipt data.
 */
export function findSimilarItemNames(
  query: string,
  suggestions: ItemSuggestion[],
  { canUseCanonicalBase, maxMatches = 4 }: SimilarNameOptions,
): ItemSuggestion[] {
  const normalizedQuery = normalizeName(query)
  if (normalizedQuery.length < 4) return []

  const queryBaseDisplay = withoutPackSize(query)
  const normalizedQueryBase = normalizeName(queryBaseDisplay)
  const queryHasPackSize = queryBaseDisplay !== query.trim()
  const seen = new Set<string>()

  return suggestions
    .flatMap((suggestion) => {
      const normalizedCandidate = normalizeName(suggestion.name)
      if (normalizedCandidate === normalizedQuery) return []

      const candidateBaseDisplay = withoutPackSize(suggestion.name)
      const normalizedCandidateBase = normalizeName(candidateBaseDisplay)
      const candidateHasPackSize = candidateBaseDisplay !== suggestion.name.trim()

      if (normalizedCandidateBase === normalizedQueryBase && (queryHasPackSize || candidateHasPackSize)) {
        if (!canUseCanonicalBase || normalizedCandidateBase.length < 4) return []
        return [{ suggestion: { ...suggestion, name: candidateBaseDisplay }, score: 1 }]
      }

      const containsMatch = normalizedCandidate.includes(normalizedQuery)
        || normalizedQuery.includes(normalizedCandidate)
      const score = containsMatch ? 0.95 : similarity(normalizedQueryBase, normalizedCandidateBase)
      const longestNameLength = Math.max(normalizedQueryBase.length, normalizedCandidateBase.length)
      const allowedDistance = longestNameLength >= 12
        ? 3
        : 2
      // Longer product names have enough context to tolerate three OCR edits.
      // Keep the edit-distance cap as the primary false-positive guard while
      // allowing examples such as VEHNÄPAHDA -> VEHNÄPAAHTO (0.8125).
      const minimumSimilarity = longestNameLength >= 12 ? 0.8 : 0.82
      if (!containsMatch && (
        score < minimumSimilarity
        || editDistance(normalizedQueryBase, normalizedCandidateBase) > allowedDistance
      )) return []

      return [{ suggestion, score }]
    })
    .sort((left, right) => right.score - left.score || right.suggestion.count - left.suggestion.count)
    .filter(({ suggestion }) => {
      const key = normalizeName(suggestion.name)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, maxMatches)
    .map(({ suggestion }) => suggestion)
}
