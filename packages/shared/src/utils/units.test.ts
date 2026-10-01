import { describe, expect, it } from 'vitest'
import { normalizeQuantity, normalizeUnitPrice } from './units'

describe('unit normalization', () => {
  it('normalizes compatible quantities without mixing dimensions', () => {
    expect(normalizeQuantity(500, 'g')).toEqual({
      quantity: 0.5,
      canonical: 'kg',
      dimension: 'weight',
    })
    expect(normalizeQuantity(25, 'cl')).toEqual({
      quantity: 0.25,
      canonical: 'l',
      dimension: 'volume',
    })
    expect(normalizeQuantity(2, 'kpl')).toEqual({
      quantity: 2,
      canonical: 'kpl',
      dimension: 'count',
    })
  })

  it('keeps unknown units isolated and normalizes known unit prices', () => {
    expect(normalizeQuantity(3, 'box')).toEqual({
      quantity: 3,
      canonical: 'box',
      dimension: 'unknown',
    })
    expect(normalizeUnitPrice(0.01, 'g')).toEqual({
      price: 10,
      canonical: 'kg',
    })
  })
})
