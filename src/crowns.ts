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
 * @module @anglenaris/dsh-games/crowns
 */

/** One crown tier. */
export interface CrownLevel {
  /** Stable id (also the locale key base). */
  id: string
  /** Base metal color. */
  metal: string
  /** Light shade (gradient top / orb). */
  light: string
  /** Dark shade (gradient bottom / band). */
  dark: string
  /** True for the magic tier: render with the enchantment glint. */
  magic: boolean
}

/** Default crown step: one bronze crown per 1M usage tokens (server rules). */
export const DEFAULT_CROWN_TOKEN_STEP = 1_000_000

/** Default crafting base: `base` crowns of one level = 1 of the next (3). */
export const DEFAULT_CROWN_BASE = 3

/** All ten crown levels, lowest first. */
export const CROWN_LEVELS: readonly CrownLevel[] = [
  { id: 'bronze', metal: '#cd7f32', light: '#e9b57f', dark: '#8a5a1e', magic: false },
  { id: 'silver', metal: '#c4cad4', light: '#f0f3f8', dark: '#8b93a3', magic: false },
  { id: 'gold', metal: '#f0c53c', light: '#ffe28a', dark: '#b8860b', magic: false },
  { id: 'platinum', metal: '#d5e6f5', light: '#f6fbff', dark: '#93b3cf', magic: false },
  { id: 'amethyst', metal: '#a06ee8', light: '#cda9f8', dark: '#6a3fb8', magic: false },
  { id: 'magic-bronze', metal: '#cd7f32', light: '#e9b57f', dark: '#8a5a1e', magic: true },
  { id: 'magic-silver', metal: '#c4cad4', light: '#f0f3f8', dark: '#8b93a3', magic: true },
  { id: 'magic-gold', metal: '#f0c53c', light: '#ffe28a', dark: '#b8860b', magic: true },
  { id: 'magic-platinum', metal: '#d5e6f5', light: '#f6fbff', dark: '#93b3cf', magic: true },
  { id: 'magic-amethyst', metal: '#a06ee8', light: '#cda9f8', dark: '#6a3fb8', magic: true },
] as const

/** How many crown levels exist (10). */
export const CROWN_LEVEL_COUNT = CROWN_LEVELS.length

/** Safe accessor for one level. */
export function crownLevel(index: number): CrownLevel {
  return CROWN_LEVELS[Math.max(0, Math.min(CROWN_LEVEL_COUNT - 1, Math.floor(index)))]
}

/** Total crown units earned from a lifetime token total. */
export function crownUnits(tokens: number, step: number): number {
  const safeStep = Math.max(1, Math.round(step))
  return Math.max(0, Math.floor((Number.isFinite(tokens) ? tokens : 0) / safeStep))
}

/**
 * Decompose crown units into per-level counts. Base `base` (default 3): that
 * many crowns of one level are exactly 1 of the next, so each level holds
 * 0..base-1 crowns. Any overflow beyond the top level stays in the top level.
 * BigInt keeps the division exact for very large ledgers.
 */
export function crownCounts(units: number, base: number = DEFAULT_CROWN_BASE): number[] {
  const counts = new Array<number>(CROWN_LEVEL_COUNT).fill(0)
  if (!Number.isFinite(units) || units <= 0) return counts
  const radix = Math.max(2, Math.round(base))
  let rest = BigInt(Math.floor(units))
  for (let i = 0; i < CROWN_LEVEL_COUNT - 1; i += 1) {
    counts[i] = Number(rest % BigInt(radix))
    rest /= BigInt(radix)
  }
  counts[CROWN_LEVEL_COUNT - 1] += Number(rest)
  return counts
}

/** Sum of all crowns across levels (display badge). */
export function crownTotal(counts: readonly number[]): number {
  return counts.reduce((sum, count) => sum + Math.max(0, Math.round(count)), 0)
}

/** Highest level with at least one crown; -1 when there are none. */
export function topCrownLevel(counts: readonly number[]): number {
  for (let i = CROWN_LEVEL_COUNT - 1; i >= 0; i -= 1) {
    if (counts[i] > 0) return i
  }
  return -1
}

/** Display tier summary like "黄金王冠 ×2 白银 ×3": the top level with count. */
export function crownSummary(counts: readonly number[]): { level: number; count: number } | null {
  const level = topCrownLevel(counts)
  if (level < 0) return null
  return { level, count: counts[level] }
}
