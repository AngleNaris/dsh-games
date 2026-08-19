/**
 * dsh-games persistence — tiny JSON store under $DSH_HOME (defaults to
 * ~/.dsh) as `games.json`: the member identity, the lifetime token ledger
 * totals, the per-session dedupe frontiers, and the pet display layout.
 * Deliberately minimal: one file, atomic rename write, tolerant read.
 * @module @kasidia/dsh-games/persist
 */
/** One counted step's position in a session (dedupe frontier value). */
export interface StepFrontier {
    turn: number;
    step: number;
}
/** Display layout of the floating pet. */
export interface GamesDisplayConfig {
    visible: boolean;
    size: number;
    right: number;
    bottom: number;
    /** True pins the pet in place (drag disabled). */
    locked: boolean;
}
/** Meta of a user-uploaded custom pet image (the bytes live in pets/). */
export interface PetMeta {
    /** File extension derived from the validated magic bytes. */
    ext: 'png' | 'gif';
    /** Upload timestamp — cache-busting version for room sync. */
    version: number;
    /** Decoded image width (px). */
    width: number;
    /** Decoded image height (px). */
    height: number;
}
/** Everything persisted for the games plugin. */
export interface GamesPersist {
    /** Stable per-instance player id (generated on first run). */
    memberId: string;
    /** Player nickname (mirrored into the settings section). */
    nickname: string;
    /** Lifetime usage tokens accumulated across every session. */
    tokens: number;
    /** Per-session last-counted (turn, step) — restart-safe dedupe. */
    frontiers: Record<string, StepFrontier>;
    display: GamesDisplayConfig;
    /** Uploaded custom pet image, if any. */
    pet?: PetMeta | undefined;
}
/** Default pet nickname until the user sets one. */
export declare const DEFAULT_NICKNAME = "\u6DF1\u6D77\u65C5\u4EBA";
/** Nickname constraints. */
export declare const NICKNAME_MAX_LENGTH = 24;
/** Default hat step: one hat per 100M usage tokens. */
export declare const DEFAULT_HAT_TOKEN_STEP = 100000000;
/** Persisted file name. */
export declare const GAMES_FILE = "games.json";
export declare const DISPLAY_SIZE_MIN = 24;
export declare const DISPLAY_SIZE_MAX = 512;
export declare const DISPLAY_INSET_MAX = 10000;
export declare const defaultDisplayConfig: GamesDisplayConfig;
/** File name of the pets directory under the persist dir. */
export declare const PETS_DIR = "pets";
/** Upload limits for custom pet images. */
export { PET_MAX_BYTES, PET_MAX_DIMENSION } from './rules.ts';
/** Resolve the persistence directory ($DSH_HOME or ~/.dsh). */
export declare function gamesHomeDir(): string;
export declare function emptyPersist(): GamesPersist;
/** Load persisted state; missing or corrupt files fall back to defaults. */
export declare function loadGamesPersist(dir?: string): GamesPersist;
/** Atomically persist state (write temp + rename). */
export declare function saveGamesPersist(data: GamesPersist, dir?: string): void;
//# sourceMappingURL=persist.d.ts.map