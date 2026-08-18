import { describe, expect, it } from 'vitest'
import {
  crownsAtTokens,
  createTokenProgressBaseline,
  settleTokenProgress,
} from './progress.ts'
import type { GameRules } from './api.ts'
import { defaultGameRules } from '../rules.ts'

function rules(tokenStep: number, base = 3): GameRules {
  return {
    crown: {
      tokenStep,
      base,
      levels: [],
    },
    pet: {
      maxBytes: 1,
      maxDimension: 1,
    },
  }
}

describe('token progress settlement', () => {
  it('rebases delayed server rules without inventing a crown reward', () => {
    const baseline = createTokenProgressBaseline(2_100_000, null)
    const result = settleTokenProgress(baseline, 2_200_000, rules(2_000_000))

    expect(result.delta).toBe(100_000)
    expect(result.crownTier).toBeNull()
    expect(result.baseline.crowns[0]).toBe(1)
  })

  it('reports the highest tier that actually increased', () => {
    const stableRules = rules(1_000_000)
    const baseline = createTokenProgressBaseline(2_900_000, stableRules)
    const result = settleTokenProgress(baseline, 3_000_000, stableRules)

    expect(result.delta).toBe(100_000)
    expect(result.crownTier).toBe(1)
  })

  it('uses the shared server defaults when no server can be reached', () => {
    const defaults = defaultGameRules()
    expect(crownsAtTokens(defaults.crown.tokenStep * defaults.crown.base, null)[1]).toBe(1)
  })
})
