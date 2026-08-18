/**
 * Server-side validation for client-computed token and crown reports.
 *
 * The server cannot independently meter provider usage, so this is a basic
 * integrity layer: it verifies the deterministic crown inventory, enforces a
 * monotonic token total, and bounds long-term growth with a linear envelope.
 * The first valid observation establishes a historical baseline.
 *
 * Persisted state contains only member ids, counters, and timestamps.
 * @module @anglenaris/dsh-games/anticheat
 */

import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { dirname } from 'node:path'
import { crownCounts, crownUnits } from './crowns.ts'
import type { CrownRules } from './gameconfig.ts'

export type AntiCheatError =
  | 'anti-cheat-locked'
  | 'crowns-mismatch'
  | 'invalid'
  | 'token-jump'
  | 'token-regression'

export interface AntiCheatPolicy {
  /** Immediate growth allowance above the time-based envelope. */
  burstTokens: number
  /** Maximum sustained growth rate. */
  tokensPerMinute: number
  /** Anomalies allowed in one strike window before a temporary lock. */
  strikeLimit: number
  /** Length of the anomaly strike window. */
  strikeWindowMs: number
  /** Temporary lock duration after the strike limit is reached. */
  lockMs: number
  /** Forget inactive baselines after this duration. */
  retentionMs: number
  /** Hard cap for persisted member baselines. */
  maxEntries: number
}

export interface AntiCheatOptions {
  /** Static rules, or a provider when host settings can change at runtime. */
  rules: CrownRules | (() => CrownRules)
  policy?: Partial<AntiCheatPolicy>
  /** Optional JSON persistence path. Omit for memory-only validation. */
  stateFile?: string
}

export interface AntiCheatReport {
  memberId: string
  tokens: number
  crowns?: number[]
}

export type AntiCheatResult =
  | { ok: true; tokens: number; crowns: number[] }
  | { ok: false; error: AntiCheatError }

interface AntiCheatEntry {
  anchorTokens: number
  anchorAt: number
  lastTokens: number
  lastSeenAt: number
  strikeCount: number
  strikeWindowStartedAt: number
  lockedUntil: number
  lastRejectedSignature?: string
}

interface AntiCheatFile {
  version: 1
  updatedAt: number
  entries: Record<string, AntiCheatEntry>
}

export const DEFAULT_ANTI_CHEAT_POLICY: Readonly<AntiCheatPolicy> = {
  burstTokens: 500_000,
  tokensPerMinute: 1_000_000,
  strikeLimit: 3,
  strikeWindowMs: 10 * 60_000,
  lockMs: 60_000,
  retentionMs: 30 * 24 * 60 * 60_000,
  maxEntries: 10_000,
}

function positiveInt(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 1
    ? Math.round(value)
    : fallback
}

export function normalizeAntiCheatPolicy(raw: unknown): AntiCheatPolicy {
  const record = typeof raw === 'object' && raw !== null
    ? raw as Record<string, unknown>
    : {}
  return {
    burstTokens: positiveInt(record.burstTokens, DEFAULT_ANTI_CHEAT_POLICY.burstTokens),
    tokensPerMinute: positiveInt(record.tokensPerMinute, DEFAULT_ANTI_CHEAT_POLICY.tokensPerMinute),
    strikeLimit: positiveInt(record.strikeLimit, DEFAULT_ANTI_CHEAT_POLICY.strikeLimit),
    strikeWindowMs: positiveInt(record.strikeWindowMs, DEFAULT_ANTI_CHEAT_POLICY.strikeWindowMs),
    lockMs: positiveInt(record.lockMs, DEFAULT_ANTI_CHEAT_POLICY.lockMs),
    retentionMs: positiveInt(record.retentionMs, DEFAULT_ANTI_CHEAT_POLICY.retentionMs),
    maxEntries: positiveInt(record.maxEntries, DEFAULT_ANTI_CHEAT_POLICY.maxEntries),
  }
}

