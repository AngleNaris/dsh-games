/**
 * Token ledger — pure accumulation logic for the lifetime usage-token total.
 *
 * The `session/event` firehose emits live events only (constructor seeds —
 * replay, fork, resume — never publish), so an `assistant/message` or a
 * `usage` stream chunk is emitted exactly once per step per process. Two
 * layers still guard against double counting:
 *
 *  - persisted per-session frontiers: a step at or below the frontier was
 *    counted in an earlier process, so a resumed session can never re-add it;
 *  - an in-process per-step memo: the same step can report usage twice (a
 *    streaming `usage` chunk, then the assembled `assistant/message`); the
 *    second report merges only the positive delta (totals never shrink), and
 *    the memo is bounded (LRU-ish eviction) because old live events are never
 *    re-emitted.
 * @module @anglenaris/dsh-games/ledger
 */

/** Provider-reported token accounting (subset of dsh-llm TokenUsage). */
export interface UsageLike {
  inputTokens?: number
  outputTokens?: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

/** One step position inside a session. */
export interface StepKey {
  turn: number
  step: number
}

/** Durable ledger state (persisted across restarts). */
export interface LedgerState {
  tokens: number
  frontiers: Record<string, StepFrontier>
}

/** Frontier shape (mirrors persist.StepFrontier without the import cycle). */
export interface StepFrontier {
  turn: number
  step: number
}

/** Outcome of one usage report. */
export interface LedgerResult {
  state: LedgerState
  /** True when the report changed the total. */
  counted: boolean
}

/** Sum the finite usage buckets (unknown buckets count as zero). */
export function usageTotal(usage: UsageLike | undefined): number {
  if (usage === undefined) return 0
  let total = 0
  for (const value of [usage.inputTokens, usage.outputTokens, usage.cacheReadTokens, usage.cacheWriteTokens]) {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) total += value
  }
  return Math.round(total)
}

/** True when `key` is at or below the frontier (already counted). */
export function atOrBelowFrontier(frontier: StepFrontier | undefined, key: StepKey): boolean {
  if (frontier === undefined) return false
  if (key.turn < frontier.turn) return true
  if (key.turn === frontier.turn && key.step <= frontier.step) return true
  return false
}

/** Advance the frontier to cover `key`. */
export function advanceFrontier(frontier: StepFrontier | undefined, key: StepKey): StepFrontier {
  if (frontier === undefined) return { ...key }
  if (key.turn > frontier.turn || (key.turn === frontier.turn && key.step > frontier.step)) {
    return { ...key }
  }
  return frontier
}

/** Bounds for the in-process per-step memo (guards unbounded growth). */
export const MEMO_MAX_SESSIONS = 64
export const MEMO_MAX_STEPS = 128

/**
 * In-process per-step memo: sessionId -> ("turn:step" -> last total).
 * Insertion order doubles as LRU order (first key evicted first).
 */
export class StepMemo {
  private readonly sessions = new Map<string, Map<string, number>>()

  private static keyOf(key: StepKey): string {
    return `${key.turn}:${key.step}`
  }

  private static evict<T>(map: Map<string, T>, cap: number): void {
    while (map.size > cap) {
      const oldest = map.keys().next().value
      if (oldest === undefined) return
      map.delete(oldest)
    }
  }

  /** Merge one report into the memo; returns the positive delta to add. */
  merge(sessionId: string, key: StepKey, total: number): number {
    let steps = this.sessions.get(sessionId)
    if (steps === undefined) {
      steps = new Map()
      this.sessions.set(sessionId, steps)
      StepMemo.evict(this.sessions, MEMO_MAX_SESSIONS)
    }
    const memoKey = StepMemo.keyOf(key)
    const previous = steps.get(memoKey) ?? 0
    const next = Math.max(previous, total)
    steps.set(memoKey, next)
    StepMemo.evict(steps, MEMO_MAX_STEPS)
    return next - previous
  }
}

/**
 * Fold one usage report into the ledger. Returns the next ledger state and
 * whether the total changed. `memo` is caller-owned (kept across calls).
 */
export function countStepUsage(
  prev: LedgerState,
  memo: StepMemo,
  sessionId: string,
  key: StepKey,
  usage: UsageLike | undefined,
): LedgerResult {
  const total = usageTotal(usage)
  if (total <= 0) return { state: prev, counted: false }
  // Cross-process dedupe: a step at or below a persisted frontier already
  // contributed its tokens in an earlier process.
  if (atOrBelowFrontier(prev.frontiers[sessionId], key)) {
    return { state: prev, counted: false }
  }
  // In-process delta merge: a repeat report for the same step adds only the
  // positive difference (streaming chunk -> assembled message).
  const delta = memo.merge(sessionId, key, total)
  if (delta <= 0) return { state: prev, counted: false }
  return {
    state: {
      tokens: prev.tokens + delta,
      frontiers: {
        ...prev.frontiers,
        [sessionId]: advanceFrontier(prev.frontiers[sessionId], key),
      },
    },
    counted: true,
  }
}
