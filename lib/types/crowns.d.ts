/**
 * Crown system — the pet's progress display. One bronze crown is earned per
 * `tokenStep` usage tokens (1M by default, configured on the game server);
 * `base` crowns of one level (3 by default) auto-craft into 1 crown of the
 * next level, through ten levels:
 *
 *   bronze → silver → gold → platinum → amethyst,
 *   then the magic tier repeats the same metals (magic crowns render with a
 *   Minecraft-style flowing enchantment glint).
 *
 * The official ladder (base 3, tokenStep 1M):
 *
 *   level          bronze-equivalent   cumulative tokens
 *   bronze         1                   1M
 *   silver         3                   3M
 *   gold           9                   9M
 *   platinum       27                  27M
 *   amethyst       81                  81M
 *   magic-bronze   243                 243M
 *   magic-silver   729                 729M
 *   magic-gold     2,187               2.187B
 *   magic-platinum 6,561               6.561B
 *   magic-amethyst 19,683              19.683B
 *
 * The inventory is not stored: it is a pure base-`base` decomposition of the
 * lifetime crown units (tokens / tokenStep), so "auto-craft" happens by
 * deriving the counts. The client places the derived crowns on the pet in a
 * bottom-up pile (a display layer must be full before the one above starts)
 * — placement is a rendering concern, the ladder itself is unchanged.
 * Shared by the host service and the browser half.
 * @module @kasidia/dsh-games/crowns
 */
/** One crown tier. */
export interface CrownLevel {
    /** Stable id (also the locale key base). */
    id: string;
    /** Base metal color. */
    metal: string;
    /** Light shade (gradient top / orb). */
    light: string;
    /** Dark shade (gradient bottom / band). */
    dark: string;
    /** True for the magic tier: render with the enchantment glint. */
    magic: boolean;
}
/** Default crown step: one bronze crown per 1M usage tokens (server rules). */
export declare const DEFAULT_CROWN_TOKEN_STEP = 1000000;
/** Default crafting base: `base` crowns of one level = 1 of the next (3). */
export declare const DEFAULT_CROWN_BASE = 3;
/** All ten crown levels, lowest first. */
export declare const CROWN_LEVELS: readonly CrownLevel[];
/** How many crown levels exist (10). */
export declare const CROWN_LEVEL_COUNT: number;
/** Safe accessor for one level. */
export declare function crownLevel(index: number): CrownLevel;
/** Total crown units earned from a lifetime token total. */
export declare function crownUnits(tokens: number, step: number): number;
/**
 * Decompose crown units into per-level counts. Base `base` (default 3): that
 * many crowns of one level are exactly 1 of the next, so each level holds
 * 0..base-1 crowns. Any overflow beyond the top level stays in the top level.
 * BigInt keeps the division exact for very large ledgers.
 */
export declare function crownCounts(units: number, base?: number): number[];
/** Sum of all crowns across levels (display badge). */
export declare function crownTotal(counts: readonly number[]): number;
/** Highest level with at least one crown; -1 when there are none. */
export declare function topCrownLevel(counts: readonly number[]): number;
/** Display tier summary like "黄金王冠 ×2 白银 ×3": the top level with count. */
export declare function crownSummary(counts: readonly number[]): {
    level: number;
    count: number;
} | null;
//# sourceMappingURL=crowns.d.ts.map