function tokenTotal(raw: unknown): number | undefined {
  return typeof raw === 'number' &&
    Number.isSafeInteger(raw) &&
    raw >= 0
    ? raw
    : undefined
}

function reportedCrowns(raw: unknown, expectedLength: number): number[] | undefined {
  if (!Array.isArray(raw) || raw.length !== expectedLength) return undefined
  const crowns: number[] = []
  for (const value of raw) {
    if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) return undefined
    crowns.push(value)
  }
  return crowns
}

function crownsEqual(left: readonly number[], right: readonly number[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

function validEntry(raw: unknown): AntiCheatEntry | undefined {
  if (typeof raw !== 'object' || raw === null) return undefined
  const record = raw as Record<string, unknown>
  const anchorTokens = tokenTotal(record.anchorTokens)
  const lastTokens = tokenTotal(record.lastTokens)
  const anchorAt = tokenTotal(record.anchorAt)
  const lastSeenAt = tokenTotal(record.lastSeenAt)
  const strikeCount = tokenTotal(record.strikeCount)
  const strikeWindowStartedAt = tokenTotal(record.strikeWindowStartedAt)
  const lockedUntil = tokenTotal(record.lockedUntil)
  if (anchorTokens === undefined ||
      lastTokens === undefined ||
      anchorAt === undefined ||
      lastSeenAt === undefined ||
      strikeCount === undefined ||
      strikeWindowStartedAt === undefined ||
      lockedUntil === undefined) return undefined
  return {
    anchorTokens,
    anchorAt,
    lastTokens,
    lastSeenAt,
    strikeCount,
    strikeWindowStartedAt,
    lockedUntil,
    ...(typeof record.lastRejectedSignature === 'string'
      ? { lastRejectedSignature: record.lastRejectedSignature.slice(0, 256) }
      : {}),
  }
}

export class AntiCheatGuard {
  private readonly rules: () => CrownRules
  private readonly policy: AntiCheatPolicy
  private readonly stateFile: string | undefined
  private readonly entries = new Map<string, AntiCheatEntry>()
  private dirty = false

  constructor(options: AntiCheatOptions) {
    const rules = options.rules
    this.rules = typeof rules === 'function' ? rules : () => rules
    this.policy = {
      ...DEFAULT_ANTI_CHEAT_POLICY,
      ...normalizeAntiCheatPolicy(options.policy),
    }
    this.stateFile = options.stateFile
    this.load()
  }

  validate(report: AntiCheatReport, now: number = Date.now()): AntiCheatResult {
    const tokens = tokenTotal(report.tokens)
    if (tokens === undefined) return { ok: false, error: 'invalid' }

    const rules = this.rules()
    const expected = crownCounts(crownUnits(tokens, rules.tokenStep), rules.base)
    const crowns = reportedCrowns(report.crowns, expected.length)
    const entry = this.entries.get(report.memberId)

    if (entry !== undefined && entry.lockedUntil > now) {
      return { ok: false, error: 'anti-cheat-locked' }
    }
    if (entry !== undefined && entry.lockedUntil !== 0 && entry.lockedUntil <= now) {
      entry.lockedUntil = 0
      entry.strikeCount = 0
      entry.strikeWindowStartedAt = now
      entry.lastRejectedSignature = undefined
      this.dirty = true
    }

    if (crowns === undefined || !crownsEqual(crowns, expected)) {
      return entry === undefined
        ? { ok: false, error: 'crowns-mismatch' }
        : this.reject(entry, 'crowns-mismatch', `${tokens}:${JSON.stringify(report.crowns)}`, now)
    }

    if (entry === undefined) {
      this.entries.set(report.memberId, {
        anchorTokens: tokens,
        anchorAt: now,
        lastTokens: tokens,
        lastSeenAt: now,
        strikeCount: 0,
        strikeWindowStartedAt: now,
        lockedUntil: 0,
      })
      this.dirty = true
      this.enforceEntryCap()
      this.flush()
      return { ok: true, tokens, crowns: expected }
    }

    if (tokens < entry.lastTokens) {
      return this.reject(entry, 'token-regression', String(tokens), now)
    }

    const elapsedMs = Math.max(0, now - entry.anchorAt)
    const timedAllowance = Math.floor((elapsedMs * this.policy.tokensPerMinute) / 60_000)
    const maximum = Math.min(
      Number.MAX_SAFE_INTEGER,
      entry.anchorTokens + this.policy.burstTokens + timedAllowance,
    )
    if (tokens > maximum) {
      return this.reject(entry, 'token-jump', String(tokens), now)
    }

    entry.lastTokens = tokens
    entry.lastSeenAt = now
    entry.lastRejectedSignature = undefined
    this.dirty = true
    return { ok: true, tokens, crowns: expected }
  }

  sweep(now: number = Date.now()): void {
    for (const [memberId, entry] of this.entries) {
      if (now - entry.lastSeenAt > this.policy.retentionMs) {
        this.entries.delete(memberId)
        this.dirty = true
      }
    }
    this.enforceEntryCap()
    this.flush()
  }

  close(): void {
    this.flush()
  }

  private reject(
    entry: AntiCheatEntry,
    error: Exclude<AntiCheatError, 'anti-cheat-locked' | 'invalid'>,
    detail: string,
    now: number,
  ): AntiCheatResult {
    entry.lastSeenAt = now
    const signature = `${error}:${detail}`
    if (entry.lastRejectedSignature !== signature) {
      if (now - entry.strikeWindowStartedAt > this.policy.strikeWindowMs) {
        entry.strikeCount = 0
        entry.strikeWindowStartedAt = now
      }
      entry.strikeCount += 1
      entry.lastRejectedSignature = signature
    }
    if (entry.strikeCount >= this.policy.strikeLimit) {
      entry.lockedUntil = now + this.policy.lockMs
      this.dirty = true
      this.flush()
      return { ok: false, error: 'anti-cheat-locked' }
    }
    this.dirty = true
    return { ok: false, error }
  }

  private enforceEntryCap(): void {
    const overflow = this.entries.size - this.policy.maxEntries
    if (overflow <= 0) return
    const oldest = [...this.entries.entries()]
      .sort((left, right) => left[1].lastSeenAt - right[1].lastSeenAt)
      .slice(0, overflow)
    for (const [memberId] of oldest) this.entries.delete(memberId)
    this.dirty = true
  }

  private load(): void {
    if (this.stateFile === undefined || !existsSync(this.stateFile)) return
    try {
      const parsed = JSON.parse(readFileSync(this.stateFile, 'utf8')) as Partial<AntiCheatFile>
      if (parsed.version !== 1 || typeof parsed.entries !== 'object' || parsed.entries === null) return
      for (const [memberId, raw] of Object.entries(parsed.entries)) {
        if (!/^[A-Za-z0-9-]{8,64}$/.test(memberId)) continue
        const entry = validEntry(raw)
        if (entry !== undefined) this.entries.set(memberId, entry)
      }
      this.enforceEntryCap()
    } catch {
      // Corrupt state must not prevent the room server from starting.
    }
  }

  private flush(): void {
    if (!this.dirty || this.stateFile === undefined) return
    mkdirSync(dirname(this.stateFile), { recursive: true })
    const tempFile = `${this.stateFile}.${process.pid}.tmp`
    const entries = Object.fromEntries(this.entries)
    try {
      writeFileSync(tempFile, `${JSON.stringify({
        version: 1,
        updatedAt: Date.now(),
        entries,
      } satisfies AntiCheatFile, null, 2)}\n`, 'utf8')
      renameSync(tempFile, this.stateFile)
      this.dirty = false
    } catch (error) {
      // Validation remains active in memory when persistence is temporarily
      // unavailable; the next sweep retries the atomic write.
      console.warn('[dsh-games] failed to persist anti-cheat state:', error)
    } finally {
      rmSync(tempFile, { force: true })
    }
  }
}
