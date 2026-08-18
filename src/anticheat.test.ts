/**
 * Unit tests for server-side token/crown report validation.
 * @module dsh-games/anticheat.test
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AntiCheatGuard } from './anticheat.ts'
import { crownCounts, crownUnits } from './crowns.ts'
import { defaultGameRules } from './gameconfig.ts'

const MEMBER = 'member-a1'
const rules = defaultGameRules().crown
const tempDirs: string[] = []

function crowns(tokens: number): number[] {
  return crownCounts(crownUnits(tokens, rules.tokenStep), rules.base)
}

function report(tokens: number, memberId = MEMBER) {
  return { memberId, tokens, crowns: crowns(tokens) }
}

function guard(options: {
  stateFile?: string
  burstTokens?: number
  tokensPerMinute?: number
  strikeLimit?: number
  lockMs?: number
} = {}): AntiCheatGuard {
  return new AntiCheatGuard({
    rules,
    stateFile: options.stateFile,
    policy: {
      burstTokens: options.burstTokens ?? 500_000,
      tokensPerMinute: options.tokensPerMinute ?? 1_000_000,
      strikeLimit: options.strikeLimit ?? 3,
      lockMs: options.lockMs ?? 60_000,
    },
  })
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe('AntiCheatGuard', () => {
  it('accepts an existing high total as the first baseline and verifies zero crowns', () => {
    const checker = guard()

    expect(checker.validate(report(9_876_543_210), 1_000)).toMatchObject({
      ok: true,
      tokens: 9_876_543_210,
    })
    expect(checker.validate(report(0, 'member-b2'), 1_000)).toEqual({
      ok: true,
      tokens: 0,
      crowns: new Array(10).fill(0),
    })
  })

  it('rejects a crown inventory that does not match the token total', () => {
    const checker = guard()

    expect(checker.validate({
      memberId: MEMBER,
      tokens: 1_000_000,
      crowns: new Array(10).fill(0),
    }, 1_000)).toEqual({ ok: false, error: 'crowns-mismatch' })
  })

  it('allows sustained growth but does not reset the burst allowance per report', () => {
    const checker = guard()

    expect(checker.validate(report(0), 0).ok).toBe(true)
    expect(checker.validate(report(900_000), 30_000).ok).toBe(true)
    expect(checker.validate(report(1_100_000), 31_000)).toEqual({
      ok: false,
      error: 'token-jump',
    })
    expect(checker.validate(report(1_500_000), 60_000).ok).toBe(true)
  })

  it('rejects token regression and locks after distinct repeated anomalies', () => {
    const checker = guard({ strikeLimit: 3, lockMs: 60_000 })

    expect(checker.validate(report(100), 1_000).ok).toBe(true)
    expect(checker.validate(report(99), 2_000)).toEqual({
      ok: false,
      error: 'token-regression',
    })
    // An identical heartbeat is one incident, not another strike.
    expect(checker.validate(report(99), 3_000)).toEqual({
      ok: false,
      error: 'token-regression',
    })
    expect(checker.validate(report(700_000), 4_000)).toEqual({
      ok: false,
      error: 'token-jump',
    })
    expect(checker.validate(report(800_000), 5_000)).toEqual({
      ok: false,
      error: 'anti-cheat-locked',
    })
    expect(checker.validate(report(100), 5_001)).toEqual({
      ok: false,
      error: 'anti-cheat-locked',
    })
    expect(checker.validate(report(100), 65_001).ok).toBe(true)
  })

  it('persists the baseline so a restart cannot erase regression detection', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dsh-games-anticheat-'))
    tempDirs.push(dir)
    const stateFile = join(dir, 'anticheat.json')
    const first = guard({ stateFile })

    expect(first.validate(report(2_000_000), 1_000).ok).toBe(true)
    first.close()

    const restored = guard({ stateFile })
    expect(restored.validate(report(1_999_999), 2_000)).toEqual({
      ok: false,
      error: 'token-regression',
    })
  })
})
