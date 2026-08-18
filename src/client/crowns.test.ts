/**
 * Unit tests for the crown pyramid layout + merge key inheritance + the
 * base-3 craft ladder (pure math, no DOM — tier bounds fall back to the
 * default band in node).
 * @module dsh-games/client/crowns.test
 */

import { describe, expect, it } from 'vitest'
import {
  layoutCrownPyramid,
  planMerge,
  ROW_CAPACITY,
} from './crowns.tsx'
import { crownCounts, DEFAULT_CROWN_BASE } from '../crowns.ts'

/** The user's 10-crown example: bronze×3 silver×2 gold×2 platinum×1
 * amethyst×1 magic-bronze×1 (arbitrary counts for the layout engine). */
const USER_EXAMPLE = [3, 2, 2, 1, 1, 1, 0, 0, 0, 0]

describe('crownCounts (base 3 ladder)', () => {
  it('defaults to the three-craft ladder', () => {
    expect(DEFAULT_CROWN_BASE).toBe(3)
  })

  it('holds 0..2 crowns per level — the 3rd crafts up', () => {
    expect(crownCounts(2, 3)).toEqual([2, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(crownCounts(3, 3)).toEqual([0, 1, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(crownCounts(13, 3)).toEqual([1, 1, 1, 0, 0, 0, 0, 0, 0, 0])
    expect(crownCounts(41, 3)).toEqual([2, 1, 1, 1, 0, 0, 0, 0, 0, 0])
  })

  it('decomposes the baseline ledger (323 units) into 9 crowns', () => {
    expect(crownCounts(323, 3)).toEqual([2, 2, 2, 2, 0, 1, 0, 0, 0, 0])
  })
})

describe('layoutCrownPyramid', () => {
  it('keeps advanced crowns on the bottom/right and low crowns on the upper layer', () => {
    const { slots, overflow } = layoutCrownPyramid(USER_EXAMPLE, 60)
    expect(overflow).toBe(0)
    expect(slots).toHaveLength(10)
    // The 7-slot base holds the strongest crowns, ordered low→high so the
    // strongest one is on the right. Bronze crowns rise to the next layer.
    const bottomLayer = slots.slice(0, 7).map((s) => s.tier)
    const upperLayer = slots.slice(7).map((s) => s.tier)
    expect(bottomLayer).toEqual([1, 1, 2, 2, 3, 4, 5])
    expect(upperLayer).toEqual([0, 0, 0])
    expect(slots[7].y).toBeLessThan(slots[0].y)
  })

  it('puts a newly gained low crown on the highest layer and its left edge', () => {
    const { slots } = layoutCrownPyramid([8, 1, 0, 0, 0, 0, 0, 0, 0, 0], 60)
    const bottom = slots.slice(0, 7)
    const upper = slots.slice(7)
    expect(bottom.map((slot) => slot.tier)).toEqual([0, 0, 0, 0, 0, 0, 1])
    expect(upper.map((slot) => slot.key)).toEqual(['0:7', '0:6'])
    expect(upper[0].x).toBeLessThan(upper[1].x)
    expect(upper[0].y).toBeLessThan(bottom[0].y)
  })

  it('uses a true 7→1 pyramid and reports overflow beyond 28 slots', () => {
    const many = [5, 5, 5, 5, 5, 5, 5, 5, 5, 20] // 65 crowns
    const { slots, overflow } = layoutCrownPyramid(many, 60)
    const capacity = ROW_CAPACITY.reduce((sum, n) => sum + n, 0)
    expect(ROW_CAPACITY).toEqual([7, 6, 5, 4, 3, 2, 1])
    expect(capacity).toBe(28)
    expect(slots).toHaveLength(capacity)
    expect(overflow).toBe(37)
  })

  it('grows the crowns toward the tip', () => {
    const { slots } = layoutCrownPyramid(USER_EXAMPLE, 60)
    expect(slots[0].size).toBeLessThan(slots[7].size)
  })

  it('centers an unfilled layer (a lone crown sits on the pile)', () => {
    const { slots } = layoutCrownPyramid([1, 0, 0, 0, 0, 0, 0, 0, 0, 0], 60)
    expect(slots).toHaveLength(1)
    expect(Math.abs(slots[0].x)).toBeLessThanOrEqual(0.06 * 60)
    expect(slots[0].y).toBeLessThan(0)
  })

  it('applies a stable per-key tilt of ±2..4 degrees', () => {
    const { slots } = layoutCrownPyramid(USER_EXAMPLE, 60)
    for (const slot of slots) {
      expect(Math.abs(slot.rot)).toBeGreaterThanOrEqual(2)
      expect(Math.abs(slot.rot)).toBeLessThanOrEqual(4)
    }
  })

  it('renders a claimed crown under its inherited key', () => {
    const override = new Map([['1:0', '0:5']])
    const { slots } = layoutCrownPyramid([0, 1, 0, 0, 0, 0, 0, 0, 0, 0], 60, override)
    expect(slots).toHaveLength(1)
    expect(slots[0].key).toBe('0:5')
    expect(slots[0].tier).toBe(1)
  })

  it('places a crafted crown at the right edge of its bottom row', () => {
    const plan = planMerge(
      [3, 1, 0, 0, 0, 0, 0, 0, 0, 0],
      [0, 2, 0, 0, 0, 0, 0, 0, 0, 0],
    )
    const { slots } = layoutCrownPyramid(
      [0, 2, 0, 0, 0, 0, 0, 0, 0, 0],
      60,
      plan.claims,
    )
    expect(slots.at(-1)?.key).toBe(plan.claims.get('1:1'))
    expect(slots.at(-1)?.x).toBeGreaterThan(slots[0].x)
  })
})

describe('planMerge', () => {
  it('claims a vanished bronze key for the crafted silver (3 → 1)', () => {
    const plan = planMerge([3, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 1, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(plan.claims.get('1:0')).toBe('0:2')
    expect(plan.vanished).toEqual(['0:1', '0:0'])
    expect(plan.freshKeys).toEqual([])
  })

  it('claims from the highest vanished tier first in cascades', () => {
    const prev = [2, 2, 2, 2, 0, 1, 0, 0, 0, 0]
    const now = [0, 0, 0, 0, 0, 2, 0, 2, 1, 0]
    const plan = planMerge(prev, now)
    expect(plan.claims.get('8:0')).toBe('3:1')
    expect(plan.claims.get('7:1')).toBe('3:0')
    expect(plan.claims.get('7:0')).toBe('2:1')
    expect(plan.claims.get('5:1')).toBe('2:0')
    expect(plan.vanished).toEqual(['0:1', '0:0', '1:1', '1:0'])
    expect(plan.freshKeys).toEqual([])
  })

  it('leaves a fresh crown that has nothing to claim (pure gain)', () => {
    const plan = planMerge([1, 0, 0, 0, 0, 0, 0, 0, 0, 0], [2, 0, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(plan.claims.size).toBe(0)
    expect(plan.vanished).toEqual([])
    expect(plan.freshKeys).toEqual(['0:1'])
  })

  it('is a no-op for identical snapshots', () => {
    const plan = planMerge([2, 1, 0, 0, 0, 0, 0, 0, 0, 0], [2, 1, 0, 0, 0, 0, 0, 0, 0, 0])
    expect(plan.claims.size).toBe(0)
    expect(plan.vanished).toEqual([])
    expect(plan.freshKeys).toEqual([])
  })

  it('never claims a key twice', () => {
    const plan = planMerge([6, 0, 0, 0, 0, 0, 0, 0, 0, 0], [0, 2, 0, 0, 0, 0, 0, 0, 0, 0])
    const claimed = new Set(plan.claims.values())
    expect(claimed.size).toBe(plan.claims.size)
    expect(plan.vanished).toEqual(['0:3', '0:2', '0:1', '0:0'])
  })

  it('keeps the strongest crown on the bottom row right edge', () => {
    const { slots } = layoutCrownPyramid(USER_EXAMPLE, 60)
    const strongest = Math.max(...slots.map((slot) => slot.tier))
    expect(slots.slice(0, ROW_CAPACITY[0]).at(-1)?.tier).toBe(strongest)
  })
})
