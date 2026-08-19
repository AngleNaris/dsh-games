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
 * @module @kasidia/dsh-games/ledger
 */
/** Provider-reported token accounting (subset of dsh-llm TokenUsage). */
export interface UsageLike {
    inputTokens?: number;
    outputTokens?: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
}
/** One step position inside a session. */
export interface StepKey {
    turn: number;
    step: number;
}
/** Durable ledger state (persisted across restarts). */
export interface LedgerState {
    tokens: number;
    frontiers: Record<string, StepFrontier>;
}
/** Frontier shape (mirrors persist.StepFrontier without the import cycle). */
export interface StepFrontier {
    turn: number;
    step: number;
}
/** Outcome of one usage report. */
export interface LedgerResult {
    state: LedgerState;
    /** True when the report changed the total. */
    counted: boolean;
}
/** Sum the finite usage buckets (unknown buckets count as zero). */
export declare function usageTotal(usage: UsageLike | undefined): number;
/** True when `key` is at or below the frontier (already counted). */
export declare function atOrBelowFrontier(frontier: StepFrontier | undefined, key: StepKey): boolean;
/** Advance the frontier to cover `key`. */
export declare function advanceFrontier(frontier: StepFrontier | undefined, key: StepKey): StepFrontier;
/** Bounds for the in-process per-step memo (guards unbounded growth). */
export declare const MEMO_MAX_SESSIONS = 64;
export declare const MEMO_MAX_STEPS = 128;
/**
 * In-process per-step memo: sessionId -> ("turn:step" -> last total).
 * Insertion order doubles as LRU order (first key evicted first).
 */
export declare class StepMemo {
    private readonly sessions;
    private static keyOf;
    private static evict;
    /** Merge one report into the memo; returns the positive delta to add. */
    merge(sessionId: string, key: StepKey, total: number): number;
}
/**
 * Fold one usage report into the ledger. Returns the next ledger state and
 * whether the total changed. `memo` is caller-owned (kept across calls).
 */
export declare function countStepUsage(prev: LedgerState, memo: StepMemo, sessionId: string, key: StepKey, usage: UsageLike | undefined): LedgerResult;
//# sourceMappingURL=ledger.d.ts.map