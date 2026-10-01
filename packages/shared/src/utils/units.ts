// ─── Unit-price normalization ────────────────────────────────────────────────
// Converts per-unit prices to a canonical unit so that purchases recorded in
// different units (e.g. 100 g one trip, 0.192 kg the next) can be compared
// on the same scale.
//
// Weight: g, kg → €/kg
// Volume: ml, cl, l → €/l
// Piece / pack units: no conversion needed; canonical = input unit
//
// Unknown units fall through unchanged so that:
//   - they display as entered and compare correctly against themselves
//   - they do NOT compare against aliases (e.g. 'pcs' vs 'kpl' stay separate)
// If a new unit appears on receipts, add it here rather than relying on the
// fall-through, so the canonical unit is explicit and testable.

export const UNIT_NORMALIZATION: Record<string, { factor: number; canonical: string }> = {
  g: { factor: 1000, canonical: 'kg' },
  kg: { factor: 1, canonical: 'kg' },
  ml: { factor: 1000, canonical: 'l' },
  cl: { factor: 100, canonical: 'l' },
  l: { factor: 1, canonical: 'l' },
  kpl: { factor: 1, canonical: 'kpl' },
  pss: { factor: 1, canonical: 'pss' },
  pk: { factor: 1, canonical: 'pk' },
  pkt: { factor: 1, canonical: 'pkt' },
}

export type UnitDimension = 'weight' | 'volume' | 'count' | 'package' | 'unknown'

const QUANTITY_NORMALIZATION: Record<
  string,
  { factor: number; canonical: string; dimension: UnitDimension }
> = {
  g: { factor: 0.001, canonical: 'kg', dimension: 'weight' },
  kg: { factor: 1, canonical: 'kg', dimension: 'weight' },
  ml: { factor: 0.001, canonical: 'l', dimension: 'volume' },
  cl: { factor: 0.01, canonical: 'l', dimension: 'volume' },
  l: { factor: 1, canonical: 'l', dimension: 'volume' },
  kpl: { factor: 1, canonical: 'kpl', dimension: 'count' },
  pss: { factor: 1, canonical: 'pss', dimension: 'package' },
  pk: { factor: 1, canonical: 'pk', dimension: 'package' },
  pkt: { factor: 1, canonical: 'pkt', dimension: 'package' },
}

/**
 * Converts purchased quantities to a unit that is safe to aggregate.
 * Incompatible dimensions remain separate (for example kg is never added to kpl).
 */
export function normalizeQuantity(
  quantity: number,
  unit: string | null
): { quantity: number; canonical: string | null; dimension: UnitDimension } {
  if (!unit) return { quantity, canonical: null, dimension: 'unknown' }
  const normalizedUnit = unit.trim().toLowerCase()
  const normalization = QUANTITY_NORMALIZATION[normalizedUnit]
  if (!normalization) {
    return { quantity, canonical: normalizedUnit, dimension: 'unknown' }
  }
  return {
    quantity: quantity * normalization.factor,
    canonical: normalization.canonical,
    dimension: normalization.dimension,
  }
}

/**
 * Normalize a per-unit price to its canonical unit.
 *
 * @example
 *   normalizeUnitPrice(0.01, 'g')  // → { price: 10, canonical: 'kg' }
 *   normalizeUnitPrice(6.98, 'kg') // → { price: 6.98, canonical: 'kg' }
 *   normalizeUnitPrice(1.50, null) // → { price: 1.50, canonical: null }
 */
export function normalizeUnitPrice(
  rawPrice: number,
  unit: string | null
): { price: number; canonical: string | null } {
  if (!unit) return { price: rawPrice, canonical: null }
  const norm = UNIT_NORMALIZATION[unit.toLowerCase()]
  if (!norm) {
    // Unknown unit — returned as-is. Compares correctly against itself but
    // not against aliases (e.g. 'pcs' vs 'kpl'). Extend UNIT_NORMALIZATION
    // rather than relying on this fallback for any new receipt unit.
    return { price: rawPrice, canonical: unit }
  }
  return { price: rawPrice * norm.factor, canonical: norm.canonical }
}
