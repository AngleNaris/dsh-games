/**
 * Server-side validation for client-computed token and crown reports.
 *
 * The server cannot independently meter provider usage, so this is a basic
 * integrity layer: it verifies the deterministic crown inventory, enforces a
 * monotonic token total, and bounds long-term growth with a linear envelope.
 * The first valid observation establishes a historical baseline.
 *
 * Persisted state contains only member ids, counters, and timestamps.
 * @module @kasidia/dsh-games/anticheat
 */
import type { CrownRules } from './gameconfig.ts';
export type AntiCheatError = 'anti-cheat-locked' | 'crowns-mismatch' | 'invalid' | 'token-jump' | 'token-regression';
export interface AntiCheatPolicy {
    /** Immediate growth allowance above the time-based envelope. */
    burstTokens: number;
    /** Maximum sustained growth rate. */
    tokensPerMinute: number;
    /** Anomalies allowed in one strike window before a temporary lock. */
    strikeLimit: number;
    /** Length of the anomaly strike window. */
    strikeWindowMs: number;
    /** Temporary lock duration after the strike limit is reached. */
    lockMs: number;
    /** Forget inactive baselines after this duration. */
    retentionMs: number;
    /** Hard cap for persisted member baselines. */
    maxEntries: number;
}
export interface AntiCheatOptions {
    /** Static rules, or a provider when host settings can change at runtime. */
    rules: CrownRules | (() => CrownRules);
    policy?: Partial<AntiCheatPolicy>;
    /** Optional JSON persistence path. Omit for memory-only validation. */
    stateFile?: string;
}
export interface AntiCheatReport {
    memberId: string;
    tokens: number;
    crowns?: number[];
}
export type AntiCheatResult = {
    ok: true;
    tokens: number;
    crowns: number[];
} | {
    ok: false;
    error: AntiCheatError;
};
export declare const DEFAULT_ANTI_CHEAT_POLICY: Readonly<AntiCheatPolicy>;
export declare function normalizeAntiCheatPolicy(raw: unknown): AntiCheatPolicy;
export declare class AntiCheatGuard {
    private readonly rules;
    private readonly policy;
    private readonly stateFile;
    private readonly entries;
    private dirty;
    constructor(options: AntiCheatOptions);
    validate(report: AntiCheatReport, now?: number): AntiCheatResult;
    sweep(now?: number): void;
    close(): void;
    private reject;
    private enforceEntryCap;
    private load;
    private flush;
}
//# sourceMappingURL=anticheat.d.ts.map