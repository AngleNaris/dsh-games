import {
  crownCounts,
  crownUnits,
  DEFAULT_CROWN_BASE,
} from '../crowns.ts'
import type { GameRules } from './api.ts'

export interface TokenProgressBaseline {
  tokens: number
  crowns: number[]
  ruleKey: string
}

export interface TokenProgressResult {
  baseline: TokenProgressBaseline
  delta: number
  crownTier: number | null
}

function crownRule(hostTokenStep: number, rules: GameRules | null): {
  tokenStep: number
  base: number
  key: string
} {
  const tokenStep = rules?.crown.tokenStep ?? hostTokenStep
  const base = rules?.crown.base ?? DEFAULT_CROWN_BASE
  return { tokenStep, base, key: `${tokenStep}:${base}` }
}

export function crownsAtTokens(
  tokens: number,
  hostTokenStep: number,
  rules: GameRules | null,
): number[] {
  const rule = crownRule(hostTokenStep, rules)
  return crownCounts(crownUnits(tokens, rule.tokenStep), rule.base)
}

export function createTokenProgressBaseline(
  tokens: number,
  hostTokenStep: number,
  rules: GameRules | null,
): TokenProgressBaseline {
  const rule = crownRule(hostTokenStep, rules)
  return {
    tokens,
    crowns: crownCounts(crownUnits(tokens, rule.tokenStep), rule.base),
    ruleKey: rule.key,
  }
}

export function settleTokenProgress(
  previous: TokenProgressBaseline,
  nextTokens: number,
  hostTokenStep: number,
  rules: GameRules | null,
): TokenProgressResult {
  const rule = crownRule(hostTokenStep, rules)
  const previousCrowns = previous.ruleKey === rule.key
    ? previous.crowns
    : crownCounts(crownUnits(previous.tokens, rule.tokenStep), rule.base)
  const nextCrowns = crownCounts(crownUnits(nextTokens, rule.tokenStep), rule.base)
  const baseline = {
    tokens: nextTokens,
    crowns: nextCrowns,
    ruleKey: rule.key,
  }
  const delta = nextTokens - previous.tokens
  if (delta <= 0) return { baseline, delta: 0, crownTier: null }

  for (let tier = nextCrowns.length - 1; tier >= 0; tier -= 1) {
    if (nextCrowns[tier] > (previousCrowns[tier] ?? 0)) {
      return { baseline, delta, crownTier: tier }
    }
  }
  return { baseline, delta, crownTier: null }
}
